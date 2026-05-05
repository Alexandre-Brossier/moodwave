// api/playlist.js
// Ce fichier tourne côté serveur sur Vercel.
// Il reçoit les choix de l'utilisateur, appelle l'API Anthropic,
// et renvoie le JSON de la playlist au navigateur.
 
export default async function handler(req, res) {
 
  // Autoriser uniquement les requêtes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
 
  // Lire la clé API depuis les variables d'environnement Vercel (jamais exposée au navigateur)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Clé API manquante. Vérifie les variables d\'environnement Vercel.' });
  }
 
  // Lire les données envoyées par le site
  const { type, mood, energy, context, surprise } = req.body;
 
  // Construire le prompt selon le mode choisi
  const systemPrompt = `Tu es un expert en musique avec une culture encyclopédique (pop, rock, jazz, électro, rap, classique, world music, métal, indie, R&B, folk, soul, reggae, etc.).
Tu dois répondre UNIQUEMENT avec un tableau JSON valide, sans markdown, sans texte avant ou après, sans backticks.
Le JSON doit être un tableau de 9 objets avec exactement ces champs :
- "artist" : nom de l'artiste (string)
- "title" : titre du morceau (string)
- "genre" : genre musical court, ex: "Ambient", "Hip-Hop", "Indie Rock" (string, max 20 caractères)
- "reason" : une phrase en français expliquant pourquoi ce titre correspond au mood (string, max 100 caractères)
Assure-toi que les artistes et titres existent vraiment.`;
 
  let userPrompt;
  if (type === 'surprise') {
    userPrompt = `Génère une playlist surprise de 9 titres musicaux totalement inattendus et variés.
Mélange les genres, les décennies (des années 60 à aujourd'hui), et les cultures (musiques du monde, européennes, américaines, asiatiques...).
Sois audacieux et inattendu.`;
  } else {
    userPrompt = `Génère une playlist de 9 titres pour quelqu'un avec :
- Mood : "${mood}"
- Niveau d'énergie : "${energy}"
- Contexte : "${context}"
${surprise ? '- Bonus : inclure 2-3 titres inattendus/découverte en plus des suggestions classiques.' : ''}
 
Les titres doivent vraiment correspondre à l'ambiance. Varie les artistes.`;
  }
 
  try {
    // Appel à l'API Anthropic (fait côté serveur, pas depuis le navigateur)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
 
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Erreur Anthropic (${response.status})`);
    }
 
    const data = await response.json();
    const rawText = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
 
    // Extraire le tableau JSON de la réponse
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Format de réponse inattendu');
 
    const songs = JSON.parse(match[0]);
    if (!Array.isArray(songs) || songs.length === 0) throw new Error('Playlist vide');
 
    // Renvoyer la playlist au navigateur
    return res.status(200).json(songs);
 
  } catch (err) {
    console.error('Erreur Moodwave API:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
