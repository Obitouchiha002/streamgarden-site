// Step 1 of the ₹99/year Premium purchase: create a Razorpay order. The app opens Razorpay
// Checkout with the returned order_id; after payment, /api/pay-verify confirms it and turns on
// premium. Keys live in Vercel env (server-side) — the key_secret never reaches the app.
//
// Vercel env needed:  RAZORPAY_KEY_ID , RAZORPAY_KEY_SECRET
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const AMOUNT_PAISE = 9900; // ₹99

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!KEY_ID || !KEY_SECRET) return res.status(500).json({ error: 'Payments not configured' });

  const device = String((req.body && req.body.device_id) || 'unknown').slice(0, 40);
  const app = String((req.body && req.body.app) || '').slice(0, 30);
  try {
    const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: AMOUNT_PAISE,
        currency: 'INR',
        receipt: `sg_${device}_${Date.now()}`.slice(0, 40),
        notes: { device, app, plan: 'premium-1yr' },
      }),
      signal: AbortSignal.timeout(9000),
    });
    const order = await r.json().catch(() => null);
    if (!r.ok || !order || !order.id) {
      return res.status(502).json({ error: 'Could not start payment', detail: order && order.error && order.error.description });
    }
    // key_id is public (needed by Checkout on the client); amount is echoed for the modal.
    return res.status(200).json({ order_id: order.id, key_id: KEY_ID, amount: AMOUNT_PAISE, currency: 'INR' });
  } catch (e) {
    return res.status(502).json({ error: 'Could not start payment' });
  }
}
