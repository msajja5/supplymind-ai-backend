/**
 * POST /api/transform
 * Transforms a raw batch into SupplyMind schema v2.1.
 * Runs: FX conversion, HS code classification, emission calculation, CBAM check.
 */

import { classifyHS, isCBAM } from '../lib/hs-classifier.js';
import { computeEmissions } from '../lib/emissions.js';
import { inrToEur } from '../lib/fx.js';
import { buildPassport } from '../lib/passport.js';
import { validatePayload } from '../lib/validator.js';
import { store } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body ?? {};
    const batchId = req.query.batch_id ?? body.batch_id;

    // Load batch from store or use inline payload
    let records;
    if (batchId) {
      const batch = store.getBatch(batchId);
      if (!batch) return res.status(404).json({ error: `Batch ${batchId} not found` });
      records = batch.records;
    } else if (body.records) {
      records = body.records;
    } else if (body.product) {
      records = [body];
    } else {
      return res.status(400).json({ error: 'Provide batch_id or inline records' });
    }

    const passports = [];
    const transformLog = [];

    for (const record of records) {
      const startTs = Date.now();

      // 1. FX conversion
      const priceInr = record.financials?.unit_price_inr ?? 0;
      const { eur: unitPriceEur, rate: fxRate } = await inrToEur(priceInr);
      const qty = record.product?.quantity ?? 1;

      // 2. HS code classification
      const hs = classifyHS(record.product?.description, record.product?.material);

      // 3. Emission calculation
      const emissions = computeEmissions({
        weightKg: record.product?.weight_kg ?? 1,
        quantity: qty,
        process: record.product?.manufacturing_process,
        stateCode: 'KA', // Karnataka (Bangalore supplier)
        destinationPort: 'Hamburg',
      });

      // 4. Assemble enriched record
      const enriched = {
        supplier: record.supplier,
        product: {
          ...record.product,
          hs_code: record.product?.hs_code ?? hs.code,
          hs_confidence: hs.confidence,
          hs_description: hs.description,
        },
        financials: {
          unit_price_eur: unitPriceEur,
          total_value_eur: parseFloat((unitPriceEur * qty).toFixed(2)),
          fx_rate_inr_eur: fxRate,
        },
        emissions,
        compliance: {
          cbam_applicable: hs.cbam ?? false,
          certifications: (record.product?.certifications_raw ?? []).map(c =>
            typeof c === 'string' ? { code: c, standard: c, valid_until: null } : c
          ),
        },
        logistics: {
          ...record.logistics,
          incoterm: 'CIF Hamburg',
          port_of_loading: 'Nhava Sheva, IN',
          port_of_discharge: 'Hamburg, DE',
          estimated_arrival_eu: addDays(record.logistics?.dispatch_date, 21),
        },
      };

      // 5. Validate
      const validation = validatePayload(enriched);

      // 6. Build passport
      const passport = buildPassport(enriched);
      store.savePassport(passport);
      passports.push(passport);

      transformLog.push({
        passport_id: passport.passport_id,
        latency_ms: Date.now() - startTs,
        hs_code: hs.code,
        hs_confidence: hs.confidence,
        emissions_scope1: emissions.scope1_tco2e,
        validation_errors: validation.errors.length,
        validation_warnings: validation.warnings.length,
      });

      store.logEvent('passport_created', passport.passport_id, 'pipeline/transform', 'success');
    }

    return res.status(200).json({
      success: true,
      passports_generated: passports.length,
      passports,
      transform_log: transformLog,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function addDays(dateStr, days) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
