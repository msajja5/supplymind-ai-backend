/**
 * GET /api/whatsapp-status
 * Returns counts of all WhatsApp pipeline tables
 * Useful for verifying end-to-end flow
 */
import { store } from '../lib/store.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const stats = store.stats();

  const esgEntries = store.getAllWaEsgEntries();
  const pillars    = {};
  esgEntries.forEach(e => { pillars[e.esg_pillar] = (pillars[e.esg_pillar] || 0) + 1; });

  const docs    = store.getAllWaDocuments();
  const docTypes= {};
  docs.forEach(d => { docTypes[d.status] = (docTypes[d.status] || 0) + 1; });

  return res.status(200).json({
    status: 'ok',
    tables: stats,
    esg_pillars: pillars,
    document_statuses: docTypes,
    passports: store.getAllPassports().map(p => ({
      passport_id: p.passport_id,
      esg_score:   p.esg_score,
      total_co2e:  p.total_co2e_kg,
    })),
  });
}
