export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { token, userId, meta, songs } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token manquant' });
  if (!userId) return res.status(400).json({ error: 'userId manquant' });
  if (!Array.isArray(songs) || !songs.length) return res.status(400).json({ error: 'Aucune chanson' });

  // 1. Vérifier le token et récupérer l'userId confirmé
  const meRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (meRes.status === 401) return res.status(401).json({ error: 'Token expiré — reconnecte Spotify' });
  const meData = await meRes.json();
  const confirmedUserId = meData.id || userId;

  // 2. Créer la playlist EN PREMIER
  const createRes = await fetch('https://api.spotify.com/v1/users/' + confirmedUserId + '/playlists', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: ('Moodwave · ' + meta).slice(0, 100),
      description: 'Générée par Moodwave 🎵',
      public: true
    })
  });
  const playlist = await createRes.json();
  if (!playlist.id) {
    return res.status(500).json({ error: 'Création refusée par Spotify : ' + JSON.stringify(playlist) });
  }

  // 3. Rechercher les titres
  const trackUris = [];
  for (const song of songs) {
    try {
      const q = encodeURIComponent(song.title + ' ' + song.artist);
      const r = await fetch('https://api.spotify.com/v1/search?q=' + q + '&type=track&limit=1&market=FR', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const d = await r.json();
      const uri = d?.tracks?.items?.[0]?.uri;
      if (uri) trackUris.push(uri);
    } catch(e) {}
  }

  // 4. Ajouter les titres à la playlist
  if (trackUris.length) {
    await fetch('https://api.spotify.com/v1/playlists/' + playlist.id + '/tracks', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: trackUris })
    });
  }

  // 5. Renvoyer l'URL
  return res.status(200).json({
    url: playlist.external_urls?.spotify || 'https://open.spotify.com/playlist/' + playlist.id,
    found: trackUris.length,
    total: songs.length
  });
}
