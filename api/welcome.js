// Welcome email for a new StreamGarden account.
//
// A trigger on `profiles` (WELCOME-EMAIL.sql) POSTs {record:{email,name}} here for every new
// account. We only mail an address that really is a brand-new account (looked up with the service
// key, created in the last 10 minutes) — that's what stops this URL being used to spam people, so
// no shared webhook secret is needed. Gmail credentials live in the private `app_secrets` table
// (RLS on, no policies → only the service key can read it); SMTP_USER/SMTP_PASS env vars, if set,
// take precedence.
//
// Vercel env needed: SUPABASE_SERVICE_KEY (already set for payments).
import nodemailer from 'nodemailer';

const SUPA = 'https://befdjbbzuyzjlyrckkxj.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sb(path) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }, signal: AbortSignal.timeout(8000),
  });
  return r.ok ? r.json() : [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!SERVICE) return res.status(500).json({ error: 'not configured' });

  const rec = (req.body && (req.body.record || req.body)) || {};
  const email = String(rec.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(200).json({ skipped: 'no email' });

  // Only genuine, brand-new accounts get mail.
  const [p] = await sb(`profiles?email=eq.${encodeURIComponent(email)}&select=email,name,created_at&limit=1`);
  if (!p || Date.now() - new Date(p.created_at).getTime() > 10 * 60 * 1000) {
    return res.status(200).json({ skipped: 'not a new account' });
  }

  const secrets = await sb('app_secrets?select=key,value&key=in.(smtp_user,smtp_pass)');
  const get = (k) => (secrets.find((s) => s.key === k) || {}).value;
  const user = process.env.SMTP_USER || get('smtp_user');
  const pass = (process.env.SMTP_PASS || get('smtp_pass') || '').replace(/\s+/g, '');
  if (!user || !pass) return res.status(500).json({ error: 'SMTP not configured' });

  const name = esc(p.name || email.split('@')[0]);
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;background:#0d1108;color:#EAEFE0;border-radius:18px;padding:28px">
    <h2 style="margin:0 0 6px;color:#AEC98A">Welcome to StreamGarden, ${name} 🌱</h2>
    <p style="color:#C6D0B8;line-height:1.6">Thanks for joining! StreamGarden is completely free — download videos in HD, 4K and MP3 from YouTube, Instagram, TikTok and more.</p>
    <p style="margin:22px 0"><a href="https://streamgd.lzworth.in/app" style="background:#AEC98A;color:#0d0f08;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">Open StreamGarden</a></p>
    <p style="color:#9BA891;font-size:13px">Get the Android app: <a href="https://streamgd.lzworth.in/StreamGarden.apk" style="color:#AEC98A">download APK</a></p>
    <p style="color:#6f7a66;font-size:12px;margin-top:24px">You're receiving this because you created a StreamGarden account. Please use StreamGarden for your own personal use and respect creators' copyright.</p>
  </div>`;

  try {
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    await t.sendMail({ from: `"StreamGarden" <${user}>`, to: email, subject: 'Welcome to StreamGarden 🌱', html });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'send failed' });
  }
}
