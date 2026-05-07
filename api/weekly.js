// api/weekly.js
// Génère et met en cache la playlist tendance de la semaine
// La playlist change chaque lundi à minuit (basée sur le numéro de semaine ISO)

function getWeekKey() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `week-${now.getFullYear()}-${weekNum}`;
}

// Cache en mémoire (persiste tant que le serveur Vercel est chaud)
const cache = {};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

  const weekKey = getWeekKey();

  // Servir depuis le cache si disponible
  if (cache[weekKey]) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache[weekKey]);
  }

  // Obtenir la date actuelle pour contextualiser
  const now = new Date();
  const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const currentDate = `${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  const systemPrompt = `Tu es un expert en musique et en tendances culturelles mondiales.
Tu dois répondre UNIQUEMENT avec un tableau JSON valide de 10 objets, sans markdown, sans texte avant ou après.
Chaque objet : {"artist":"...","title":"...","genre":"...","reason":"...","trend":"..."}
- genre : sous-genre précis (max 20 chars)
- reason : pourquoi ce titre est tendance en ce moment (max 90 chars, en français)
- trend : source de tendance courte ex: "TikTok viral", "Nouveau single", "Coupe du monde", "Soundtrack Netflix" (max 25 chars)
Tous les artistes et titres doivent exister réellement.`;

  const userPrompt = `Nous sommes le ${currentDate}.

Génère la playlist des 10 musiques les plus tendances EN CE MOMENT dans le monde.
Inspire-toi de :
- Les sons viraux sur TikTok et Instagram Reels cette semaine
- Les nouvelles sorties d'artistes très populaires (top streamings Spotify/Apple Music)
- Les musiques liées à des événements actuels majeurs (sport, cinéma, séries, actualité)
- Les hits radio internationaux du moment
- Les morceaux qui font le buzz sur les réseaux sociaux

Varie les genres et les cultures — inclus des artistes anglophones, francophones et internationaux.
Priorise la pertinence et l'actualité absolue.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erreur Anthropic (${response.status})`);
    }

    const data = await response.json();
    const rawText = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Format inattendu');

    const songs = JSON.parse(match[0]);
    if (!Array.isArray(songs) || songs.length === 0) throw new Error('Playlist vide');

    // Stocker dans le cache avec métadonnées
    const result = {
      weekKey,
      generatedAt: now.toISOString(),
      songs
    };

    cache[weekKey] = result;

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);

  } catch (err) {
    console.error('Erreur weekly:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
