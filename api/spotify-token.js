// api/spotify-token.js
// Échange le code d'autorisation Spotify contre un access_token
// Côté serveur pour ne pas exposer le Client Secret
 
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
 
  const { code, codeVerifier, redirectUri } = req.body;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
 
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'Clés Spotify manquantes' });
 
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    });
 
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || 'Erreur Spotify');
    return res.status(200).json(data);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
