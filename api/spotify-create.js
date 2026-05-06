export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

    const { token, meta, songs } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token manquant' });
    if (!Array.isArray(songs) || !songs.length) return res.status(400).json({ error: 'Aucune chanson' });

    // 1. Rechercher les titres D'ABORD
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

    if (!trackUris.length) return res.status(404).json({ error: 'Aucun titre trouvé sur Spotify' });

    // 2. Créer la playlist avec les titres via PUT sur une playlist existante
    // D'abord créer
    const createRes = await fetch('https://api.spotify.com/v1/me/playlists', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ('Moodwave · ' + meta).slice(0, 100),
        description: 'Générée par Moodwave 🎵',
        public: true
      })
    });
    const playlist = await createRes.json();
    if (!playlist.id) return res.status(500).json({ error: 'Création échouée' });

    // 3. Ajouter via PUT au lieu de POST
    const putRes = await fetch('https://api.spotify.com/v1/playlists/' + playlist.id + '/tracks', {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uris: trackUris })
    });
    const putData = await putRes.json();
    console.log('PUT RESULT:', putRes.status, JSON.stringify(putData));

    return res.status(200).json({
      url: playlist.external_urls?.spotify || 'https://open.spotify.com/playlist/' + playlist.id,
      found: trackUris.length,
      total: songs.length,
      putStatus: putRes.status,
      putData
    });

  } catch(err) {
    console.error('ERREUR:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
