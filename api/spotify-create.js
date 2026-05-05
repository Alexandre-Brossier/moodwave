// api/spotify-create.js
// Crée une vraie playlist dans le compte Spotify de l'utilisateur :
// 1. Recherche chaque titre sur Spotify pour obtenir son URI
// 2. Crée une nouvelle playlist dans le compte
// 3. Ajoute les titres trouvés à la playlist
 
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
 
  const { token, userId, meta, songs } = req.body;
  if (!token || !userId || !songs?.length) return res.status(400).json({ error: 'Données manquantes' });
 
  try {
    // ── 1. Rechercher chaque titre sur Spotify ──
    const trackUris = [];
    for (const song of songs) {
      const query = encodeURIComponent(`track:${song.title} artist:${song.artist}`);
      const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
        headers: { Authorization: 'Bearer ' + token }
      });
      const searchData = await searchRes.json();
      const track = searchData?.tracks?.items?.[0];
      if (track) trackUris.push(track.uri);
    }
 
    if (!trackUris.length) throw new Error("Aucun titre trouvé sur Spotify");
 
    // ── 2. Créer la playlist ──
    const playlistName = `Moodwave · ${meta}`;
    const createRes = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: playlistName,
        description: `Playlist générée par Moodwave 🎵 — ${meta}`,
        public: false
      })
    });
    const playlist = await createRes.json();
    if (!playlist.id) throw new Error("Impossible de créer la playlist");
 
    // ── 3. Ajouter les titres ──
    await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: trackUris })
    });
 
    return res.status(200).json({
      url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
      found: trackUris.length,
      total: songs.length
    });
 
  } catch(e) {
    console.error('Erreur spotify-create:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
 
