export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

    const { token, userId, meta, songs } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token manquant' });
    if (!Array.isArray(songs) || !songs.length) return res.status(400).json({ error: 'Aucune chanson' });

    // 1. Créer la playlist via /me/playlists
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
    if (!playlist.id) return res.status(500).json({ error: 'Création échouée : ' + JSON.stringify(playlist) });

    // 2. Rechercher chaque titre
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

    // 3. Ajouter les titres
    if (trackUris.length) {
      await fetch('https://api.spotify.com/v1/playlists/' + playlist.id + '/tracks', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: trackUris })
      });
    }

    return res.status(200).json({
      url: playlist.external_urls?.spotify || 'https://open.spotify.com/playlist/' + playlist.id,
      found: trackUris.length,
      total: songs.length
    });

  } catch(err) {
    console.error('ERREUR:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
