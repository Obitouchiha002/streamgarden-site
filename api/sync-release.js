// Copies the website's release.json into app_config.latest_version_android, so installs older
// than the release.json-aware app (which learn about updates from check-in) are offered the new
// version too. It only ever publishes what release.json already says publicly and never lowers
// the version, so it needs no secret. Called by streamgarden-android/ship.sh after each release.
//
// Vercel env needed: SUPABASE_SERVICE_KEY (already set).
const SUPA = 'https://befdjbbzuyzjlyrckkxj.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

const newer = (a, b) => {   // true if version a > version b
  const x = String(a).split('.').map(Number), y = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
};

export default async function handler(req, res) {
  if (!SERVICE) return res.status(500).json({ error: 'not configured' });
  try {
    const rel = await (await fetch(`https://streamgd.lzworth.in/release.json?t=${Date.now()}`)).json();
    if (!/^\d+(\.\d+)*$/.test(String(rel.version))) return res.status(400).json({ error: 'bad release.json' });

    const [cfg] = await (await fetch(`${SUPA}/rest/v1/app_config?id=eq.1&select=latest_version_android`, { headers: svc })).json();
    if (cfg && !newer(rel.version, cfg.latest_version_android)) {
      return res.status(200).json({ ok: true, version: cfg.latest_version_android, unchanged: true });
    }
    const r = await fetch(`${SUPA}/rest/v1/app_config?id=eq.1`, {
      method: 'PATCH', headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify({ latest_version_android: rel.version }),
    });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, version: rel.version });
  } catch {
    return res.status(502).json({ error: 'sync failed' });
  }
}
