export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

  // ── Authentification ──
  const authHeader = req.headers['authorization'] || '';
  const isAuthenticated = authHeader.startsWith('Bearer ') && authHeader.length > 20;

  // ── Rate limiting invités — BLOQUANT ──
  if (!isAuthenticated) {
    const ip = (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      'unknown'
    );

    const supabaseUrl = process.env.SUPABASE_URL;
    // Utiliser service key si disponible, sinon anon key
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      // Pas de Supabase configuré → bloquer par sécurité
      return res.status(429).json({
        error: 'GUEST_LIMIT_REACHED',
        message: 'Crée un compte gratuit pour générer des playlists.'
      });
    }

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(supabaseUrl, supabaseKey);
      const today = new Date().toISOString().split('T')[0];

      const { data: ipRecord, error: selectError } = await sb
        .from('guest_limits')
        .select('count')
        .eq('ip', ip)
        .eq('date', today)
        .single();

      // Si l'IP a déjà généré au moins 1 fois → bloquer
      if (ipRecord && ipRecord.count >= 1) {
        return res.status(429).json({
          error: 'GUEST_LIMIT_REACHED',
          message: 'Limite atteinte. Crée un compte gratuit pour continuer.'
        });
      }

      // Première génération de cette IP aujourd'hui → enregistrer
      if (selectError || !ipRecord) {
        await sb.from('guest_limits').upsert(
          { ip, date: today, count: 1 },
          { onConflict: 'ip,date' }
        );
      } else {
        await sb.from('guest_limits')
          .update({ count: ipRecord.count + 1 })
          .eq('ip', ip)
          .eq('date', today);
      }

    } catch (e) {
      // En cas d'erreur Supabase → bloquer par sécurité (fail closed)
      console.error('Rate limit error:', e.message);
      return res.status(429).json({
        error: 'GUEST_LIMIT_REACHED',
        message: 'Crée un compte gratuit pour générer des playlists.'
      });
    }
  }

  // ── Génération de la playlist ──
  const {
    type, mood, energy, context, surprise, genres, era,
    freeText, genreFreeText, likedSongs, dislikedSongs
  } = req.body;

  let genreInstruction = '';
  if (type !== 'surprise' && genres && genres.length > 0) {
    if (genres.includes('De tout')) {
      genreInstruction = `- Genres : tous genres confondus, sois varié.`;
    } else {
      genreInstruction = `- Genres souhaités : ${genres.join(', ')}.`;
    }
  }

  const genreFreeInstruction = genreFreeText
    ? `- Sous-genre SPÉCIFIQUE : "${genreFreeText}". Concentre la majorité des titres dessus.`
    : '';

  const erasArr = Array.isArray(era) ? era : (era ? [era] : []);
  const eraInstruction = erasArr.length > 0
    ? `- Époque : ${erasArr.join(' et ')}.`
    : '';

  const freeTextInstruction = freeText ? `- Description : "${freeText}"` : '';

  const systemPrompt = `Tu es un expert en musique avec une culture encyclopédique.
Réponds UNIQUEMENT avec un tableau JSON valide de 10 objets, sans markdown ni texte autour.
Chaque objet : {"artist":"...","title":"...","genre":"...","reason":"..."}
- genre : sous-genre précis, max 25 caractères
- reason : phrase courte en français, max 100 caractères
Vérifie que les titres existent vraiment sur Spotify.`;

  // Validation défi
  if (type === 'validate_challenge') {
    const { challengeTitle, artist, title: songTitle, mood: challengeMood } = req.body;
    const validatePrompt = `Défi : "${challengeTitle}" (mood : ${challengeMood}).
Titre proposé : "${artist} — ${songTitle}".
Ce titre correspond-il au défi ? Réponds uniquement : {"valid":true} ou {"valid":false}`;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 50, system: 'JSON uniquement.', messages: [{ role: 'user', content: validatePrompt }] })
      });
      const d = await r.json();
      const text = d.content?.find(b => b.type === 'text')?.text || '{"valid":true}';
      const match = text.match(/\{[^}]+\}/);
      return res.status(200).json(match ? JSON.parse(match[0]) : { valid: true });
    } catch (e) {
      return res.status(200).json({ valid: true });
    }
  }

  let userPrompt;
  if (type === 'surprise' || type === 'collab') {
    userPrompt = freeText || `Génère une playlist surprise de 10 titres totalement inattendus. Mélange genres, décennies et cultures.`;
  } else {
    userPrompt = `Génère une playlist de 10 titres pour :
- Mood : "${mood}"
- Énergie : "${energy}"
- Contexte : "${context}"
${genreInstruction}
${genreFreeInstruction}
${eraInstruction}
${freeTextInstruction}
${surprise ? '- Inclure 2-3 titres surprenants.' : ''}
${likedSongs?.length > 0 ? `- Style apprécié : ${likedSongs.slice(0, 5).join(', ')}` : ''}
${dislikedSongs?.length > 0 ? `- À éviter : ${dislikedSongs.slice(0, 5).join(', ')}` : ''}
Varie les artistes, pas de doublons.`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2000, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erreur ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Format inattendu');

    const songs = JSON.parse(match[0]);
    if (!Array.isArray(songs) || !songs.length) throw new Error('Playlist vide');

    return res.status(200).json(songs);
  } catch (err) {
    console.error('Erreur playlist:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
