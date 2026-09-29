// Web app resolver: turn a pasted link into a ready-to-download media URL.
//
// The browser can't call the download services directly (CORS + the pages block cross-origin
// scripts), so this serverless function does it server-side via public Cobalt instances. Cobalt
// merges video+audio and can transcode audio to MP3 on its side, then hands back a "tunnel" URL
// the browser can download straight away. We also fetch a best-effort title/thumbnail (oEmbed) so
// the UI can show a preview card.
//
// POST { url, quality?: '360'|'720'|'1080'|'max', audio?: boolean }
//  → 200 { ok:true, download:{url,filename}, meta?:{title,thumbnail} }
//  → 200 { ok:true, picker:[{url,type}], meta? }        (carousels / multi-item posts)
//  → 4xx { ok:false, error }

const COBALT_INSTANCES = [
  'https://co.otomir23.me',
  'https://co.eepy.today',
  'https://dwnld.nichind.dev',
];

const isHttp = (u) => /^https?:\/\/[^\s]+$/i.test(u);

async function oembed(pageUrl) {
  const eps = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(pageUrl)}&format=json`,
    `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(pageUrl)}&format=json`,
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(pageUrl)}`,
  ];
  for (const ep of eps) {
    try {
      const r = await fetch(ep, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && (j.title || j.thumbnail_url)) return { title: j.title || '', thumbnail: j.thumbnail_url || '', author: j.author_name || '' };
    } catch { /* try next */ }
  }
  return null;
}

// Best-effort file size for the resolved tunnel (Cobalt streams, so it usually reports only an
// "estimated-content-length"). Returns bytes or null; never throws.
async function tunnelSize(u) {
  try {
    const r = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    const s = r.headers.get('content-length') || r.headers.get('estimated-content-length');
    const n = s ? Number(s) : 0;
    return n > 0 ? n : null;   // Cobalt sends -1 for "unknown" on some merge jobs — treat as null
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const b = req.body || {};
  const url = String(b.url || '').trim();
  const audio = !!b.audio;
  const quality = ['360', '720', '1080', 'max'].includes(String(b.quality)) ? String(b.quality) : '720';
  if (!isHttp(url)) return res.status(400).json({ ok: false, error: 'Please paste a valid video link.' });

  const body = audio
    ? { url, downloadMode: 'audio', audioFormat: 'mp3' }
    : { url, downloadMode: 'auto', videoQuality: quality };

  const errors = [];
  for (const base of COBALT_INSTANCES) {
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json().catch(() => ({}));
      // The web app runs on https, so an http:// tunnel is mixed-content and the browser blocks
      // the download. Only accept https URLs; otherwise fall through to the next instance.
      if ((j.status === 'tunnel' || j.status === 'redirect') && j.url && /^https:\/\//i.test(j.url)) {
        const [meta, size] = await Promise.all([oembed(url), tunnelSize(j.url)]);
        return res.status(200).json({
          ok: true,
          download: { url: j.url, filename: j.filename || `download.${audio ? 'mp3' : 'mp4'}`, size },
          meta,
        });
      }
      if (j.status === 'picker' && Array.isArray(j.picker) && j.picker.length) {
        const meta = await oembed(url);
        return res.status(200).json({
          ok: true,
          picker: j.picker.map((p) => ({ url: p.url, type: p.type || 'photo' })).filter((p) => p.url),
          meta,
        });
      }
      errors.push(`${base.replace(/^https?:\/\//, '')}: ${j.status || 'HTTP' + r.status}${j.error?.code ? ' ' + j.error.code : ''}`);
    } catch (e) {
      errors.push(`${base.replace(/^https?:\/\//, '')}: ${e.name === 'TimeoutError' ? 'timeout' : 'unreachable'}`);
    }
  }
  return res.status(502).json({ ok: false, error: 'Could not fetch this link. It may be private, unsupported, or the service is busy — try again.', detail: errors.join(' · ') });
}
