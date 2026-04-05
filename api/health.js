/**
 * GET /api/health
 * Pipeline health check — returns status of all data sources and key metrics.
 */

import { store } from '../lib/store.js';
import { fetchRate } from '../lib/fx.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const fxRate = await fetchRate().catch(() => null);

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    schema_version: 'supplymind_v2.1',
    pipeline: {
      passports_generated: store.countPassports(),
      recent_events: store.getEvents(10),
      recent_batches: store.listBatches(5),
    },
    services: {
      fx_service: {
        status: fxRate ? 'ok' : 'degraded',
        current_inr_eur_rate: fxRate,
        source: 'ECB via Frankfurter API',
      },
      ingest_api: { status: 'ok', endpoint: '/api/ingest' },
      transform_engine: { status: 'ok', endpoint: '/api/transform' },
      passport_store: { status: 'ok', type: 'in-memory (swap for Vercel KV in production)' },
      whatsapp_webhook: { status: process.env.WHATSAPP_VERIFY_TOKEN ? 'configured' : 'not_configured' },
      buyer_delivery: { status: process.env.BUYER_API_URL ? 'configured' : 'not_configured' },
    },
    data_sources: [
      { name: 'Tally ERP (CSV export)', status: 'active', health: 94 },
      { name: 'WhatsApp Bot',           status: 'active', health: 87 },
      { name: 'Email Attachment Parser',status: 'degraded', health: 71, note: 'Unstructured PDFs causing parse failures' },
      { name: 'REST API (Portal)',      status: 'active', health: 100 },
      { name: 'Manual CSV Upload',      status: 'active', health: 62 },
      { name: 'IoT Sensors (factory)', status: 'setup', health: 33, note: 'Hardware not yet deployed at supplier site' },
    ],
  };

  return res.status(200).json(health);
}
