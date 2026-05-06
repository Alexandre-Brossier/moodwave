// api/regen.js
// Remplace un seul titre dans une playlist existante
// Reçoit : le titre à remplacer, les autres titres (contexte), le meta, les genres, l'époque
// Renvoie : un seul objet {artist, title, genre, reason}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

  const { song, otherSongs, meta, genres, era } = req.body;
  if (!song || !otherSongs) return res.status(400).json({ error: 'Données manquantes' });

  const genreInstruction = genres && genres.length > 0 && !genres.includes('De tout')
    ? `Genres souhaités : ${genres.join(', ')}.`
    : 'Tous genres acceptés.';

  const eraInstruction = era && era !== 'Mixte'
    ? `Époque : ${era} uniquement.`
    : '';

  const systemPrompt = `Tu es un expert en musique. 
Réponds UNIQUEMENT avec un objet JSON valide (pas de tableau, pas de markdown), avec exactement ces champs :
{"artist":"...","title":"...","genre":"...","reason":"..."}
Le champ genre doit être un sous-genre précis (ex: "Neo-Soul", "Post-Rock", "Ambient Techno").
Le champ reason est une courte phrase en français (max 80 caractères).
Assure-toi que l'artiste et le titre existent vraiment.`;

  const userPrompt = `Contexte de la playlist : "${meta}"
${genreInstruction}
${eraInstruction}

Cette playlist contient déjà ces titres (ne les reproduis pas) :
${otherSongs.join('\n')}

Le titre "${song.artist} — ${song.title}" ne convient pas à l'utilisateur.
Propose UN SEUL titre différent qui correspond bien au contexte de la playlist,
qui n'est pas déjà dans la liste, et qui apporte une couleur complémentaire aux autres titres.`;

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
        max_tokens: 300,
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

    // Extraire l'objet JSON (peut être dans un tableau ou seul)
    const match = rawText.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error('Format de réponse inattendu');

    const newSong = JSON.parse(match[0]);
    if (!newSong.artist || !newSong.title) throw new Error('Titre invalide reçu');

    return res.status(200).json(newSong);

  } catch (err) {
    console.error('Erreur regen:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
