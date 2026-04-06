/**
 * GET /api/health — liveness + readiness probe
 * Returns DB connection status, store stats, version
 */

import { isConnected, supabase } from '../lib/supabase.js';
import { store }                  from '../lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const connected = isConnected();
  let dbPing = null;

  if (connected) {
    try {
      const start = Date.now();
      await supabase.from('supplier_profiles').select('supplier_id').limit(1);
      dbPing = `${Date.now() - start}ms`;
    } catch (e) {
      dbPing = `error: ${e.message}`;
    }
  }

  const stats = await store.stats();

  res.status(200).json({
    status:   'ok',
    version:  'supplymind_v3.0',
    env:      process.env.NODE_ENV ?? 'development',
    db: {
      mode:       connected ? 'supabase' : 'memory',
      connected,
      ping:       dbPing,
      url_set:    !!process.env.SUPABASE_URL,
    },
    store_stats: stats,
    checked_at:  new Date().toISOString(),
  });
}
