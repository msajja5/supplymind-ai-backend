/**
 * camera-simulator.js
 * Generates dummy AI camera readings every 30 minutes.
 * Simulates: energy_kwh, water_liters, waste_kg, worker_count, temperature_c
 * Auto-starts when imported — call stopSimulator() to halt.
 */

import { store } from './store.js';

const SUPPLIERS = ['SUP001', 'SUP002', 'SUP003'];
const LINES     = ['LINE-A', 'LINE-B', 'LINE-C'];

function randomBetween(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

export function generateCameraReading(supplierId, line) {
  const sid = supplierId ?? SUPPLIERS[Math.floor(Math.random() * SUPPLIERS.length)];
  const ln  = line ?? LINES[Math.floor(Math.random() * LINES.length)];
  return {
    reading_id:    `CAM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    supplier_id:   sid,
    line,
    captured_at:   new Date().toISOString(),
    source:        'ai_camera',
    energy_kwh:    randomBetween(120, 480),
    water_liters:  randomBetween(200, 1200),
    waste_kg:      randomBetween(5, 80),
    worker_count:  Math.floor(randomBetween(10, 60)),
    temperature_c: randomBetween(22, 38),
    co2_sensor_ppm: randomBetween(400, 900),
    anomaly_flag:  Math.random() < 0.1, // 10% chance of anomaly
    confidence:    randomBetween(0.82, 0.99),
  };
}

let _timer = null;

export function startSimulator(intervalMs = 30 * 60 * 1000) {
  if (_timer) return; // already running
  console.log(`[CameraSimulator] Started — generating readings every ${intervalMs / 60000} min`);

  // Generate initial set of readings immediately
  _runBatch();

  _timer = setInterval(_runBatch, intervalMs);
}

function _runBatch() {
  const ts = new Date().toISOString();
  SUPPLIERS.forEach(sid => {
    LINES.forEach(ln => {
      const reading = generateCameraReading(sid, ln);
      store.saveCameraReading(reading);
    });
  });
  console.log(`[CameraSimulator] ${ts} — saved ${SUPPLIERS.length * LINES.length} readings`);
}

export function stopSimulator() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  console.log('[CameraSimulator] Stopped');
}
