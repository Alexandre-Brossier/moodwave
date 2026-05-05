export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

    const body = req.body || {};
    const token = body.token;
    const userId = body.userId;
    const meta = body.meta || 'Test';

    if (!token) return res.status(400).json({ error: 'Token manquant' });
    if (!userId) return res.status(400).json({ error: 'userId manquant' });

const createRes = await fetch(
  'https://api.spotify.com/v1/me/playlists',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Moodwave Test',
          description: 'Test',
          public: true
        })
      }
    );

    const text = await createRes.text();
    console.log('SPOTIFY RESPONSE:', createRes.status, text);

    return res.status(200).json({
      spotifyStatus: createRes.status,
      spotifyResponse: text
    });

  } catch(err) {
    console.error('CATCH ERROR:', err.message, err.stack);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
