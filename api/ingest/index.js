/**
 * POST /api/ingest
 * Main ingestion endpoint — accepts raw supplier data (JSON).
 * Validates API key, normalizes payload, queues for transform.
 */

import { normalizeRaw, validatePayload } from '../../lib/validator.js';
import { store } from '../../lib/store.js';

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // API key auth
  const apiKey = req.headers['x-api-key'] ?? req.headers['authorization']?.replace('Bearer ', '');
  if (process.env.SUPPLYMIND_API_KEY && apiKey !== process.env.SUPPLYMIND_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be JSON' });
    }

    const source = body.source ?? 'api_direct';
    const records = Array.isArray(body.records) ? body.records : [body];
    const batchId = `BATCH-${Date.now()}`;

    const normalized = records.map(r => normalizeRaw(r, source));

    // Basic pre-transform validation on first record
    const firstValidation = validatePayload(normalized[0]);

    const batch = {
      batch_id: batchId,
      source,
      record_count: records.length,
      received_at: new Date().toISOString(),
      status: 'received',
      validation: firstValidation,
      records: normalized,
    };

    store.saveBatch(batch);
    store.logEvent('batch_received', batchId, `channel/${source}`, 'success', { count: records.length });

    return res.status(202).json({
      success: true,
      batch_id: batchId,
      records_received: records.length,
      validation: firstValidation,
      next_step: `/api/transform?batch_id=${batchId}`,
    });
  } catch (err) {
    store.logEvent('ingest_error', 'unknown', 'api/ingest', 'error', { message: err.message });
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
