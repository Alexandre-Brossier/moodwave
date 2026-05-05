export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

    const { token, meta, songs } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token manquant' });
    if (!Array.isArray(songs) || !songs.length) return res.status(400).json({ error: 'Aucune chanson' });

    // 1. Créer la playlist
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

    // 2. Rechercher chaque titre et logger le résultat
    const trackUris = [];
    const searchLog = [];

    for (const song of songs) {
      try {
        const q = encodeURIComponent(song.title + ' ' + song.artist);
        const r = await fetch('https://api.spotify.com/v1/search?q=' + q + '&type=track&limit=1&market=FR', {
          headers: { Authorization: 'Bearer ' + token }
        });
        const d = await r.json();
        const track = d?.tracks?.items?.[0];
        const uri = track?.uri;
        searchLog.push({
          searched: song.artist + ' - ' + song.title,
          status: r.status,
          found: !!uri,
          foundTrack: uri ? (track.artists[0].name + ' - ' + track.name) : null,
          uri: uri || null
        });
        if (uri) trackUris.push(uri);
      } catch(e) {
        searchLog.push({ searched: song.artist + ' - ' + song.title, error: e.message });
      }
    }

    console.log('SEARCH LOG:', JSON.stringify(searchLog));
    console.log('URIS FOUND:', trackUris.length, '/', songs.length);

    // 3. Ajouter les titres
    let addResult = null;
    if (trackUris.length) {
      const addRes = await fetch('https://api.spotify.com/v1/playlists/' + playlist.id + '/tracks', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: trackUris })
      });
      addResult = await addRes.json();
      console.log('ADD RESULT:', JSON.stringify(addResult));
    }

    return res.status(200).json({
      url: playlist.external_urls?.spotify || 'https://open.spotify.com/playlist/' + playlist.id,
      found: trackUris.length,
      total: songs.length,
      searchLog,
      addResult
    });

  } catch(err) {
    console.error('ERREUR:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
