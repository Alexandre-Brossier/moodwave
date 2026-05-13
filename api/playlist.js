// api/playlist.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

  const { type, mood, energy, context, surprise, genres, era, freeText, genreFreeText, likedSongs, dislikedSongs } = req.body;

  // Instruction genres
  let genreInstruction = '';
  if (type !== 'surprise' && genres && genres.length > 0) {
    if (genres.includes('De tout')) {
      genreInstruction = `- Genres : tous genres confondus, sois varié et explore librement.`;
    } else {
      genreInstruction = `- Genres souhaités : ${genres.join(', ')}.
  Explore les sous-genres pertinents :
  · Électronique → ambient, techno, house, drum & bass, synthwave, chillwave...
  · Rock → indie rock, post-rock, grunge, rock progressif, psychédélique...
  · Rap / Hip-Hop → boom bap, trap, lo-fi hip-hop, conscious rap, cloud rap...
  · Classique → baroque, romantique, contemporain, musique de chambre...
  · R&B / Soul → neo-soul, funk, gospel, quiet storm...
  · Métal → doom metal, black metal, post-metal, metalcore, djent...
  · Jazz → bebop, jazz fusion, nu-jazz, jazz manouche, smooth jazz...
  · Indie → shoegaze, dream pop, lo-fi indie, folk indie...
  Répartis les 10 titres équitablement entre les genres sélectionnés.`;
    }
  }

  // Instruction sous-genre libre — PRIORITAIRE sur les genres génériques
  const genreFreeInstruction = genreFreeText
    ? `- Sous-genre SPÉCIFIQUE demandé : "${genreFreeText}". C'est une précision importante — concentre la majorité des titres sur ce sous-genre exact. L'utilisateur sait précisément ce qu'il veut.`
    : '';

  // Instruction époque
  let eraInstruction = '';
  const erasArr = Array.isArray(era) ? era : (era ? [era] : []);
  if (erasArr.length > 0) {
    eraInstruction = `- Époque : privilégie les titres des ${erasArr.join(' et ')}. Quelques titres d'autres époques sont acceptés si vraiment pertinents.`;
  }

  // Instruction texte libre mood
  const freeTextInstruction = freeText
    ? `- Description du mood par l'utilisateur : "${freeText}" — tiens-en compte pour affiner les suggestions.`
    : '';

  const systemPrompt = `Tu es un expert en musique avec une culture encyclopédique couvrant tous les genres et sous-genres.
Tu dois répondre UNIQUEMENT avec un tableau JSON valide de 10 objets, sans markdown, sans texte avant ou après.
Chaque objet doit avoir exactement ces champs :
- "artist" : nom de l'artiste (string)
- "title" : titre du morceau (string)
- "genre" : sous-genre précis, ex: "Hardstyle", "Neo-Soul", "Post-Rock" (string, max 25 caractères)
- "reason" : phrase courte en français expliquant pourquoi ce titre correspond (string, max 100 caractères)
Assure-toi que les artistes et titres existent vraiment sur Spotify.`;

  let userPrompt;
  if (type === 'surprise') {
    userPrompt = `Génère une playlist surprise de 10 titres musicaux totalement inattendus.
Mélange les genres, les décennies (des années 60 à aujourd'hui) et les cultures du monde entier.
Sois audacieux, inattendu, et choisis des titres que peu de gens connaissent.
${likedSongs && likedSongs.length > 0 ? `- L'utilisateur apprécie ce style : ${likedSongs.join(', ')}.` : ''}
${dislikedSongs && dislikedSongs.length > 0 ? `- Évite absolument ce style : ${dislikedSongs.join(', ')}.` : ''}`;
  } else {
    userPrompt = `Génère une playlist de 10 titres musicaux pour quelqu'un avec :
- Mood : "${mood}"
- Niveau d'énergie : "${energy}"
- Contexte : "${context}"
${genreInstruction}
${genreFreeInstruction}
${eraInstruction}
${freeTextInstruction}
${surprise ? '- Bonus : inclure 2-3 titres surprenants ou de découverte en plus des classiques.' : ''}
${likedSongs && likedSongs.length > 0 ? `- L'utilisateur a aimé ces titres lors de sessions précédentes, inspire-toi de leur style : ${likedSongs.join(', ')}.` : ''}
${dislikedSongs && dislikedSongs.length > 0 ? `- L'utilisateur n'aime PAS ces titres/artistes/styles, évite-les absolument : ${dislikedSongs.join(', ')}.` : ''}

Les titres doivent vraiment correspondre à l'ambiance ET aux genres demandés.
Utilise des sous-genres précis dans le champ "genre".
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
    if (!Array.isArray(songs) || !songs.length) throw new Error('Playlist vide');

    return res.status(200).json(songs);

  } catch (err) {
    console.error('Erreur playlist:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
