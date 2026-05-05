export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { token, userId } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token manquant' });

  // Vérifier le token
  const meRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const meData = await meRes.json();
  console.log('ME STATUS:', meRes.status);
  console.log('ME DATA:', JSON.stringify(meData));

  const confirmedUserId = meData.id || userId;
  console.log('USER ID:', confirmedUserId);

  // Créer la playlist
  const createRes = await fetch('https://api.spotify.com/v1/users/' + confirmedUserId + '/playlists', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Moodwave Test', description: 'Test', public: true })
  });

  const createData = await createRes.json();
  console.log('CREATE STATUS:', createRes.status);
  console.log('CREATE DATA:', JSON.stringify(createData));

  return res.status(200).json({
    meStatus: meRes.status,
    userId: confirmedUserId,
    createStatus: createRes.status,
    createData
  });
}
