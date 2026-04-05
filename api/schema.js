/**
 * GET /api/schema
 * Returns the SupplyMind canonical data schema v2.1.
 * Used by supplier portals and EU buyer systems to understand the data model.
 */

import { SCHEMA, SCHEMA_VERSION, REQUIRED_FIELDS, CBAM_HS_PREFIXES } from '../lib/schema.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  return res.status(200).json({
    schema_version: SCHEMA_VERSION,
    description: 'SupplyMind AI canonical data model for India→EU supply chain ESG compliance',
    required_fields: REQUIRED_FIELDS,
    cbam_hs_prefixes: CBAM_HS_PREFIXES,
    schema: SCHEMA,
    endpoints: {
      ingest:     'POST /api/ingest',
      whatsapp:   'POST /api/ingest/whatsapp',
      csv:        'POST /api/ingest/csv',
      transform:  'POST /api/transform',
      passport:   'GET  /api/passport/:id',
      deliver:    'POST /api/deliver',
      health:     'GET  /api/health',
    },
  });
}
