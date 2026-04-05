/**
 * scheduler.js
 * Starts the camera simulator on server boot.
 * Interval: 30 minutes (configurable via CAMERA_INTERVAL_MS env var)
 */

import { startSimulator } from './camera-simulator.js';

const INTERVAL_MS = parseInt(process.env.CAMERA_INTERVAL_MS ?? '1800000', 10); // default 30min

export function initScheduler() {
  startSimulator(INTERVAL_MS);
  console.log(`[Scheduler] Camera simulator running every ${INTERVAL_MS / 60000} min`);
}
