// Step 2 of the ₹99/year Premium purchase: verify the Razorpay payment signature (server-side,
// with the key_secret) and, only if genuine, turn on premium for that device for 1 year. Uses
// the Supabase service_role key to set premium/premium_until on the devices row — that key is
// server-only and never touches the app.
//
// Vercel env needed:  RAZORPAY_KEY_SECRET , SUPABASE_SERVICE_KEY
import crypto from 'crypto';

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const SUPA = 'https://befdjbbzuyzjlyrckkxj.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!KEY_SECRET || !SERVICE) return res.status(500).json({ error: 'Payments not configured' });

  const b = req.body || {};
  const orderId = b.razorpay_order_id, payId = b.razorpay_payment_id, sig = b.razorpay_signature;
  const deviceId = b.device_id;
  const accountId = b.account_id;   // the signed-in user's id (uuid) — premium follows the account
  if (!orderId || !payId || !sig || (!deviceId && !accountId)) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // Razorpay signs `order_id|payment_id` with your key_secret. Recompute and compare — a wrong
  // or forged signature means the payment did not really happen.
  const expected = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${payId}`).digest('hex');
  const a = Buffer.from(expected), c = Buffer.from(String(sig));
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) {
    return res.status(400).json({ error: 'Payment could not be verified' });
  }

  // Genuine payment → grant 1 year of premium. Prefer the ACCOUNT (premium then follows the
  // user's email across every device); fall back to the device if no account was signed in.
  const until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const target = accountId
    ? `profiles?id=eq.${encodeURIComponent(accountId)}`
    : `devices?id=eq.${encodeURIComponent(deviceId)}`;
  try {
    const r = await fetch(`${SUPA}/rest/v1/${target}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify({ premium: true, premium_until: until }),
      signal: AbortSignal.timeout(9000),
    });
    const rows = await r.json().catch(() => []);
    if (!r.ok) return res.status(502).json({ error: 'Paid, but activating premium failed — contact support' });

    // Log the purchase so it shows in the admin panel (best-effort — never fail the response on it).
    const email = (Array.isArray(rows) && rows[0] && rows[0].email) || b.email || null;
    try {
      await fetch(`${SUPA}/rest/v1/purchases`, {
        method: 'POST',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          account_id: accountId || null, email, device_id: deviceId || null, app: b.app || null,
          amount: 99, payment_id: payId, order_id: orderId, premium_until: until,
        }),
        signal: AbortSignal.timeout(6000),
      });
    } catch { /* the payment + premium already succeeded; the log is secondary */ }

    if (!Array.isArray(rows) || rows.length === 0) {
      // Row not found (account/device not registered yet). Rare — happens on launch/first login.
      return res.status(200).json({ ok: true, premium: true, premium_until: until, note: 'reopen/re-login to sync' });
    }
    return res.status(200).json({ ok: true, premium: true, premium_until: until, scope: accountId ? 'account' : 'device' });
  } catch (e) {
    return res.status(502).json({ error: 'Paid, but activating premium failed — contact support' });
  }
}
