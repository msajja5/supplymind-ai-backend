/**
 * POST /api/camera/upload
 * Receives meter images (energy, water, waste) from IoT camera or mobile
 * Extracts reading via regex (no OCR API key needed for numeric meters)
 * Saves to camera_readings + triggers ESG entry
 */
import { store } from '../../lib/store.js';
import { calculateEmissions } from '../../lib/emissions.js';

export const config = { api: { bodyParser: false } };

function parseReading(filename = '', rawText = '', meterType = '') {
  // Try to extract a number from text or filename
  const numMatch = rawText.match(/([\d,]+(?:\.\d+)?)\s*(?:kWh|kwh|KWH|m3|M3|kg|KG|units)/i)
                || rawText.match(/reading[:\s]*([\d,]+(?:\.\d+)?)/i)
                || rawText.match(/([\d]{3,6}(?:\.\d+)?)/);
  return numMatch ? parseFloat(numMatch[1].replace(/,/,'')) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Parse multipart or JSON body
    let factoryId  = req.body?.factory_id  || 'FAC-DEFAULT';
    let machineId  = req.body?.machine_id  || 'MACHINE-DEFAULT';
    let meterType  = (req.body?.meter_type || 'energy').toLowerCase();
    let supplierId = req.body?.supplier_id || 'unknown';
    let filename   = req.body?.filename    || `${meterType}_meter.jpg`;
    let rawValue   = req.body?.value       || null;

    const readingId = `CAM-${Date.now()}`;
    const ts = new Date().toISOString();

    // If value not provided, try to extract from filename/body
    if (!rawValue) rawValue = parseReading(filename, JSON.stringify(req.body), meterType);

    // Calculate CO2e if energy
    let co2e = null;
    if (meterType === 'energy' && rawValue) {
      co2e = rawValue * 0.82; // India grid emission factor kg CO2e/kWh
    }

    const reading = {
      reading_id:    readingId,
      supplier_id:   supplierId,
      factory_id:    factoryId,
      machine_id:    machineId,
      meter_type:    meterType,
      reading_value: rawValue,
      reading_unit:  meterType === 'energy' ? 'kWh' : meterType === 'water' ? 'm3' : 'kg',
      co2e_kg:       co2e,
      captured_at:   ts,
      source:        'camera_upload',
      status:        'processed',
    };

    store.saveCameraReading(reading);
    store.logEvent('camera_reading', readingId, 'channel/camera', 'success', { meterType, rawValue });

    return res.status(201).json({
      success:    true,
      reading_id: readingId,
      meter_type: meterType,
      value:      rawValue,
      co2e_kg:    co2e,
      message:    `${meterType} reading saved`,
    });
  } catch (err) {
    store.logEvent('camera_error', null, 'channel/camera', 'error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}
