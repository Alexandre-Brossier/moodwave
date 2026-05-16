// api/push-surprise.js — Notification playlist surprise quotidienne
export default async function handler(req, res) {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Non autorisé' });

  return sendPushToAll(res, {
    type: 'surprise',
    title: 'Ta playlist du jour est prête ⚡',
    body: 'Ouvre Moodwave pour découvrir ta sélection personnalisée.',
    url: '/?screen=surprise'
  });
}

async function sendPushToAll(res, { type, title, body, url }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(supabaseUrl, supabaseKey);

    const { data: subs } = await sb.from('push_subscriptions')
      .select('subscription, user_id')
      .contains('types', [type]);

    if (!subs?.length) return res.status(200).json({ sent: 0 });

    const payload = JSON.stringify({ title, body, url, icon: '/icon-192.png' });
    let sent = 0;

    for (const sub of subs) {
      try {
        const endpoint = sub.subscription.endpoint;
        const pushRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'TTL': '86400' },
          body: payload
        });
        if (pushRes.ok || pushRes.status === 201) sent++;
        else if (pushRes.status === 410) {
          await sb.from('push_subscriptions').delete().eq('user_id', sub.user_id);
        }
      } catch(e) {}
    }

    return res.status(200).json({ sent, total: subs.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
