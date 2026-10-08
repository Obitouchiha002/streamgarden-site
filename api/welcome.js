// Welcome email for a new StreamGarden account. A Supabase Database Webhook fires this on every
// INSERT into `profiles` (exactly one row per new account) and we email the user a short welcome.
//
// Vercel env needed:
//   SMTP_USER       - the Gmail address that sends (same one as Supabase's custom SMTP)
//   SMTP_PASS       - its Gmail App Password (16 letters)
//   WELCOME_SECRET  - any random string; the webhook must send it as header x-welcome-secret
import nodemailer from 'nodemailer';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  // Only Supabase's webhook (which knows the secret) may trigger mail — stops this URL being used
  // to spam arbitrary addresses.
  if (!process.env.WELCOME_SECRET || req.headers['x-welcome-secret'] !== process.env.WELCOME_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return res.status(500).json({ error: 'SMTP not configured' });

  const rec = (req.body && (req.body.record || req.body)) || {};
  const to = String(rec.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(200).json({ skipped: 'no email' });
  const name = esc(rec.name || to.split('@')[0]);

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;background:#0d1108;color:#EAEFE0;border-radius:18px;padding:28px">
    <h2 style="margin:0 0 6px;color:#AEC98A">Welcome to StreamGarden, ${name} 🌱</h2>
    <p style="color:#C6D0B8;line-height:1.6">Thanks for joining! StreamGarden is completely free — download videos in HD, 4K and MP3 from YouTube, Instagram, TikTok and more.</p>
    <p style="margin:22px 0"><a href="https://streamgd.lzworth.in/app" style="background:#AEC98A;color:#0d0f08;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">Open StreamGarden</a></p>
    <p style="color:#9BA891;font-size:13px">Get the Android app: <a href="https://streamgd.lzworth.in/StreamGarden.apk" style="color:#AEC98A">download APK</a></p>
    <p style="color:#6f7a66;font-size:12px;margin-top:24px">You're receiving this because you created a StreamGarden account. Please use StreamGarden for your own personal use and respect creators' copyright.</p>
  </div>`;

  try {
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await t.sendMail({ from: `"StreamGarden" <${SMTP_USER}>`, to, subject: 'Welcome to StreamGarden 🌱', html });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'send failed' });
  }
}
