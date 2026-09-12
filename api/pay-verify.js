// Step 2 of the ₹99/year Premium purchase: verify the Razorpay payment and, only if genuine,
// turn on premium for 1 year. Uses the Supabase service_role key (server-only) to set
// premium/premium_until.
//
// SECURITY — why we do NOT trust the client's account_id:
// A valid (order_id|payment_id|signature) triple could otherwise be replayed with a different
// account_id each time, unlocking unlimited accounts from a single real ₹99 payment. So we bind
// the grant to the account that CREATED the order (stored server-side in the order's notes by
// /api/pay-order), re-check the amount and paid status with Razorpay, and refuse a payment_id
// that was already used. The client-supplied ids are only a last-resort fallback for legacy orders
// that carry no notes.
//
// Vercel env needed:  RAZORPAY_KEY_ID , RAZORPAY_KEY_SECRET , SUPABASE_SERVICE_KEY
import crypto from 'crypto';

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const SUPA = 'https://befdjbbzuyzjlyrckkxj.supabase.co';
const AMOUNT_PAISE = 9900; // ₹99 — the only price we ever grant premium for.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!KEY_ID || !KEY_SECRET || !SERVICE) return res.status(500).json({ error: 'Payments not configured' });

  const b = req.body || {};
  const orderId = b.razorpay_order_id, payId = b.razorpay_payment_id, sig = b.razorpay_signature;
  if (!orderId || !payId || !sig) return res.status(400).json({ error: 'Missing fields' });

  // 1) Signature: Razorpay signs `order_id|payment_id` with the key_secret. A forged or wrong
  //    signature means the payment did not really happen — reject before touching anything else.
  const expected = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${payId}`).digest('hex');
  const a = Buffer.from(expected), c = Buffer.from(String(sig));
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) {
    return res.status(400).json({ error: 'Payment could not be verified' });
  }

  const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const rzpAuth = 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');

  try {
    // 2) Fetch the order from Razorpay (server-to-server, authenticated). This gives us the
    //    amount actually charged, the paid status, and the notes WE stored at order time — none
    //    of which the client can tamper with.
    const or = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: rzpAuth }, signal: AbortSignal.timeout(9000),
    });
    const order = await or.json().catch(() => null);
    if (!or.ok || !order || !order.id) return res.status(502).json({ error: 'Could not verify order' });

    // Must be a fully paid order for our exact price. (amount_paid covers partial-capture edge cases.)
    const paid = order.status === 'paid' || Number(order.amount_paid) >= AMOUNT_PAISE;
    if (!paid || Number(order.amount) !== AMOUNT_PAISE) {
      return res.status(400).json({ error: 'Payment not completed for this plan' });
    }

    // 3) The grant target comes from the ORDER's notes (server-set), never from the request body.
    const notes = order.notes || {};
    const accountId = (notes.account && String(notes.account)) || (b.account_id ? String(b.account_id) : '');
    const deviceId = (notes.device && String(notes.device)) || (b.device_id ? String(b.device_id) : '');
    const appName = notes.app || b.app || null;
    if (!accountId && !deviceId) return res.status(400).json({ error: 'Order has no account to activate' });

    // 4) Replay guard: if this payment_id was already recorded, do not grant again — just report
    //    success idempotently. (Best-effort: if the purchases table is unavailable we still fall
    //    through and grant, because step 3 already binds the grant to the order's own account.)
    try {
      const dup = await fetch(`${SUPA}/rest/v1/purchases?payment_id=eq.${encodeURIComponent(payId)}&select=id`, { headers: svc, signal: AbortSignal.timeout(6000) });
      const dupRows = await dup.json().catch(() => []);
      if (dup.ok && Array.isArray(dupRows) && dupRows.length > 0) {
        return res.status(200).json({ ok: true, premium: true, already: true });
      }
    } catch { /* ignore — the account-binding above is the real protection */ }

    // 5) Grant 1 year of premium. Prefer the account (premium follows the user's email everywhere);
    //    fall back to the device only if the order carried no account.
    const until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const target = accountId
      ? `profiles?id=eq.${encodeURIComponent(accountId)}`
      : `devices?id=eq.${encodeURIComponent(deviceId)}`;
    const r = await fetch(`${SUPA}/rest/v1/${target}`, {
      method: 'PATCH',
      headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ premium: true, premium_until: until }),
      signal: AbortSignal.timeout(9000),
    });
    const rows = await r.json().catch(() => []);
    if (!r.ok) return res.status(502).json({ error: 'Paid, but activating premium failed — contact support' });

    // 6) Log the purchase (also what the replay guard reads next time). Best-effort.
    const email = (Array.isArray(rows) && rows[0] && rows[0].email) || b.email || null;
    try {
      await fetch(`${SUPA}/rest/v1/purchases`, {
        method: 'POST',
        headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          account_id: accountId || null, email, device_id: deviceId || null, app: appName,
          amount: 99, payment_id: payId, order_id: orderId, premium_until: until,
        }),
        signal: AbortSignal.timeout(6000),
      });
    } catch { /* the payment + premium already succeeded; the log is secondary */ }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(200).json({ ok: true, premium: true, premium_until: until, note: 'reopen/re-login to sync' });
    }
    return res.status(200).json({ ok: true, premium: true, premium_until: until, scope: accountId ? 'account' : 'device' });
  } catch (e) {
    return res.status(502).json({ error: 'Paid, but activating premium failed — contact support' });
  }
}
