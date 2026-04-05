/**
 * esg-merger.js
 * Merges WhatsApp ESG entries + Camera readings per supplier,
 * calculates a unified ESG score, and returns audit-ready records.
 */

import { store } from './store.js';

// ── ESG Score weights ────────────────────────────────────────────────────────
const W = {
  energy_intensity:   0.20,  // energy per kg produced
  water_intensity:    0.15,
  waste_intensity:    0.15,
  co2_intensity:      0.25,
  worker_safety:      0.15,  // anomaly rate
  doc_completeness:   0.10,  // from WhatsApp docs
};

function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

function scoreBand(score) {
  if (score >= 80) return { band: 'A', label: 'Excellent', audit_ready: true };
  if (score >= 65) return { band: 'B', label: 'Good',      audit_ready: true };
  if (score >= 50) return { band: 'C', label: 'Moderate',  audit_ready: false };
  return             { band: 'D', label: 'Poor',      audit_ready: false };
}

export function mergeAndScore(supplierId) {
  const now = new Date().toISOString();

  // 1. Pull camera readings for supplier
  const cams = store.getAllCameraReadings().filter(r => r.supplier_id === supplierId);

  // 2. Pull WhatsApp ESG entries for supplier
  const waEntries = store.getAllWaEsgEntries().filter(e => e.supplier_id === supplierId);

  // 3. Pull passports for supplier
  const passports = store.getAllPassports().filter(p => p.supplier?.tax_id || p.supplier_id === supplierId);

  // 4. Aggregate camera metrics
  const camAgg = cams.reduce((acc, r) => {
    acc.energy_kwh   += r.energy_kwh   ?? 0;
    acc.water_liters += r.water_liters ?? 0;
    acc.waste_kg     += r.waste_kg     ?? 0;
    acc.worker_count  = Math.max(acc.worker_count, r.worker_count ?? 0);
    acc.co2_ppm_avg  += r.co2_sensor_ppm ?? 0;
    acc.anomalies    += r.anomaly_flag ? 1 : 0;
    acc.count++;
    return acc;
  }, { energy_kwh: 0, water_liters: 0, waste_kg: 0, worker_count: 0, co2_ppm_avg: 0, anomalies: 0, count: 0 });

  if (camAgg.count > 0) camAgg.co2_ppm_avg = parseFloat((camAgg.co2_ppm_avg / camAgg.count).toFixed(1));

  // 5. Aggregate WhatsApp metrics
  const waAgg = waEntries.reduce((acc, e) => {
    acc.total_kwh       += e.energy_kwh ?? 0;
    acc.total_emissions += e.co2e_kg    ?? 0;
    acc.doc_count++;
    if (e.verified) acc.verified_count++;
    return acc;
  }, { total_kwh: 0, total_emissions: 0, doc_count: 0, verified_count: 0 });

  // 6. Calculate ESG sub-scores (0-100, higher = better)
  const totalWeight = camAgg.energy_kwh + waAgg.total_kwh || 1;
  const energyScore  = clamp(100 - (camAgg.energy_kwh / (camAgg.count || 1) / 4.8));
  const waterScore   = clamp(100 - (camAgg.water_liters / (camAgg.count || 1) / 12));
  const wasteScore   = clamp(100 - (camAgg.waste_kg / (camAgg.count || 1) / 0.8));
  const co2Score     = clamp(100 - ((camAgg.co2_ppm_avg - 400) / 5));
  const safetyScore  = clamp(100 - (camAgg.anomalies / (camAgg.count || 1)) * 100 * 5);
  const docScore     = clamp(waAgg.doc_count > 0
    ? (waAgg.verified_count / waAgg.doc_count) * 100
    : 40); // penalty if no WA docs

  const esgScore = parseFloat((
    energyScore  * W.energy_intensity +
    waterScore   * W.water_intensity  +
    wasteScore   * W.waste_intensity  +
    co2Score     * W.co2_intensity    +
    safetyScore  * W.worker_safety    +
    docScore     * W.doc_completeness
  ).toFixed(1));

  const band = scoreBand(esgScore);

  return {
    supplier_id:      supplierId,
    merged_at:        now,
    schema_version:   'supplymind_v2.1',
    data_sources: {
      camera_readings:  camAgg.count,
      whatsapp_docs:    waAgg.doc_count,
      passports:        passports.length,
    },
    camera_metrics: {
      total_energy_kwh:   parseFloat(camAgg.energy_kwh.toFixed(1)),
      total_water_liters: parseFloat(camAgg.water_liters.toFixed(1)),
      total_waste_kg:     parseFloat(camAgg.waste_kg.toFixed(1)),
      avg_co2_ppm:        camAgg.co2_ppm_avg,
      peak_workers:       camAgg.worker_count,
      anomaly_count:      camAgg.anomalies,
    },
    whatsapp_metrics: {
      total_energy_kwh:    parseFloat(waAgg.total_kwh.toFixed(1)),
      total_emissions_kg:  parseFloat(waAgg.total_emissions.toFixed(1)),
      documents_received:  waAgg.doc_count,
      documents_verified:  waAgg.verified_count,
    },
    esg_scores: {
      overall:  esgScore,
      energy:   parseFloat(energyScore.toFixed(1)),
      water:    parseFloat(waterScore.toFixed(1)),
      waste:    parseFloat(wasteScore.toFixed(1)),
      co2:      parseFloat(co2Score.toFixed(1)),
      safety:   parseFloat(safetyScore.toFixed(1)),
      document: parseFloat(docScore.toFixed(1)),
    },
    band:        band.band,
    label:       band.label,
    audit_ready: band.audit_ready,
    audit_flags: [
      ...(camAgg.anomalies > 2   ? ['⚠️ High anomaly rate from camera'] : []),
      ...(waAgg.doc_count === 0  ? ['⚠️ No WhatsApp documents received'] : []),
      ...(esgScore < 50          ? ['🔴 ESG score below audit threshold'] : []),
      ...(camAgg.co2_ppm_avg > 700 ? ['🔴 CO2 sensor above safe limit']  : []),
    ],
    passports,
  };
}

export function mergeAllSuppliers() {
  const allReadings = store.getAllCameraReadings();
  const allEntries  = store.getAllWaEsgEntries();
  const supplierIds = [...new Set([
    ...allReadings.map(r => r.supplier_id),
    ...allEntries.map(e => e.supplier_id),
  ])];
  return supplierIds.map(sid => mergeAndScore(sid));
}
