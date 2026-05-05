// api/spotify-create.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) { return res.status(400).json({ error: 'Body invalide' }); }
  }

  const { token, userId, meta, songs } = body || {};
  if (!token) return res.status(400).json({ error: 'Token manquant — reconnecte Spotify' });
  if (!userId) return res.status(400).json({ error: 'userId manquant' });
  if (!Array.isArray(songs) || !songs.length) return res.status(400).json({ error: 'Aucune chanson' });

  // 0. Vérifier le token
  const meRes = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: 'Bearer ' + token } });
  if (meRes.status === 401) return res.status(401).json({ error: 'Session expirée — déconnecte et reconnecte Spotify' });
  let confirmedUserId = userId;
  try { const m = await meRes.json(); confirmedUserId = m.id || userId; } catch(e) {}

  // 1. Rechercher chaque titre
  const trackUris = [];
  const notFound = [];
  for (const song of songs) {
    try {
      let found = false;
      const q1 = encodeURIComponent('track:' + song.title + ' artist:' + song.artist);
      const r1 = await fetch('https://api.spotify.com/v1/search?q=' + q1 + '&type=track&limit=1&market=FR', { headers: { Authorization: 'Bearer ' + token } });
      if (r1.ok) { const d1 = await r1.json(); const t1 = d1?.tracks?.items?.[0]; if (t1?.uri) { trackUris.push(t1.uri); found = true; } }
      if (!found) {
        const q2 = encodeURIComponent(song.title + ' ' + song.artist);
        const r2 = await fetch('https://api.spotify.com/v1/search?q=' + q2 + '&type=track&limit=1&market=FR', { headers: { Authorization: 'Bearer ' + token } });
        if (r2.ok) { const d2 = await r2.json(); const t2 = d2?.tracks?.items?.[0]; if (t2?.uri) { trackUris.push(t2.uri); found = true; } }
      }
      if (!found) notFound.push(song.artist + ' – ' + song.title);
    } catch(e) { notFound.push(song.artist + ' – ' + song.title); }
  }

  if (!trackUris.length) return res.status(404).json({ error: 'Aucun titre trouvé sur Spotify. Régénère la playlist.', notFound });

  // 2. Créer la playlist
  const createRes = await fetch('https://api.spotify.com/v1/users/' + confirmedUserId + '/playlists', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ('Moodwave · ' + meta).slice(0, 100), description: ('Moodwave 🎵 ' + meta).slice(0, 300), public: false })
  });

  let playlist;
  try { playlist = await createRes.json(); } catch(e) { return res.status(500).json({ error: 'Réponse invalide de Spotify' }); }
  if (!playlist?.id) return res.status(500).json({ error: 'Création impossible : ' + (playlist?.error?.message || JSON.stringify(playlist)) });

  // 3. Ajouter les titres
  for (let i = 0; i < trackUris.length; i += 100) {
    await fetch('https://api.spotify.com/v1/playlists/' + playlist.id + '/tracks', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: trackUris.slice(i, i + 100) })
    });
  }

  return res.status(200).json({
    url: playlist.external_urls?.spotify || 'https://open.spotify.com/playlist/' + playlist.id,
    found: trackUris.length, total: songs.length, notFound
  });
}
