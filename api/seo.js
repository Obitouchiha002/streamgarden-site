// YouTube SEO inspector: the tags, keywords, description and stats a video was published with,
// plus a quick SEO checklist. YouTube embeds all of this in the watch page as
// ytInitialPlayerResponse (videoDetails + microformat), so one page fetch gives everything.
//
// GET /api/seo?url=<youtube link>  →  { ok, title, channel, views, tags, keywords, checks, ... }

const STOP = new Set(('a an and are as at be by for from has have i in is it its me my of on or our so the this that to was we with you your ' +
  'video videos full new official ka ki ke hai se me aur').split(' '));

function ytId(u) {
  const m = String(u).match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = ytId(req.query.url || '');
  if (!id) return res.status(400).json({ ok: false, error: 'SEO details are available for YouTube links.' });

  let html = '';
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(12000),
    });
    html = await r.text();
  } catch { return res.status(502).json({ ok: false, error: 'Could not reach YouTube — try again.' }); }

  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var|<\/script>)/s);
  if (!m) return res.status(502).json({ ok: false, error: 'YouTube did not return details for this video.' });
  let pr; try { pr = JSON.parse(m[1]); } catch { return res.status(502).json({ ok: false, error: 'Could not read video details.' }); }

  const d = pr.videoDetails || {};
  const mf = (pr.microformat && pr.microformat.playerMicroformatRenderer) || {};
  const title = d.title || '';
  const desc = d.shortDescription || '';
  const tags = d.keywords || [];
  const hashtags = [...new Set((desc.match(/#[\p{L}\p{N}_]+/gu) || []))];

  // Most-used words across title + tags + description (stopwords dropped).
  const freq = {};
  for (const w of `${title} ${tags.join(' ')} ${desc}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []) {
    if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  }
  const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));

  const tagChars = tags.join(',').length;
  const main = (tags[0] || keywords[0]?.word || '').toLowerCase();
  const checks = [
    { ok: title.length >= 20 && title.length <= 70, label: `Title length ${title.length} chars (best 20–70)` },
    { ok: tags.length >= 5, label: `${tags.length} tags used (aim for 5–15)` },
    { ok: tagChars <= 500, label: `Tags use ${tagChars}/500 characters` },
    { ok: desc.length >= 200, label: `Description ${desc.length} chars (aim 200+)` },
    { ok: hashtags.length >= 1 && hashtags.length <= 15, label: `${hashtags.length} hashtags (best 1–15)` },
    { ok: !!main && title.toLowerCase().includes(main.split(' ')[0]), label: 'Main keyword appears in the title' },
  ];

  res.setHeader('Cache-Control', 's-maxage=3600');
  return res.status(200).json({
    ok: true, id, title, channel: d.author || '', views: Number(d.viewCount || 0),
    duration: Number(d.lengthSeconds || 0), publishDate: mf.publishDate || '', category: mf.category || '',
    tags, tagChars, hashtags, description: desc, keywords, checks,
    score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100),
  });
}
