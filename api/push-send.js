// api/push-send.js — Envoyer une notification push
// Appelé par un cron Vercel ou manuellement
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Non autorisé' });

  const { type, title, body, url } = req.body;
  // type = 'weekly' ou 'surprise'

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'Clés VAPID manquantes' });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(supabaseUrl, supabaseKey);

    // Récupérer tous les abonnés pour ce type
    const { data: subs } = await sb.from('push_subscriptions')
      .select('subscription, user_id')
      .contains('types', [type]);

    if (!subs || !subs.length) return res.status(200).json({ sent: 0 });

    // Construire la notification
    const payload = JSON.stringify({
      title: title || (type === 'weekly' ? '🔥 Tendances de la semaine' : '⚡ Ta playlist du jour est prête'),
      body: body || (type === 'weekly' ? 'Découvre les moods les plus populaires cette semaine !' : 'Ouvre Moodwave pour écouter ta sélection personnalisée.'),
      url: url || '/',
      icon: '/icon-192.png',
      badge: '/icon-192.png'
    });

    // Envoyer via Web Push Protocol (sans lib externe)
    let sent = 0;
    const errors = [];

    for (const sub of subs) {
      try {
        await sendWebPush(sub.subscription, payload, vapidPublic, vapidPrivate);
        sent++;
      } catch (e) {
        errors.push({ user: sub.user_id, error: e.message });
        // Si 410 Gone = abonnement expiré → supprimer
        if (e.statusCode === 410) {
          await sb.from('push_subscriptions').delete().eq('user_id', sub.user_id);
        }
      }
    }

    return res.status(200).json({ sent, errors });
  } catch (e) {
    console.error('push-send:', e);
    return res.status(500).json({ error: e.message });
  }
}

// Implémentation Web Push sans dépendance externe
async function sendWebPush(subscription, payload, vapidPublic, vapidPrivate) {
  const endpoint = subscription.endpoint;
  const { p256dh, auth } = subscription.keys;

  // Pour l'instant on utilise l'API fetch directement vers le push service
  // La vraie implémentation VAPID nécessite web-push -- à installer dans package.json Vercel
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400'
    },
    body: payload
  });

  if (!res.ok && res.status !== 201) {
    const err = new Error(`Push failed: ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
}
