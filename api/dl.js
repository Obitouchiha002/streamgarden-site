// Download proxy: stream a resolved media file THROUGH our own domain.
//
// Why: the public resolver (Cobalt) hands back a tunnel on a third-party host (co.otomir23.me,
// etc.). Many browsers/networks block those hosts (ad-blockers, ISP/region filters, privacy
// extensions), so the browser gets 0 bytes and media won't even play — while a plain server
// (curl) downloads fine. By resolving server-side and piping the bytes back from
// streamgd.lzworth.in, the browser only ever talks to our own domain, so it always works.
//
// GET /api/dl?url=<page url>&quality=360|720|1080|max&audio=0|1&inline=0|1
export const config = { maxDuration: 60 };

const COBALT = ['https://co.otomir23.me', 'https://co.eepy.today', 'https://dwnld.nichind.dev'];

async function resolveTunnel(url, quality, audio) {
  const body = audio
    ? { url, downloadMode: 'audio', audioFormat: 'mp3' }
    : { url, downloadMode: 'auto', videoQuality: quality };
  for (const base of COBALT) {
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json().catch(() => ({}));
      if ((j.status === 'tunnel' || j.status === 'redirect') && j.url && /^https:\/\//i.test(j.url))
        return { url: j.url, filename: j.filename || `download.${audio ? 'mp3' : 'mp4'}` };
      if (j.status === 'picker' && Array.isArray(j.picker) && j.picker.length) {
        const p = j.picker.find((x) => x.type === 'video') || j.picker[0];
        if (p && p.url) return { url: p.url, filename: `download.${audio ? 'mp3' : 'mp4'}` };
      }
    } catch { /* next instance */ }
  }
  return null;
}

export default async function handler(req, res) {
  const q = req.query || {};
  const url = String(q.url || '');
  const audio = String(q.audio || '') === '1';
  const inline = String(q.inline || '') === '1';
  const quality = ['360', '720', '1080', 'max'].includes(String(q.quality)) ? String(q.quality) : '720';
  if (!/^https?:\/\//i.test(url)) return res.status(400).send('Invalid link');

  const t = await resolveTunnel(url, quality, audio);
  if (!t) return res.status(502).send('Could not fetch this link. It may be private or unsupported.');

  let up;
  try { up = await fetch(t.url, { signal: AbortSignal.timeout(30000) }); }
  catch { return res.status(502).send('Source unavailable, please retry.'); }
  if (!up.ok || !up.body) return res.status(502).send('Source error ' + up.status);

  const fn = (t.filename || (audio ? 'audio.mp3' : 'video.mp4')).replace(/["\\\r\n]/g, '');
  // No Content-Length: the resolver only gives an *estimate*, and a wrong length truncates the
  // download. Chunked (attachment) is handled fine by browsers.
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${fn}"`);
  res.setHeader('Content-Type', up.headers.get('content-type') || (audio ? 'audio/mpeg' : 'video/mp4'));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200);

  const reader = up.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch { /* client aborted or upstream ended */ }
  res.end();
}
