// api/playlist.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

  const { type, mood, energy, context, surprise, genres } = req.body;

  // Construction de la contrainte genres
  let genreInstruction = '';
  if (type !== 'surprise' && genres && genres.length > 0) {
    if (genres.includes('De tout')) {
      genreInstruction = `- Genres : tous genres confondus, sois varié et explore librement.`;
    } else {
      genreInstruction = `- Genres souhaités : ${genres.join(', ')}.
  Pour chaque genre sélectionné, tu peux explorer des sous-genres pertinents. Par exemple :
  · Électronique → ambient, techno, house, drum & bass, synthwave, chillwave...
  · Rock → indie rock, post-rock, grunge, rock progressif, psychédélique...
  · Rap / Hip-Hop → boom bap, trap, lo-fi hip-hop, conscious rap, cloud rap...
  · Classique → baroque, romantique, contemporain, musique de chambre...
  · R&B / Soul → neo-soul, funk, gospel, quiet storm...
  · Métal → doom metal, black metal, post-metal, metalcore, djent...
  · Jazz → bebop, jazz fusion, nu-jazz, jazz manouche, smooth jazz...
  · Indie → shoegaze, dream pop, lo-fi indie, folk indie...
  Répartis les 9 titres équitablement entre les genres sélectionnés.`;
    }
  }

  const systemPrompt = `Tu es un expert en musique avec une culture encyclopédique couvrant tous les genres et sous-genres.
Tu dois répondre UNIQUEMENT avec un tableau JSON valide de 9 objets, sans markdown, sans texte avant ou après.
Chaque objet doit avoir exactement ces champs :
- "artist" : nom de l'artiste (string)
- "title" : titre du morceau (string)  
- "genre" : sous-genre précis et spécifique, ex: "Ambient Techno", "Neo-Soul", "Post-Rock" (string, max 25 caractères)
- "reason" : phrase courte en français expliquant pourquoi ce titre correspond (string, max 100 caractères)
Assure-toi que les artistes et titres existent vraiment sur Spotify.`;

  let userPrompt;
  if (type === 'surprise') {
    userPrompt = `Génère une playlist surprise de 9 titres musicaux totalement inattendus.
Mélange les genres, les décennies (des années 60 à aujourd'hui) et les cultures du monde entier.
Sois audacieux, inattendu, et choisis des titres que peu de gens connaissent.`;
  } else {
    userPrompt = `Génère une playlist de 9 titres musicaux pour quelqu'un avec :
- Mood : "${mood}"
- Niveau d'énergie : "${energy}"
- Contexte : "${context}"
${genreInstruction}
${surprise ? '- Bonus : inclure 2-3 titres surprenants ou de découverte en plus des classiques.' : ''}

Les titres doivent vraiment correspondre à l'ambiance ET aux genres demandés.
Utilise des sous-genres précis dans le champ "genre" (pas juste "Rock" mais "Post-Rock" ou "Indie Rock" par exemple).
Varie les artistes, évite de mettre deux titres du même artiste.`;
  }

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
    const rawText = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Format de réponse inattendu');
    const songs = JSON.parse(match[0]);
    if (!Array.isArray(songs) || !songs.length) throw new Error('Playlist vide');

    return res.status(200).json(songs);
  } catch (err) {
    console.error('Erreur playlist:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
