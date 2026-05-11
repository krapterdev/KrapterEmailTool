require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

// PRISMA CLIENT SETUP
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();
app.use(cors());
app.use(express.json());

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

transporter.verify((err, success) => {
  if (err) console.error('❌ SMTP Error:', err.message);
  else console.log('✅ SMTP Ready');
});

// ─────────────────────────────────────────
// 1. EMAIL BHEJO (Prisma Version)
// ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('Email Tracker API is running');
});

app.post('/api/send', async (req, res) => {
  const { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Data required hain' });
  }

  const emailId = uuidv4();
  const pixelUrl = `${process.env.BASE_URL}/track/${emailId}/pixel.gif`;

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#333;">
      ${body.replace(/\n/g, '<br/>')}
    </div>
    <img src="${pixelUrl}" width="1" height="1" style="display:none;" />
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Email Tracker" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: htmlBody,
    });

    // PRISMA INSERT
    await prisma.email.create({
      data: {
        id: emailId,
        toEmail: to,
        subject: subject,
        body: body,
        messageId: info.messageId,
        status: 'delivered'
      }
    });

    res.json({ success: true, emailId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────
// 2. TRACKING PIXEL (Prisma Version)
// ─────────────────────────────────────────
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const BOT_PATTERNS = [/Googlebot/i, /Bingbot/i, /Outlook/i, /bot/i];

app.get('/track/:emailId/pixel.gif', async (req, res) => {
  const { emailId } = req.params;
  const ua = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const isBot = BOT_PATTERNS.some(p => p.test(ua));

  if (!isBot && emailId) {
    try {
      // Create Open Entry
      await prisma.open.create({
        data: {
          emailId: emailId,
          userAgent: ua,
          ip: ip
        }
      });

      // Update Email Stats
      await prisma.email.update({
        where: { id: emailId },
        data: {
          openCount: { increment: 1 },
          lastOpened: new Date(),
          firstOpened: { set: new Date() }, // Note: Logic logic handles existing in DB better
          status: 'opened'
        }
      });
    } catch (err) {
      console.error('Track error:', err.message);
    }
  }

  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  });
  res.end(PIXEL);
});

// ─────────────────────────────────────────
// 3. API ENDPOINTS (Prisma Version)
// ─────────────────────────────────────────

// GET ALL EMAILS
app.get('/api/emails', async (req, res) => {
  const emails = await prisma.email.findMany({ orderBy: { sentAt: 'desc' } });
  res.json(emails);
});

// GET STATS
app.get('/api/stats', async (req, res) => {
  const total = await prisma.email.count();
  const opened = await prisma.email.count({ where: { status: 'opened' } });
  const delivered = await prisma.email.count({ where: { status: 'delivered' } });
  
  res.json({ total, opened, delivered });
});

// DELETE EMAIL
app.delete('/api/emails/:id', async (req, res) => {
  await prisma.email.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ─────────────────────────────────────────
// SERVER START
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server on: ${PORT}`);
});