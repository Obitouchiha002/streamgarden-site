// Daily keep-alive. Vercel Cron (see vercel.json "crons") hits this once a day; it pings the
// master Supabase so the free-tier project never auto-pauses from inactivity. Keeps the whole
// registry permanent on the free plan — no Pro needed.
const SUPA = 'https://befdjbbzuyzjlyrckkxj.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlZmRqYmJ6dXl6amx5cmNra3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDIyNjYsImV4cCI6MjA5OTU3ODI2Nn0.OLJterEVLS2zIKsFv2tAZmgU0TxwXxRbfeE_sEEkHj4';

export default async function handler(req, res) {
  try {
    const r = await fetch(`${SUPA}/rest/v1/rpc/checkin`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_id: 'keepalive-cron', p_name: 'keepalive', p_version: '1.0', p_platform: 'web', p_email: null,
      }),
      signal: AbortSignal.timeout(9000),
    });
    return res.status(200).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'supabase unreachable (maybe paused)' });
  }
}
