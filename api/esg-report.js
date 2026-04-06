/**
 * GET  /api/esg-report            — all suppliers merged ESG report
 * GET  /api/esg-report?supplier=X — single supplier
 * GET  /api/esg-report?history=X  — ESG score history for supplier
 * POST /api/esg-report            — seed dummy data (dev only) then return report
 */

import { seedDummyData }                    from '../lib/seed-dummy.js';
import { mergeAllSuppliers, mergeAndScore } from '../lib/esg-merger.js';
import { store }                            from '../lib/store.js';
import { isConnected }                      from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // History endpoint
    if (req.method === 'GET' && req.query?.history) {
      const history = await store.getEsgHistory(req.query.history, 30);
      return res.status(200).json({ ok: true, supplier_id: req.query.history, history });
    }

    // Single supplier
    if (req.method === 'GET' && req.query?.supplier) {
      const report = await mergeAndScore(req.query.supplier);
      return res.status(200).json({ ok: true, db: isConnected() ? 'supabase' : 'memory', report });
    }

    // All suppliers
    if (req.method === 'GET') {
      const report = await mergeAllSuppliers();
      if (report.length === 0) {
        return res.status(200).json({
          ok: true,
          db: isConnected() ? 'supabase' : 'memory',
          message: 'No supplier data yet. POST /api/esg-report to seed (dev only).',
          report: [],
        });
      }
      return res.status(200).json({
        ok: true, db: isConnected() ? 'supabase' : 'memory',
        suppliers: report.length, report,
      });
    }

    // Seed (dev/staging only)
    if (req.method === 'POST') {
      if (process.env.NODE_ENV === 'production' && isConnected()) {
        return res.status(403).json({ ok: false, error: 'Seeding disabled in production' });
      }
      const seed   = await seedDummyData();
      const report = await mergeAllSuppliers();
      return res.status(200).json({ ok: true, seed, suppliers: report.length, report });
    }

    res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('[esg-report]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
