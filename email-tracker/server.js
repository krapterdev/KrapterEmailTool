require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const Imap = require("imap");
const cors = require("cors");
const { simpleParser } = require("mailparser");
const { randomUUID: uuidv4 } = require("crypto");

// PRISMA CLIENT SETUP
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const app = express();

// ─── CORS SETUP (Sahi wala) ───────────────────────────────────
const allowedOrigins = [
  "https://krapter-email-tool.vercel.app",
  "https://krapter-email-tool-f51hbtklo-krapters-projects.vercel.app/",
  // , 'http://localhost:3000',
  // 'http://localhost:5173'
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// ─── SMTP TRANSPORTER ─────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
  dnsV11: false,
  tls: {
    rejectUnauthorized: false,
    minVersion: "TLSv1.2",
  },
});

transporter.verify((err) => {
  if (err) console.error("❌ SMTP Error:", err.message);
  else console.log("✅ SMTP Ready");
});

// ─── ROUTES ───────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.send("Email Tracker API is running 🚀");
});

// 1. EMAIL BHEJO
app.post("/api/send", async (req, res) => {
  const { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res
      .status(400)
      .json({ error: "To, Subject aur Body required hain" });
  }

  const emailId = uuidv4();
  const pixelUrl = `${process.env.BASE_URL}/track/${emailId}/pixel.gif`;

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#333;">
      ${body.replace(/\n/g, "<br/>")}
    </div>
    <img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;opacity:0;" alt="" />
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Email Tracker" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: htmlBody,
    });

    await prisma.email.create({
      data: {
        id: emailId,
        toEmail: to,
        subject: subject,
        body: body,
        messageId: info.messageId,
        status: "delivered",
        sentAt: new Date(),
      },
    });

    console.log(`📧 Sent to: ${to}`);
    res.json({ success: true, emailId });
  } catch (err) {
    console.error("Send Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. TRACKING PIXEL
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);
const BOT_PATTERNS = [/bot/i, /Googlebot/i, /Outlook/i, /scanner/i, /proxy/i];

app.get("/track/:emailId/pixel.gif", async (req, res) => {
  const { emailId } = req.params;
  const ua = req.headers["user-agent"] || "";
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  const isBot = BOT_PATTERNS.some((p) => p.test(ua));

  if (!isBot && emailId) {
    try {
      await prisma.open.create({
        data: {
          emailId: emailId,
          userAgent: ua,
          ip: ip,
          openedAt: new Date(),
        },
      });

      await prisma.email.update({
        where: { id: emailId },
        data: {
          openCount: { increment: 1 },
          lastOpened: new Date(),
          status: "opened",
        },
      });
      console.log(`👁️ Open detected: ${emailId}`);
    } catch (err) {
      console.error("Pixel Update Error:", err.message);
    }
  }

  res.set({
    "Content-Type": "image/gif",
    "Content-Length": PIXEL.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  });
  res.end(PIXEL);
});

// 3. FETCH EMAILS
app.get("/api/emails", async (req, res) => {
  try {
    const emails = await prisma.email.findMany({
      orderBy: { sentAt: "desc" },
    });
    res.json(emails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. EMAIL DETAIL
app.get("/api/emails/:id", async (req, res) => {
  try {
    const email = await prisma.email.findUnique({
      where: { id: req.params.id },
      include: { opens: { orderBy: { openedAt: "desc" } } },
    });
    if (!email) return res.status(404).json({ error: "Not found" });
    res.json({ email, opens: email.opens });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. STATS
app.get("/api/stats", async (req, res) => {
  try {
    const [total, delivered, opened, replied, totalOpens] = await Promise.all([
      prisma.email.count(),
      prisma.email.count({ where: { status: "delivered" } }),
      prisma.email.count({ where: { status: "opened" } }),
      prisma.email.count({ where: { status: "replied" } }),
      prisma.email.aggregate({ _sum: { openCount: true } }),
    ]);
    res.json({
      total,
      delivered,
      opened,
      replied,
      total_opens: totalOpens._sum.openCount || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. DELETE
app.delete("/api/emails/:id", async (req, res) => {
  try {
    await prisma.email.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. IMAP REPLY SCANNER (Logic same, Prisma optimized)
async function scanReplies() {
  console.log("🔍 Checking for replies...");
  const imap = new Imap({
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASS,
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT) || 993,
    tls: true,
    tlsOptions: {
      servername: process.env.IMAP_HOST,
      rejectUnauthorized: false,
    },
  });

  imap.once("ready", () => {
    imap.openBox("INBOX", true, (err) => {
      if (err) {
        imap.end();
        return;
      }
      const since = new Date();
      since.setDate(since.getDate() - 2);

      imap.search(["ALL", ["SINCE", since]], (err, uids) => {
        if (err || !uids?.length) {
          imap.end();
          return;
        }
        const f = imap.fetch(uids, {
          bodies: "HEADER.FIELDS (IN-REPLY-TO REFERENCES)",
        });

        f.on("message", (msg) => {
          let headerData = "";
          msg.on("body", (stream) => {
            stream.on("data", (c) => (headerData += c.toString()));
            stream.once("end", () => {
              simpleParser(headerData, async (err, parsed) => {
                const ref =
                  (parsed?.references || []).join(" ") +
                  (parsed?.inReplyTo || "");
                if (!ref) return;

                const pendingEmails = await prisma.email.findMany({
                  where: { repliedAt: null, NOT: { messageId: null } },
                });

                for (const email of pendingEmails) {
                  const cleanId = email.messageId.replace(/[<>]/g, "");
                  if (ref.includes(cleanId)) {
                    await prisma.email.update({
                      where: { id: email.id },
                      data: { status: "replied", repliedAt: new Date() },
                    });
                    console.log(`↩️ Reply matched: ${email.toEmail}`);
                  }
                }
              });
            });
          });
        });
        f.once("end", () => imap.end());
      });
    });
  });
  imap.connect();
}

setInterval(scanReplies, 5 * 60 * 1000); // 5 min interval

// ─── START SERVER ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server on: ${PORT}`);
});
