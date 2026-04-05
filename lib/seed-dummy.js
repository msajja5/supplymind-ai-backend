/**
 * seed-dummy.js
 * Seeds the in-memory store with realistic dummy data for:
 *   - 3 suppliers (with different green profiles)
 *   - Camera readings (48 cycles per supplier = 24h of data)
 *   - WhatsApp ESG entries (electricity bills, water, waste manifests)
 *   - Supplier profiles (incl. solar/recycled configs)
 *
 * Called by POST /api/esg-report or initScheduler on boot in test mode.
 */

import { store } from './store.js';

const SUPPLIERS = [
  {
    id: 'SUP001', name: 'GreenThread Exports Pvt Ltd',
    state: 'KA', process: 'Garment Manufacturing',
    // Strong green profile
    profile: { state_code: 'KA', solar_kwh_capacity: 180, recycled_material_pct: 55, recycled_water_litres: 400, fuel_type: 'biodiesel' },
  },
  {
    id: 'SUP002', name: 'Bangaluru Textiles Ltd',
    state: 'MH', process: 'Dyeing & Finishing',
    // Moderate green profile
    profile: { state_code: 'MH', solar_kwh_capacity: 60, recycled_material_pct: 20, recycled_water_litres: 150, fuel_type: 'diesel' },
  },
  {
    id: 'SUP003', name: 'Chennai Cotton Mills',
    state: 'TN', process: 'Cotton Spinning',
    // No green inputs yet
    profile: { state_code: 'TN', solar_kwh_capacity: 0, recycled_material_pct: 0, recycled_water_litres: 0, fuel_type: 'diesel' },
  },
];

function rand(lo, hi, dp = 1) {
  return parseFloat((Math.random() * (hi - lo) + lo).toFixed(dp));
}

function seedCameraReadings(supplier) {
  for (let i = 0; i < 48; i++) {
    const hasAnomaly = Math.random() < 0.05;
    const hasSolar   = supplier.profile.solar_kwh_capacity > 0;
    store.saveCameraReading({
      reading_id:            `CAM-${supplier.id}-${Date.now()}-${i}`,
      supplier_id:           supplier.id,
      supplier_name:         supplier.name,
      captured_at:           new Date(Date.now() - i * 30 * 60 * 1000).toISOString(),
      energy_kwh:            rand(80, 320),
      water_liters:          rand(150, 800),
      waste_kg:              rand(5, 60),
      co2_sensor_ppm:        rand(390, 750),
      temperature_c:         rand(22, 35),
      worker_count:          Math.floor(rand(8, 45)),
      anomaly_flag:          hasAnomaly,
      anomaly_type:          hasAnomaly ? 'temperature_spike' : null,
      // Green fields
      solar_kwh:             hasSolar ? rand(0, supplier.profile.solar_kwh_capacity) : 0,
      recycled_water_litres: supplier.profile.recycled_water_litres > 0 ? rand(0, supplier.profile.recycled_water_litres) : 0,
      source:                'ai_camera_simulator',
    });
  }
}

function seedWaEsgEntries(supplier) {
  const docTypes = ['electricity_bill', 'water_invoice', 'waste_manifest', 'sustainability_report'];
  for (let i = 0; i < 4; i++) {
    store.saveWaEsgEntry({
      entry_id:    `WA-${supplier.id}-${i}`,
      supplier_id: supplier.id,
      doc_type:    docTypes[i],
      received_at: new Date(Date.now() - i * 7 * 24 * 3600 * 1000).toISOString(),
      energy_kwh:  docTypes[i] === 'electricity_bill' ? rand(2000, 8000) : 0,
      co2e_kg:     rand(100, 600),
      verified:    i < 3,   // 3 of 4 verified
      green_inputs: {
        solar_kwh:             i === 0 ? supplier.profile.solar_kwh_capacity * 30 : 0,
        recycled_water_litres: i === 1 ? supplier.profile.recycled_water_litres * 30 : 0,
        recycled_material_pct: supplier.profile.recycled_material_pct,
      },
    });
  }
}

export function seedDummyData() {
  // Idempotent — don't re-seed if already has data
  if (store.getAllCameraReadings().length > 0) return { skipped: true, reason: 'already seeded' };

  for (const sup of SUPPLIERS) {
    store.saveSupplierProfile(sup.id, sup.profile);
    seedCameraReadings(sup);
    seedWaEsgEntries(sup);
  }

  return {
    seeded: true,
    suppliers:        SUPPLIERS.length,
    camera_readings:  store.getAllCameraReadings().length,
    wa_esg_entries:   store.getAllWaEsgEntries().length,
    supplier_profiles: Object.keys(store.getAllSupplierProfiles()).length,
  };
}
