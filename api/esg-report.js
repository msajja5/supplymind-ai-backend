/**
 * GET  /api/esg-report            — all suppliers merged ESG report
 * GET  /api/esg-report?supplier=X — single supplier
 * POST /api/esg-report            — seed dummy data then return report
 */

import { seedDummyData }    from '../lib/seed-dummy.js';
import { mergeAllSuppliers, mergeAndScore } from '../lib/esg-merger.js';

export default function handler(req, res) {
  if (req.method === 'POST') {
    const result = seedDummyData();
    const report = mergeAllSuppliers();
    return res.status(200).json({
      ok: true,
      seed: result,
      suppliers: report.length,
      report,
    });
  }

  if (req.method === 'GET') {
    const sid = req.query?.supplier;
    if (sid) {
      try {
        return res.status(200).json({ ok: true, report: mergeAndScore(sid) });
      } catch (e) {
        return res.status(404).json({ ok: false, error: e.message });
      }
    }
    const report = mergeAllSuppliers();
    if (report.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No data yet. POST /api/esg-report to seed dummy data.',
        report: [],
      });
    }
    return res.status(200).json({ ok: true, suppliers: report.length, report });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
