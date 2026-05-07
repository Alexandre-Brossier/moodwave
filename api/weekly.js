// api/weekly.js
// Lit la playlist de la semaine depuis WEEKLY_PLAYLIST (variable d'env Vercel)
// ou la génère à la volée si absente

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const stored = process.env.WEEKLY_PLAYLIST;
    if (stored) {
      const data = JSON.parse(stored);
      return res.status(200).json({ ...data, source: 'env' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

    const now = new Date();
    const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: `Tu es un expert en musique et tendances culturelles mondiales. Réponds UNIQUEMENT avec un tableau JSON valide de 10 objets sans markdown. Chaque objet : {"artist":"...","title":"...","genre":"...","reason":"...","trend":"..."}. genre=sous-genre précis max 20 chars, reason=pourquoi tendance en français max 90 chars, trend=source courte ex "TikTok viral" max 25 chars. Artistes et titres doivent exister réellement.`,
        messages: [{ role: 'user', content: `Nous sommes le ${dateStr}. Génère la playlist des 10 musiques les plus tendances EN CE MOMENT dans le monde. Inspire-toi des sons viraux TikTok/Instagram Reels, des nouvelles sorties très populaires sur Spotify/Apple Music, des musiques liées à des événements actuels majeurs, des hits radio internationaux. Varie les genres et cultures. Priorise l'actualité absolue.` }]
      })
    });

    if (!resp.ok) throw new Error('Erreur Anthropic ' + resp.status);

    const d = await resp.json();
    const raw = d.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('Format inattendu');
    const songs = JSON.parse(m[0]);

    return res.status(200).json({
      generatedAt: now.toISOString(),
      weekLabel: `Semaine du ${dateStr}`,
      songs,
      source: 'generated'
    });

  } catch (err) {
    console.error('Erreur weekly:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
