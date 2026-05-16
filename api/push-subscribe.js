// api/push-subscribe.js — Sauvegarder les abonnements push
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { subscription, userId, type } = req.body;
  if (!subscription || !userId) return res.status(400).json({ error: 'Données manquantes' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(supabaseUrl, supabaseKey);

    await sb.from('push_subscriptions').upsert({
      user_id: userId,
      subscription: subscription,
      types: type || ['surprise', 'weekly'],
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('push-subscribe:', e);
    return res.status(500).json({ error: e.message });
  }
}
