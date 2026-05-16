import webpush from 'web-push';

export default async function handler(req, res) {
  // Accepter le secret en URL pour faciliter le test
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ erreur: 'Secret incorrect' });
  }

  const rapport = {
    '1_variables_vercel': {
      VAPID_PUBLIC: process.env.VAPID_PUBLIC_KEY ? '✅ OK' : '❌ MANQUANT',
      VAPID_PRIVATE: process.env.VAPID_PRIVATE_KEY ? '✅ OK' : '❌ MANQUANT',
      SUPABASE_URL: process.env.SUPABASE_URL ? '✅ OK' : '❌ MANQUANT',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? '✅ OK' : '❌ MANQUANT',
    },
    '2_abonnements': [],
    '3_envoi_test': []
  };

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(200).json({ ...rapport, diagnostic: '❌ Clés VAPID manquantes dans Vercel' });
  }

  webpush.setVapidDetails('mailto:test@moodwave.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data: subs, error } = await sb.from('push_subscriptions').select('*');

    if (error) {
      rapport['2_abonnements'] = '❌ Erreur Supabase : ' + error.message;
    } else if (!subs?.length) {
      rapport['2_abonnements'] = '❌ Aucun abonnement trouvé — tu nas pas encore activé les notifications';
    } else {
      rapport['2_abonnements'] = subs.map(s => ({
        user: s.user_id?.substring(0, 8) + '...',
        types: s.types,
        a_les_cles: !!(s.subscription?.keys?.p256dh && s.subscription?.keys?.auth)
      }));

      // Envoyer une notif test
      for (const sub of subs) {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify({
            title: 'Test Moodwave ✅',
            body: 'Les notifications fonctionnent !',
            url: '/',
            icon: '/icon-192.png'
          }));
          rapport['3_envoi_test'].push({ user: sub.user_id?.substring(0,8), resultat: '✅ Envoyé' });
        } catch(e) {
          rapport['3_envoi_test'].push({ user: sub.user_id?.substring(0,8), resultat: '❌ ' + e.statusCode + ' — ' + e.message });
          if (e.statusCode === 410) await sb.from('push_subscriptions').delete().eq('user_id', sub.user_id);
        }
      }
    }
  } catch(e) {
    rapport['2_abonnements'] = '❌ Erreur : ' + e.message;
  }

  return res.status(200).json(rapport);
}
