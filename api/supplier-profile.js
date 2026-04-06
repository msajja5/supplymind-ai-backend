/**
 * GET  /api/supplier-profile?id=X  — get supplier green profile
 * POST /api/supplier-profile        — upsert supplier profile + trigger recalc
 *
 * Body: { supplier_id, name, state_code, solar_kwh_capacity,
 *         recycled_material_pct, recycled_water_litres, fuel_type, process }
 */

import { store }        from '../lib/store.js';
import { mergeAndScore } from '../lib/esg-merger.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ ok: false, error: 'Missing ?id=' });
      const profile = await store.getSupplierProfile(id);
      return res.status(200).json({ ok: true, supplier_id: id, profile });
    }

    if (req.method === 'POST') {
      const body = req.body ?? {};
      const { supplier_id, ...profile } = body;
      if (!supplier_id) return res.status(400).json({ ok: false, error: 'Missing supplier_id' });

      // Validate ranges
      if (profile.recycled_material_pct !== undefined) {
        profile.recycled_material_pct = Math.max(0, Math.min(100, Number(profile.recycled_material_pct)));
      }
      if (profile.solar_kwh_capacity !== undefined) {
        profile.solar_kwh_capacity = Math.max(0, Number(profile.solar_kwh_capacity));
      }

      await store.saveSupplierProfile(supplier_id, profile);

      // Trigger immediate recalculation
      const report = await mergeAndScore(supplier_id);

      return res.status(200).json({
        ok: true,
        supplier_id,
        profile_saved: profile,
        recalculated: {
          esg_score:           report.esg_score,
          band:                report.band,
          total_tco2e:         report.carbon.totals.total_tco2e,
          green_reduction_pct: report.carbon.green_inputs.reduction_pct,
          green_summary:       report.green_summary,
        },
      });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[supplier-profile]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
