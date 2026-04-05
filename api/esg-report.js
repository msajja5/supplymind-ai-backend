/**
 * GET  /api/esg-report              → merged ESG for all suppliers
 * GET  /api/esg-report?supplier=SUP001 → single supplier
 * POST /api/esg-report/seed          → inject dummy WhatsApp ESG entries for testing
 */

import { store } from '../lib/store.js';
import { mergeAndScore, mergeAllSuppliers } from '../lib/esg-merger.js';
import { generateCameraReading } from '../lib/camera-simulator.js';

const SUPPLIERS = ['SUP001', 'SUP002', 'SUP003'];
const LINES     = ['LINE-A', 'LINE-B', 'LINE-C'];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── POST /api/esg-report/seed ─────────────────────────────────────────────
  if (req.method === 'POST') {
    // Seed dummy camera readings
    SUPPLIERS.forEach(sid => {
      for (let i = 0; i < 6; i++) {           // 6 readings = 3hrs of data
        LINES.forEach(ln => {
          store.saveCameraReading(generateCameraReading(sid, ln));
        });
      }
    });

    // Seed dummy WhatsApp ESG entries
    SUPPLIERS.forEach((sid, idx) => {
      const docs = [
        { type: 'electricity_bill', energy_kwh: 1200 + idx * 300, co2e_kg: 960 + idx * 240, verified: true  },
        { type: 'water_invoice',    energy_kwh: 0,                 co2e_kg: 12,              verified: true  },
        { type: 'waste_manifest',   energy_kwh: 0,                 co2e_kg: 45 + idx * 10,  verified: false },
      ];
      docs.forEach(d => store.saveWaEsgEntry({
        entry_id:    `WA-ESG-${sid}-${d.type}-${Date.now()}`,
        supplier_id: sid,
        source:      'whatsapp',
        captured_at: new Date().toISOString(),
        ...d,
      }));
    });

    const stats = store.stats();
    return res.status(200).json({
      success: true,
      message: 'Dummy data seeded',
      seeded: {
        camera_readings: stats.camera_readings,
        wa_esg_entries:  stats.wa_esg_entries,
      },
      next_step: 'GET /api/esg-report',
    });
  }

  // ── GET /api/esg-report ───────────────────────────────────────────────────
  if (req.method === 'GET') {
    const sid = req.query.supplier;
    const report = sid ? mergeAndScore(sid) : mergeAllSuppliers();

    return res.status(200).json({
      generated_at:   new Date().toISOString(),
      schema_version: 'supplymind_v2.1',
      report,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
