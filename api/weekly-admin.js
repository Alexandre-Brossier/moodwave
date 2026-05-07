// api/weekly-admin.js
// Génère la playlist de la semaine et retourne le JSON à copier dans WEEKLY_PLAYLIST
// Accès : https://ton-site.vercel.app/api/weekly-admin?secret=VOTRE_SECRET
//
// UTILISATION :
// 1. Dans Vercel > Settings > Environment Variables, ajoute ADMIN_SECRET=un_mot_de_passe_que_tu_choisis
// 2. Chaque lundi, ouvre : https://project-0mjoz.vercel.app/api/weekly-admin?secret=ton_secret
// 3. Copie le JSON affiché
// 4. Dans Vercel > Settings > Environment Variables, mets à jour WEEKLY_PLAYLIST avec ce JSON
// 5. Redéploie (Deployments > Redeploy)

export default async function handler(req, res) {
  // Vérification du secret
  const secret = req.query.secret;
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

  const now = new Date();
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: `Tu es un expert en musique et tendances culturelles mondiales. Réponds UNIQUEMENT avec un tableau JSON valide de 10 objets sans markdown. Chaque objet : {"artist":"...","title":"...","genre":"...","reason":"...","trend":"..."}. genre=sous-genre précis max 20 chars, reason=pourquoi tendance en français max 90 chars, trend=source courte ex "TikTok viral" max 25 chars. Artistes et titres doivent exister réellement.`,
        messages: [{ role: 'user', content: `Nous sommes le ${dateStr}. Génère la playlist des 10 musiques les plus tendances EN CE MOMENT dans le monde. Inspire-toi des sons viraux TikTok/Instagram Reels, des nouvelles sorties très populaires sur Spotify/Apple Music, des musiques liées à des événements actuels majeurs (sport, cinéma, séries Netflix/Disney+, actualité), des hits radio internationaux. Varie les genres et cultures (anglophone, francophone, international). Priorise l'actualité absolue.` }]
      })
    });

    if (!resp.ok) throw new Error('Erreur Anthropic ' + resp.status);

    const d = await resp.json();
    const raw = d.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('Format inattendu');
    const songs = JSON.parse(m[0]);

    const result = {
      generatedAt: now.toISOString(),
      weekLabel: `Semaine du ${dateStr}`,
      songs
    };

    // Retourner en HTML pour faciliter la lecture et la copie
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Moodwave Weekly Admin</title>
<style>
  body{font-family:monospace;background:#07080f;color:#f0f0ff;padding:2rem;max-width:900px;margin:0 auto}
  h1{color:#c4b5fd;margin-bottom:.5rem}
  p{color:rgba(255,255,255,.5);margin-bottom:1.5rem;font-family:sans-serif}
  .instructions{background:rgba(124,106,255,.1);border:1px solid rgba(124,106,255,.3);border-radius:12px;padding:1.25rem;margin-bottom:1.5rem;font-family:sans-serif;font-size:.9rem;line-height:1.8}
  .instructions strong{color:#c4b5fd}
  textarea{width:100%;height:300px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.2);border-radius:8px;color:#f0f0ff;padding:1rem;font-size:.8rem;font-family:monospace;resize:vertical}
  .preview{margin-top:2rem}
  .song{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.75rem 1rem;margin-bottom:.5rem}
  .num{color:rgba(196,181,253,.5);font-size:.8rem}
  .artist{color:#c4b5fd;font-size:.85rem}
  .title{color:#fff;font-weight:bold}
  .trend{display:inline-block;background:rgba(74,222,128,.1);color:#4ade80;border:1px solid rgba(74,222,128,.2);border-radius:100px;font-size:.72rem;padding:.2rem .6rem;margin-top:.3rem}
  button{background:linear-gradient(135deg,#7c6aff,#a78bfa);border:none;color:#fff;padding:.75rem 1.5rem;border-radius:8px;cursor:pointer;font-size:1rem;margin-top:.5rem}
</style>
</head>
<body>
<h1>🎵 Moodwave — Playlist de la semaine générée</h1>
<p>Générée le ${dateStr}</p>

<div class="instructions">
  <strong>Comment mettre à jour la playlist pour tous les utilisateurs :</strong><br>
  1. Sélectionne et copie tout le contenu de la zone de texte ci-dessous<br>
  2. Va sur <strong>vercel.com → ton projet moodwave → Settings → Environment Variables</strong><br>
  3. Cherche ou crée la variable <strong>WEEKLY_PLAYLIST</strong><br>
  4. Colle le JSON comme valeur et sauvegarde<br>
  5. Va dans <strong>Deployments → ··· → Redeploy</strong><br>
  6. Tous les utilisateurs verront immédiatement la nouvelle playlist ✅
</div>

<p><strong>Copie ce JSON dans la variable WEEKLY_PLAYLIST de Vercel :</strong></p>
<textarea id="json-output" readonly>${JSON.stringify(result, null, 2)}</textarea>
<br>
<button onclick="document.getElementById('json-output').select();document.execCommand('copy');this.textContent='✅ Copié !'">📋 Copier le JSON</button>

<div class="preview">
  <h2 style="color:#c4b5fd;margin-bottom:1rem">Aperçu de la playlist :</h2>
  ${songs.map((s, i) => `
    <div class="song">
      <div class="num">${String(i+1).padStart(2,'0')}</div>
      <div class="artist">${s.artist}</div>
      <div class="title">${s.title}</div>
      <span class="trend">🔥 ${s.trend}</span>
      <div style="font-size:.78rem;color:rgba(220,220,255,.6);margin-top:.3rem;font-style:italic">${s.reason}</div>
    </div>
  `).join('')}
</div>
</body>
</html>
    `);

  } catch (err) {
    console.error('Erreur weekly-admin:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
