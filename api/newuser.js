// New-user alert. A Supabase Database Webhook fires this on every INSERT into `devices`
// (a genuinely new install — returning devices are UPDATEs and don't trigger it), and we send
// the owner a Telegram message. Config lives in Vercel env; nothing secret is in this file.
//
// Vercel env needed:
//   TG_BOT_TOKEN     - a Telegram bot token (e.g. @streamgd_bot's)
//   TG_CHAT_ID       - the owner's Telegram chat id to message
//   NEWUSER_SECRET   - any random string; the webhook must send it as header x-newuser-secret
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Only Supabase's webhook (which knows the secret) may trigger a message — stops randoms
  // from spamming the owner by hitting this URL.
  const secret = process.env.NEWUSER_SECRET;
  if (secret && req.headers['x-newuser-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = process.env.TG_BOT_TOKEN;
  const chat = process.env.TG_CHAT_ID;
  if (!token || !chat) return res.status(500).json({ error: 'Telegram not configured' });

  // Supabase webhook payload shape: { type:'INSERT', table:'devices', record:{...} }.
  const rec = (req.body && (req.body.record || req.body)) || {};
  const name = rec.name || 'Someone';
  const platform = rec.platform || '?';
  const version = rec.version || '?';
  const id = (rec.id || '').toString().slice(0, 12);
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const appLabel = {
    android: 'StreamGarden Android', windows: 'StreamGarden PC', mac: 'StreamGarden Mac',
    web: 'Web', copyeye: 'CopyEye', 'truevault-android': 'TrueVault',
  }[platform] || platform;

  const text =
    `🌱 *New user on StreamGarden!*\n\n` +
    `👤 ${name}\n` +
    `📱 ${appLabel} · v${version}\n` +
    `🆔 ${id}…\n` +
    `🕒 ${when}`;

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(502).json({ error: 'telegram rejected', status: r.status });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'telegram failed' });
  }
}
