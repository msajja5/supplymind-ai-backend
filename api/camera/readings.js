/**
 * GET /api/camera/readings
 * List all camera/IoT meter readings
 */
import { store } from '../../lib/store.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const readings = store.getAllCameraReadings();
  return res.status(200).json({
    count: readings.length,
    readings,
  });
}
