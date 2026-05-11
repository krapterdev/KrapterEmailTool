require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────
// DATABASE SETUP
// ─────────────────────────────────────────
const db = new sqlite3.Database('./tracker.db', (err) => {
  if (err) console.error('DB Error:', err);
  else console.log('✅ Database connected');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS emails (
    id          TEXT PRIMARY KEY,
    to_email    TEXT,
    subject     TEXT,
    body        TEXT,
    sent_at     TEXT,
    message_id  TEXT,
    status      TEXT DEFAULT 'sent',
    open_count  INTEGER DEFAULT 0,
    first_opened TEXT,
    last_opened  TEXT,
    replied_at   TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS opens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id   TEXT,
    opened_at  TEXT,
    user_agent TEXT,
    ip         TEXT
  )`);
});

// ─────────────────────────────────────────
// SMTP TRANSPORTER
// ─────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false }
});

// SMTP connection test at startup
transporter.verify((err, success) => {
  if (err) console.error('❌ SMTP Error:', err.message);
  else console.log('✅ SMTP Ready — emails bhej sakte ho');
});

// ─────────────────────────────────────────
// 1. EMAIL BHEJO
// ─────────────────────────────────────────
app.post('/api/send', async (req, res) => {
  const { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject, aur body required hain' });
  }

  const emailId  = uuidv4();
  const pixelUrl = `${process.env.BASE_URL}/track/${emailId}/pixel.gif`;

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#333;">
      ${body.replace(/\n/g, '<br/>')}
    </div>
    <img src="${pixelUrl}" width="1" height="1"
         style="display:none;width:1px;height:1px;opacity:0;" alt="" />
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Email Tracker" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: htmlBody,
    });

    db.run(
      `INSERT INTO emails (id, to_email, subject, body, sent_at, message_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'delivered')`,
      [emailId, to, subject, body, new Date().toISOString(), info.messageId]
    );

    console.log(`📧 Email bheja: ${to} | ID: ${emailId}`);
    res.json({ success: true, emailId, messageId: info.messageId });

  } catch (err) {
    console.error('❌ Send failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────
// 2. PIXEL TRACKING — OPEN DETECT KARO
// ─────────────────────────────────────────
// Yeh 1x1 transparent GIF hai — bilkul invisible
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// Yeh User-Agents bots/scanners ke hain — inhe ignore karo
const BOT_PATTERNS = [
  /Googlebot/i, /Google-Apps-Script/i, /Bingbot/i,
  /Slackbot/i, /facebookexternalhit/i, /Twitterbot/i,
  /LinkedInBot/i, /Baiduspider/i, /YandexBot/i,
  /mail\.ru/i, /preview/i, /prefetch/i, /scanner/i,
  /proxy/i, /crawl/i, /spider/i, /bot/i,
  /Outlook/i, /microsoft/i, /MailChimp/i,
];

app.get('/track/:emailId/pixel.gif', (req, res) => {
  const { emailId } = req.params;
  const ua  = req.headers['user-agent'] || '';
  const ip  = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const now = new Date().toISOString();

  const isBot = BOT_PATTERNS.some(p => p.test(ua));

  if (!isBot && emailId) {
    // Opens table mein save karo
    db.run(
      `INSERT INTO opens (email_id, opened_at, user_agent, ip) VALUES (?, ?, ?, ?)`,
      [emailId, now, ua, ip]
    );

    // Email record update karo
    db.run(
      `UPDATE emails SET
        open_count   = open_count + 1,
        last_opened  = ?,
        first_opened = COALESCE(first_opened, ?),
        status       = CASE WHEN status != 'replied' THEN 'opened' ELSE status END
       WHERE id = ?`,
      [now, now, emailId]
    );

    console.log(`👁️  Email open: ${emailId} | IP: ${ip}`);
  }

  // GIF bhejo — cache disable karo taaki har open track ho
  res.set({
    'Content-Type':  'image/gif',
    'Content-Length': PIXEL.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma':        'no-cache',
    'Expires':       '0',
  });
  res.end(PIXEL);
});

// ─────────────────────────────────────────
// 3. SAARI EMAILS LIST
// ─────────────────────────────────────────
app.get('/api/emails', (req, res) => {
  db.all(
    `SELECT * FROM emails ORDER BY sent_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// ─────────────────────────────────────────
// 4. EK EMAIL KI DETAIL + OPEN HISTORY
// ─────────────────────────────────────────
app.get('/api/emails/:id', (req, res) => {
  db.get(
    `SELECT * FROM emails WHERE id = ?`,
    [req.params.id],
    (err, email) => {
      if (err || !email) return res.status(404).json({ error: 'Email nahi mili' });
      db.all(
        `SELECT * FROM opens WHERE email_id = ? ORDER BY opened_at DESC`,
        [req.params.id],
        (err2, opens) => {
          res.json({ email, opens: opens || [] });
        }
      );
    }
  );
});

// ─────────────────────────────────────────
// 5. STATS — Dashboard ke liye
// ─────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  db.get(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status='opened'    THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN status='replied'   THEN 1 ELSE 0 END) as replied,
      SUM(open_count) as total_opens
     FROM emails`,
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row);
    }
  );
});

// ─────────────────────────────────────────
// 6. EMAIL DELETE KARO
// ─────────────────────────────────────────
app.delete('/api/emails/:id', (req, res) => {
  db.run(`DELETE FROM opens  WHERE email_id = ?`, [req.params.id]);
  db.run(`DELETE FROM emails WHERE id = ?`,       [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ─────────────────────────────────────────
// 7. IMAP REPLY SCANNER — Background Job
// ─────────────────────────────────────────
function scanReplies() {
  console.log('🔍 Reply scan chal raha hai...');

  const imap = new Imap({
    user:       process.env.IMAP_USER,
    password:   process.env.IMAP_PASS,
    host:       process.env.IMAP_HOST,
    port:       parseInt(process.env.IMAP_PORT) || 993,
    tls:        true,
    tlsOptions: { servername: process.env.IMAP_HOST, rejectUnauthorized: false },
    connTimeout: 10000,
    authTimeout: 10000,
  });

  imap.once('ready', () => {
    imap.openBox('INBOX', true, (err) => {
      if (err) { console.error('IMAP box error:', err.message); imap.end(); return; }

      // Last 2 din ki emails check karo
      const since = new Date();
      since.setDate(since.getDate() - 2);

      imap.search(['ALL', ['SINCE', since]], (err, uids) => {
        if (err || !uids || !uids.length) {
          console.log('📭 Koi naya reply nahi mila');
          imap.end();
          return;
        }

        const f = imap.fetch(uids, { bodies: 'HEADER.FIELDS (IN-REPLY-TO REFERENCES)' });

        f.on('message', (msg) => {
          let headerData = '';

          msg.on('body', (stream) => {
            stream.on('data', chunk => { headerData += chunk.toString('utf8'); });
            stream.once('end', () => {
              simpleParser(headerData, (err, parsed) => {
                if (!parsed) return;

                const inReplyTo  = parsed.inReplyTo  || '';
                const references = Array.isArray(parsed.references)
                  ? parsed.references.join(' ')
                  : (parsed.references || '');

                if (!inReplyTo && !references) return;

                db.all(`SELECT id, message_id FROM emails WHERE replied_at IS NULL`, [], (err, emails) => {
                  if (!emails) return;
                  emails.forEach(email => {
                    if (!email.message_id) return;
                    const msgId = email.message_id.replace(/[<>]/g, '');
                    if (inReplyTo.includes(msgId) || references.includes(msgId)) {
                      db.run(
                        `UPDATE emails SET status = 'replied', replied_at = ? WHERE id = ?`,
                        [new Date().toISOString(), email.id]
                      );
                      console.log(`↩️  Reply mila! Email ID: ${email.id}`);
                    }
                  });
                });
              });
            });
          });
        });

        f.once('end', () => {
          console.log('✅ Reply scan complete');
          imap.end();
        });

        f.once('error', (err) => {
          console.error('Fetch error:', err.message);
          imap.end();
        });
      });
    });
  });

  imap.once('error', (err) => console.error('❌ IMAP Error:', err.message));
  imap.once('end',   ()  => console.log('IMAP connection closed'));
  imap.connect();
}

// Startup pe ek baar, phir har 3 minute mein
setTimeout(scanReplies, 5000);
setInterval(scanReplies, 3 * 60 * 1000);

// ─────────────────────────────────────────
// SERVER START
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Email Tracker Server: http://localhost:${PORT}`);
  console.log(`📊 Dashboard API ready\n`);
});