// Emails the owner the moment a new StreamGarden install or account appears.
//
// Database triggers (ADMIN-V2.sql §5) POST {kind:'install', id} or {kind:'account', email} here.
// We only alert for a row that really is brand new (looked up with the service key, created in the
// last 10 minutes) — so the public URL can't be used to spam the owner. Mail goes out through the
// same Gmail login as the welcome email (private app_secrets table), to app_secrets.owner_email.
//
// ponytail: one email per event; past 100 new installs in a day the per-install mails stop (Gmail
// allows ~500/day and the welcome mails need room) — switch to a daily digest if growth gets there.
//
// Vercel env needed: SUPABASE_SERVICE_KEY (already set).
import nodemailer from 'nodemailer';

const SUPA = 'https://befdjbbzuyzjlyrckkxj.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const SG = 'android,windows,mac,web,pc,streamgarden-android,streamgarden-pc';
const hdr = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fresh = (iso) => iso && Date.now() - new Date(iso).getTime() < 10 * 60 * 1000;

async function get(path) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: hdr, signal: AbortSignal.timeout(8000) });
  return r.ok ? r.json() : [];
}
// Row count without fetching rows (PostgREST returns it in Content-Range: 0-0/<total>).
async function count(path) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: { ...hdr, Prefer: 'count=exact', Range: '0-0' }, signal: AbortSignal.timeout(8000) });
  return Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!SERVICE) return res.status(500).json({ error: 'not configured' });
  const b = req.body || {};
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  let subject, lines;

  if (b.kind === 'install') {
    const [d] = await get(`devices?id=eq.${encodeURIComponent(String(b.id || ''))}&select=id,name,platform,version,email,first_seen&limit=1`);
    if (!d || !fresh(d.first_seen) || !SG.split(',').includes(d.platform)) return res.status(200).json({ skipped: 'not a new StreamGarden install' });
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const today = await count(`devices?select=id&platform=in.(${SG})&first_seen=gte.${since}`);
    if (today > 100) return res.status(200).json({ skipped: 'daily alert cap' });
    const total = await count(`devices?select=id&platform=in.(${SG})`);
    subject = `🌱 New StreamGarden install (#${total})`;
    lines = [['Platform', d.platform], ['Version', `v${d.version || '?'}`], ['Name', d.name || '— (not set yet)'],
      ['Account', d.email || '— (not signed in)'], ['Installs in last 24h', today], ['Total installs', total]];
  } else if (b.kind === 'account') {
    const [p] = await get(`profiles?email=eq.${encodeURIComponent(String(b.email || ''))}&select=email,name,created_at&limit=1`);
    if (!p || !fresh(p.created_at)) return res.status(200).json({ skipped: 'not a new account' });
    const total = await count('profiles?select=id');
    subject = `👤 New StreamGarden account: ${p.name || p.email}`;
    lines = [['Name', p.name || '—'], ['Email', p.email], ['Total accounts', total]];
  } else {
    return res.status(400).json({ error: 'unknown kind' });
  }

  const sec = await get('app_secrets?select=key,value&key=in.(smtp_user,smtp_pass,owner_email)');
  const s = (k) => (sec.find((x) => x.key === k) || {}).value;
  const user = s('smtp_user'), pass = (s('smtp_pass') || '').replace(/\s+/g, ''), to = s('owner_email') || user;
  if (!user || !pass || !to) return res.status(500).json({ error: 'SMTP not configured' });

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">
    <h3 style="margin:0 0 10px">${esc(subject)}</h3>
    <table style="border-collapse:collapse;font-size:14px">${lines.map(([k, v]) =>
      `<tr><td style="padding:4px 14px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('')}
      <tr><td style="padding:4px 14px 4px 0;color:#666">When</td><td>${esc(when)}</td></tr></table>
    <p style="font-size:12px;color:#888;margin-top:14px">Open the admin panel (5-tap) → Overview / Users for details.</p></div>`;
  try {
    await nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
      .sendMail({ from: `"StreamGarden alerts" <${user}>`, to, subject, html });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'send failed' });
  }
}
