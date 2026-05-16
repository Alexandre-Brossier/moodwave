import webpush from 'web-push';

export default async function handler(req, res) {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Non autorisé' });

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) return res.status(500).json({ error: 'Clés VAPID manquantes' });

  webpush.setVapidDetails('mailto:contact@moodwave.app', vapidPublic, vapidPrivate);

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: subs } = await sb.from('push_subscriptions')
    .select('subscription, user_id')
    .contains('types', ['weekly']);

  if (!subs?.length) return res.status(200).json({ sent: 0 });

  const payload = JSON.stringify({
    title: 'Les tendances de la semaine sont là 🔥',
    body: 'Découvre les moods et playlists les plus populaires cette semaine.',
    url: '/?screen=weekly',
    icon: '/icon-192.png'
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, payload);
      sent++;
    } catch (e) {
      if (e.statusCode === 410) {
        await sb.from('push_subscriptions').delete().eq('user_id', sub.user_id);
      }
    }
  }
  return res.status(200).json({ sent, total: subs.length });
}
