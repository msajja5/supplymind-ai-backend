/**
 * POST /api/ingest/csv
 * Accepts CSV text body and parses into normalized records.
 * Expected columns: item_name, quantity, material, unit_price_inr, weight_kg, dispatch_date, ...
 */

import { normalizeRaw } from '../../lib/validator.js';
import { store } from '../../lib/store.js';

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-api-key'];
  if (process.env.SUPPLYMIND_API_KEY && apiKey !== process.env.SUPPLYMIND_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  try {
    const csvText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const rows = parseCSV(csvText);
    const batchId = `CSV-${Date.now()}`;

    const normalized = rows.map(r => normalizeRaw(r, 'csv_upload'));
    const batch = {
      batch_id: batchId,
      source: 'csv_upload',
      record_count: rows.length,
      received_at: new Date().toISOString(),
      status: 'received',
      records: normalized,
    };

    store.saveBatch(batch);
    store.logEvent('csv_ingested', batchId, 'channel/csv', 'success', { count: rows.length });

    return res.status(202).json({
      success: true,
      batch_id: batchId,
      records_parsed: rows.length,
      next_step: `/api/transform?batch_id=${batchId}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
