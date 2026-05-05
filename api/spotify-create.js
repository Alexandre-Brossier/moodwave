export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { token, userId, meta, songs } = req.body || {};

  if (!token) return res.status(400).json({ error: 'Token manquant' });
  if (!userId) return res.status(400).json({ error: 'userId manquant' });
  if (!Array.isArray(songs) || !songs.length) return res.status(400).json({ error: 'Aucune chanson' });

  // Vérifier le token
  const meRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const meData = await meRes.json();
  if (meRes.status === 401) return res.status(401).json({ error: 'Token expiré', detail: meData });

  const confirmedUserId = meData.id || userId;

  // Chercher UN seul titre pour tester
  const q = encodeURIComponent('Daft Punk Get Lucky');
  const searchRes = await fetch('https://api.spotify.com/v1/search?q=' + q + '&type=track&limit=1', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const searchData = await searchRes.json();
  const trackUri = searchData?.tracks?.items?.[0]?.uri;

  if (!trackUri) return res.status(404).json({ error: 'Recherche échouée', searchData });

  // Créer la playlist
  const createRes = await fetch('https://api.spotify.com/v1/users/' + confirmedUserId + '/playlists', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Moodwave Test', description: 'Test', public: true })
  });

  const createData = await createRes.json();

  // Renvoyer TOUT ce que Spotify a répondu
  return res.status(200).json({
    createStatus: createRes.status,
    createData,
    confirmedUserId,
    trackUri
  });
}
