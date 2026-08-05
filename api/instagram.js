// Instagram resolver — uses a logged-in session (IG_SESSIONID in Vercel env) to read a post's
// media, so it works where public Cobalt hits the login wall. Returns DIRECT cdninstagram URLs for
// every item (a carousel's photos + videos); the app downloads them itself — no streaming here, so
// this runs fine on Vercel serverless. Only resolves the account owner's accessible posts.
const APP_ID = '936619743392459';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// Instagram's private mobile API (i.instagram.com) is far more forgiving with a sessionid than the
// web one — this app UA is what it expects.
const IG_APP_UA = 'Instagram 269.0.0.18.75 Android (26/8.0.0; 480dpi; 1080x1920; samsung; SM-G950F; dreamlte; samsungexynos8895; en_US; 314665256)';

// Instagram shortcode (/p/<code>/) → numeric media id.
function shortcodeToId(shortcode) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = 0n;
  for (const ch of shortcode) {
    const v = A.indexOf(ch);
    if (v < 0) break;
    id = id * 64n + BigInt(v);
  }
  return id.toString();
}

function pickFrom(media, out) {
  if (Array.isArray(media.video_versions) && media.video_versions.length) {
    out.push({ url: media.video_versions[0].url, type: 'video' });
  } else if (media.image_versions2?.candidates?.length) {
    out.push({ url: media.image_versions2.candidates[0].url, type: 'photo' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const sid = process.env.IG_SESSIONID;
  if (!sid) return res.status(500).json({ error: 'Instagram is not configured on the server yet.' });

  const url = String((req.query && req.query.url) || '').trim();
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (!m) return res.status(400).json({ error: 'Not an Instagram post/reel link.' });

  const mediaId = shortcodeToId(m[1]);
  try {
    const r = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
      headers: {
        'User-Agent': IG_APP_UA,
        'X-IG-App-ID': APP_ID,
        'X-ASBD-ID': '129477',
        'X-IG-Capabilities': '3brTvw==',
        'Accept-Language': 'en-US',
        Accept: '*/*',
        Cookie: `sessionid=${sid}`,
      },
      signal: AbortSignal.timeout(9000),
    });
    const raw = await r.text();
    if (req.query && req.query.debug === '1') {
      const uid = decodeURIComponent(sid).split(':')[0];
      return res.status(200).json({ hasSid: !!sid, sidLen: sid.length, uid, mediaId, status: r.status, body: raw.slice(0, 240) });
    }
    if (r.status === 401 || r.status === 403) {
      return res.status(502).json({ error: 'Instagram login expired — refresh the sessionid.' });
    }
    let j = null; try { j = JSON.parse(raw); } catch { /* not json */ }
    const item = j?.items?.[0];
    if (!item) return res.status(502).json({ error: 'Could not read this post (private, deleted, or blocked).' });

    const items = [];
    if (Array.isArray(item.carousel_media) && item.carousel_media.length) {
      for (const c of item.carousel_media) pickFrom(c, items);
    } else {
      pickFrom(item, items);
    }
    if (!items.length) return res.status(502).json({ error: 'No media found in this post.' });

    const title = (item.caption?.text || item.user?.username || 'Instagram').slice(0, 120);
    return res.status(200).json({ items, title, count: items.length });
  } catch (e) {
    return res.status(502).json({ error: 'Instagram fetch failed. Try again.' });
  }
}
