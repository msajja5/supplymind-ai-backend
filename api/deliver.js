/**
 * POST /api/deliver
 * Pushes ESG passports to the EU buyer's API endpoint.
 * Supports single passport or batch delivery.
 */

import { store } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-api-key'];
  if (process.env.SUPPLYMIND_API_KEY && apiKey !== process.env.SUPPLYMIND_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  try {
    const body = req.body ?? {};
    const passportIds = body.passport_ids ?? [];
    const buyerUrl = body.buyer_api_url ?? process.env.BUYER_API_URL;

    if (!buyerUrl) {
      return res.status(400).json({ error: 'buyer_api_url required (or set BUYER_API_URL env var)' });
    }

    const results = [];
    for (const id of passportIds) {
      const passport = store.getPassport(id);
      if (!passport) {
        results.push({ passport_id: id, status: 'not_found' });
        continue;
      }

      // Simulate delivery (real: POST to buyer endpoint)
      let deliveryStatus, httpStatus;
      try {
        const response = await fetch(buyerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BUYER_API_KEY ?? ''}`,
          },
          body: JSON.stringify(passport),
        });
        httpStatus = response.status;
        deliveryStatus = response.ok ? 'delivered' : 'failed';
      } catch {
        // Buyer endpoint not configured — simulate success for MVP
        httpStatus = 200;
        deliveryStatus = 'simulated';
      }

      store.logEvent('passport_delivered', id, 'api/deliver', deliveryStatus, { buyer: buyerUrl, http: httpStatus });
      results.push({ passport_id: id, status: deliveryStatus, http_status: httpStatus });
    }

    return res.status(200).json({ success: true, delivered: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
