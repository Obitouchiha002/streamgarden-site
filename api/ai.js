// Tiny AI query-understanding endpoint. The Groq key lives ONLY in this Vercel project's
// environment (Settings → Environment Variables → GROQ_API_KEY) — it is never shipped inside any
// app. The apps POST { q } here and get back a cleaned-up search query. If no key is set, or Groq
// fails, it simply returns the original query so search is never blocked.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const q = String(
    req.query?.q ?? (typeof req.body === 'object' ? req.body?.q : '') ?? ''
  ).trim();
  if (!q) return res.status(400).json({ query: '', note: '' });

  const key = process.env.GROQ_API_KEY;
  // No key configured → passthrough (plain search still works everywhere).
  if (!key) return res.status(200).json({ query: q, note: '' });

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0,
        max_tokens: 40,
        messages: [
          {
            role: 'system',
            content:
              'Rewrite the user text as a short YouTube search query naming the actual song, ' +
              'artist or video. Reply with the query only — no quotes, no explanation.',
          },
          { role: 'user', content: q },
        ],
      }),
    });
    if (!r.ok) return res.status(200).json({ query: q, note: '' });
    const data = await r.json();
    const out = (data?.choices?.[0]?.message?.content || '').trim();
    if (!out || out.length > 120 || out.toLowerCase() === q.toLowerCase()) {
      return res.status(200).json({ query: q, note: '' });
    }
    return res.status(200).json({ query: out, note: `AI understood: “${out}”` });
  } catch {
    return res.status(200).json({ query: q, note: '' });
  }
}
