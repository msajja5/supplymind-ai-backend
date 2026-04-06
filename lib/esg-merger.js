/**
 * esg-merger.js v4 — fully async, Supabase-aware
 * Pulls live data from store (Supabase in prod, memory in dev/test).
 * Recalculates carbon + ESG from scratch on every call.
 */

import { store }          from './store.js';
import { autoCalcCarbon } from './carbon-engine.js';
import { calcESGScore }   from './esg-scorer.js';

export async function mergeAndScore(supplierId) {
  const now = new Date().toISOString();

  // 1. Pull all sources (parallel)
  const [allCams, allWa, allPassports, profile] = await Promise.all([
    store.getAllCameraReadings(supplierId),
    store.getAllWaEsgEntries(supplierId),
    store.getAllPassports(),
    store.getSupplierProfile(supplierId),
  ]);

  const cams      = allCams;  // already filtered by supplierId in store
  const waEntries = allWa;
  const passports = allPassports.filter(p => p.supplier_id === supplierId || p.supplier?.tax_id);

  // 2. Aggregate camera
  const camAgg = cams.reduce((acc, r) => {
    acc.energy_kwh              += r.energy_kwh              ?? 0;
    acc.water_liters            += r.water_liters            ?? 0;
    acc.waste_kg                += r.waste_kg                ?? 0;
    acc.worker_count             = Math.max(acc.worker_count, r.worker_count ?? 0);
    acc.co2_ppm_sum             += r.co2_sensor_ppm          ?? 0;
    acc.temperature_sum         += r.temperature_c           ?? 0;
    acc.anomalies               += r.anomaly_flag ? 1 : 0;
    acc.solar_kwh               += r.solar_kwh               ?? 0;
    acc.recycled_water_litres   += r.recycled_water_litres   ?? 0;
    acc.count++;
    return acc;
  }, { energy_kwh:0, water_liters:0, waste_kg:0, worker_count:0,
       co2_ppm_sum:0, temperature_sum:0, anomalies:0,
       solar_kwh:0, recycled_water_litres:0, count:0 });

  const n = camAgg.count || 1;
  camAgg.co2_ppm_avg = parseFloat((camAgg.co2_ppm_sum / n).toFixed(1));
  camAgg.avg_temp_c  = parseFloat((camAgg.temperature_sum / n).toFixed(1));

  // 3. Aggregate WhatsApp
  const waAgg = waEntries.reduce((acc, e) => {
    acc.total_kwh               += e.energy_kwh                          ?? 0;
    acc.total_emissions         += e.co2e_kg                             ?? 0;
    acc.solar_kwh               += e.green_inputs?.solar_kwh             ?? 0;
    acc.recycled_water          += e.green_inputs?.recycled_water_litres ?? 0;
    acc.recycled_material_pct    = Math.max(acc.recycled_material_pct, e.green_inputs?.recycled_material_pct ?? 0);
    acc.doc_count++;
    if (e.verified) acc.verified_count++;
    return acc;
  }, { total_kwh:0, total_emissions:0, solar_kwh:0,
       recycled_water:0, recycled_material_pct:0,
       doc_count:0, verified_count:0 });

  // 4. Resolve green inputs (camera > WA > profile)
  const greenInputs = {
    solarKwh:            camAgg.solar_kwh            || waAgg.solar_kwh             || profile.solar_kwh_capacity      || 0,
    recycledWaterLitres: camAgg.recycled_water_litres || waAgg.recycled_water        || profile.recycled_water_litres    || 0,
    recycledMaterialPct: profile.recycled_material_pct || waAgg.recycled_material_pct || 0,
    fuelType:            profile.fuel_type            || 'diesel',
  };

  // 5. Auto-calculate carbon
  const lp = passports[passports.length - 1];
  const carbon = autoCalcCarbon({
    weightKg:        lp?.product?.weight_kg            ?? 250,
    quantity:        lp?.product?.quantity              ?? 500,
    process:         lp?.product?.process               ?? profile.process ?? 'default',
    energyKwh:       camAgg.energy_kwh + waAgg.total_kwh,
    stateCode:       profile.state_code                ?? 'KA',
    wasteKg:         camAgg.waste_kg,
    waterLitres:     camAgg.water_liters,
    transportMode:   lp?.logistics?.transport_mode      ?? 'sea',
    destinationPort: lp?.logistics?.port_of_discharge?.includes('Hamburg') ? 'Hamburg' : 'Rotterdam',
    hsCode:          lp?.product?.hs_code,
    unitPriceEur:    lp?.financials?.unit_price_eur     ?? 0,
    ...greenInputs,
  });

  // 6. ESG Score
  const esg = calcESGScore({ camAgg, waAgg, carbon, passports });

  const report = {
    supplier_id:     supplierId,
    supplier_name:   profile.name ?? supplierId,
    merged_at:       now,
    schema_version:  'supplymind_v3.0',
    data_sources: {
      camera_readings:  camAgg.count,
      whatsapp_docs:    waAgg.doc_count,
      passports_issued: passports.length,
    },
    green_inputs_resolved: greenInputs,
    camera_metrics: {
      total_energy_kwh:   parseFloat(camAgg.energy_kwh.toFixed(1)),
      total_water_liters: parseFloat(camAgg.water_liters.toFixed(1)),
      total_waste_kg:     parseFloat(camAgg.waste_kg.toFixed(1)),
      avg_co2_ppm:        camAgg.co2_ppm_avg,
      avg_temp_c:         camAgg.avg_temp_c,
      peak_workers:       camAgg.worker_count,
      anomaly_count:      camAgg.anomalies,
      solar_kwh_detected: camAgg.solar_kwh,
    },
    whatsapp_metrics: {
      total_energy_kwh:   parseFloat(waAgg.total_kwh.toFixed(1)),
      total_emissions_kg: parseFloat(waAgg.total_emissions.toFixed(1)),
      documents_received: waAgg.doc_count,
      documents_verified: waAgg.verified_count,
    },
    carbon,
    esg,
    esg_score:      esg.overall_score,
    band:           esg.band,
    label:          esg.label,
    audit_ready:    esg.audit_ready,
    csrd_compliant: esg.csrd_compliant,
    flags:          esg.flags,
    green_summary:  esg.green_summary,
    passports,
  };

  // 7. Persist snapshot to Supabase (non-blocking)
  store.saveEsgSnapshot({
    supplier_id:          supplierId,
    merged_at:            now,
    esg_score:            esg.overall_score,
    band:                 esg.band,
    total_tco2e:          carbon.totals.total_tco2e,
    green_reduction_pct:  carbon.green_inputs.reduction_pct,
    scope1_tco2e:         carbon.totals.scope1_tco2e,
    scope2_tco2e:         carbon.totals.scope2_tco2e,
    scope3_tco2e:         carbon.totals.scope3_tco2e,
    solar_kwh:            greenInputs.solarKwh,
    recycled_material_pct: greenInputs.recycledMaterialPct,
    full_report:          JSON.stringify(report),
  }).catch(e => console.warn('[merger] snapshot save failed:', e.message));

  return report;
}

export async function mergeAllSuppliers() {
  const ids = await store.getAllSupplierIds();
  if (!ids.length) return [];
  return Promise.all(ids.map(mergeAndScore));
}
