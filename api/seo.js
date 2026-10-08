// YouTube SEO inspector: the tags, keywords, description and stats a video was published with,
// plus a quick SEO checklist.
//
// Source: the official YouTube Data API v3 when YT_API_KEY is set (works from any server, free
// quota 10,000 lookups/day). Without a key we fall back to scraping the watch page — but YouTube
// often serves datacenter IPs (like Vercel's) a bot-check page with empty details, so the key is
// what makes this reliable in production.
//
// GET /api/seo?url=<youtube link>  →  { ok, title, channel, views, likes, comments, tags, ... }

const KEY = process.env.YT_API_KEY;
const STOP = new Set(('a an and are as at be by for from has have i in is it its me my of on or our so the this that to was we with you your ' +
  'video videos full new official ka ki ke hai se me aur').split(' '));
const CATEGORIES = { 1: 'Film & Animation', 2: 'Autos & Vehicles', 10: 'Music', 15: 'Pets & Animals', 17: 'Sports', 19: 'Travel & Events',
  20: 'Gaming', 22: 'People & Blogs', 23: 'Comedy', 24: 'Entertainment', 25: 'News & Politics', 26: 'Howto & Style', 27: 'Education',
  28: 'Science & Technology', 29: 'Nonprofits & Activism' };

function ytId(u) {
  const m = String(u).match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
const isoSecs = (iso) => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };

async function fromApi(id) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${id}&key=${KEY}`, { signal: AbortSignal.timeout(10000) });
  const j = await r.json();
  const v = j.items && j.items[0];
  if (!v) return null;
  const s = v.snippet || {}, st = v.statistics || {};
  return { title: s.title || '', channel: s.channelTitle || '', views: +st.viewCount || 0, likes: +st.likeCount || 0, comments: +st.commentCount || 0,
    duration: isoSecs(v.contentDetails && v.contentDetails.duration), publishDate: (s.publishedAt || '').slice(0, 10),
    category: CATEGORIES[s.categoryId] || '', tags: s.tags || [], description: s.description || '' };
}

async function fromPage(id) {
  const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(12000),
  });
  const m = (await r.text()).match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var|<\/script>)/s);
  if (!m) return null;
  const pr = JSON.parse(m[1]); const d = pr.videoDetails || {};
  const mf = (pr.microformat && pr.microformat.playerMicroformatRenderer) || {};
  if (!d.title) return null;   // bot-check page: no real details
  return { title: d.title, channel: d.author || '', views: +d.viewCount || 0, likes: null, comments: null,
    duration: +d.lengthSeconds || 0, publishDate: mf.publishDate || '', category: mf.category || '',
    tags: d.keywords || [], description: d.shortDescription || '' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = ytId(req.query.url || '');
  if (!id) return res.status(400).json({ ok: false, error: 'SEO details are available for YouTube links.' });

  let v = null;
  try { v = KEY ? await fromApi(id) : null; } catch { /* fall through to page */ }
  if (!v) { try { v = await fromPage(id); } catch { /* handled below */ } }
  if (!v) return res.status(502).json({ ok: false, error: 'YouTube did not share details for this video right now — try again later.' });

  const hashtags = [...new Set((v.description.match(/#[\p{L}\p{N}_]+/gu) || []))];
  const freq = {};
  for (const w of `${v.title} ${v.tags.join(' ')} ${v.description}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []) {
    if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  }
  const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));
  const tagChars = v.tags.join(',').length;
  const main = (v.tags[0] || keywords[0]?.word || '').toLowerCase();
  const checks = [
    { ok: v.title.length >= 20 && v.title.length <= 70, label: `Title length ${v.title.length} chars (best 20–70)` },
    { ok: v.tags.length >= 5, label: `${v.tags.length} tags used (aim for 5–15)` },
    { ok: tagChars <= 500, label: `Tags use ${tagChars}/500 characters` },
    { ok: v.description.length >= 200, label: `Description ${v.description.length} chars (aim 200+)` },
    { ok: hashtags.length >= 1 && hashtags.length <= 15, label: `${hashtags.length} hashtags (best 1–15)` },
    { ok: !!main && v.title.toLowerCase().includes(main.split(' ')[0]), label: 'Main keyword appears in the title' },
  ];

  res.setHeader('Cache-Control', 's-maxage=3600');
  return res.status(200).json({ ok: true, id, ...v, tagChars, hashtags, keywords, checks,
    score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100) });
}
