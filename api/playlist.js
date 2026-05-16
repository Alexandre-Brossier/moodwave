export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

  // ── Rate limiting invités par IP ──
  const authHeader = req.headers['authorization'] || '';
  const isAuthenticated = authHeader.startsWith('Bearer ') && authHeader.length > 20;

  if (!isAuthenticated) {
    // Vérifier le compteur IP dans Supabase
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
              || req.headers['x-real-ip']
              || req.socket?.remoteAddress
              || 'unknown';

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(supabaseUrl, supabaseKey);

        const today = new Date().toISOString().split('T')[0];
        const { data: ipRecord } = await sb
          .from('guest_limits')
          .select('count')
          .eq('ip', ip)
          .eq('date', today)
          .single();

        if (ipRecord && ipRecord.count >= 1) {
          return res.status(429).json({
            error: 'GUEST_LIMIT_REACHED',
            message: 'Limite atteinte. Crée un compte gratuit pour continuer.'
          });
        }

        // Incrémenter le compteur
        if (ipRecord) {
          await sb.from('guest_limits')
            .update({ count: ipRecord.count + 1 })
            .eq('ip', ip).eq('date', today);
        } else {
          await sb.from('guest_limits')
            .insert({ ip, date: today, count: 1 });
        }
      } catch (e) {
        console.error('Rate limit check error:', e.message);
        // En cas d'erreur Supabase, on laisse passer (fail open)
      }
    }
  }

  const {
    type, mood, energy, context, surprise, genres, era,
    freeText, genreFreeText, likedSongs, dislikedSongs
  } = req.body;

  let genreInstruction = '';
  if (type !== 'surprise' && genres && genres.length > 0) {
    if (genres.includes('De tout')) {
      genreInstruction = `- Genres : tous genres confondus, sois varié et explore librement.`;
    } else {
      genreInstruction = `- Genres souhaités : ${genres.join(', ')}.`;
    }
  }

  const genreFreeInstruction = genreFreeText
    ? `- Sous-genre SPÉCIFIQUE demandé : "${genreFreeText}". Concentre la majorité des titres sur ce sous-genre exact.`
    : '';

  const erasArr = Array.isArray(era) ? era : (era ? [era] : []);
  const eraInstruction = erasArr.length > 0
    ? `- Époque : privilégie les titres des ${erasArr.join(' et ')}.`
    : '';

  const freeTextInstruction = freeText
    ? `- Description : "${freeText}"`
    : '';

  const systemPrompt = `Tu es un expert en musique avec une culture encyclopédique.
Tu dois répondre UNIQUEMENT avec un tableau JSON valide de 10 objets, sans markdown, sans texte avant ou après.
Chaque objet doit avoir exactement ces champs :
- "artist" : nom de l'artiste (string)
- "title" : titre du morceau (string)
- "genre" : sous-genre précis, max 25 caractères (string)
- "reason" : phrase courte en français expliquant pourquoi ce titre correspond, max 100 caractères (string)
Assure-toi que les artistes et titres existent vraiment sur Spotify.`;

  let userPrompt;
  if (type === 'surprise' || type === 'collab') {
    userPrompt = freeText || `Génère une playlist surprise de 10 titres totalement inattendus. Mélange les genres, les décennies et les cultures. Sois audacieux.`;
  } else if (type === 'validate_challenge') {
    // Validation IA pour le défi
    const { challengeTitle, artist, title: songTitle, mood: challengeMood } = req.body;
    const validatePrompt = `Le défi musical de cette semaine est : "${challengeTitle}" (mood : ${challengeMood}).
Un utilisateur propose : "${artist} — ${songTitle}".
Ce titre correspond-il raisonnablement au défi ?
Réponds UNIQUEMENT avec ce JSON : {"valid": true} ou {"valid": false}`;
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 50, system: 'Réponds uniquement avec du JSON valide, rien d\'autre.', messages: [{ role: 'user', content: validatePrompt }] })
      });
      const data = await response.json();
      const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '{"valid":true}';
      const match = text.match(/\{[^}]+\}/);
      return res.status(200).json(match ? JSON.parse(match[0]) : { valid: true });
    } catch (e) {
      return res.status(200).json({ valid: true });
    }
  } else {
    userPrompt = `Génère une playlist de 10 titres musicaux pour quelqu'un avec :
- Mood : "${mood}"
- Niveau d'énergie : "${energy}"
- Contexte : "${context}"
${genreInstruction}
${genreFreeInstruction}
${eraInstruction}
${freeTextInstruction}
${surprise ? '- Inclure 2-3 titres surprenants en plus des classiques.' : ''}
${likedSongs?.length > 0 ? `- Style apprécié : ${likedSongs.slice(0,5).join(', ')}` : ''}
${dislikedSongs?.length > 0 ? `- À éviter absolument : ${dislikedSongs.slice(0,5).join(', ')}` : ''}
Varie les artistes, évite les doublons.`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erreur Anthropic (${response.status})`);
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
