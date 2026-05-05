// api/spotify-config.js
// Expose le Client ID Spotify au navigateur (pas secret)
export default async function handler(req, res) {
  res.status(200).json({ clientId: process.env.SPOTIFY_CLIENT_ID });
}
