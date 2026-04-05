/**
 * SupplyMind AI — In-Memory Store
 * Simple key-value store for passports and batches.
 * Production: replace with Vercel KV, PlanetScale, or Supabase.
 */

const passports = new Map();
const batches = new Map();
const events = [];

export const store = {
  // Passports
  savePassport(passport) {
    passports.set(passport.passport_id, passport);
    this.logEvent('passport_created', passport.passport_id, 'pipeline/builder');
    return passport;
  },
  getPassport(id) {
    return passports.get(id) ?? null;
  },
  listPassports(limit = 50) {
    return [...passports.values()].slice(-limit).reverse();
  },
  countPassports() {
    return passports.size;
  },

  // Batches
  saveBatch(batch) {
    batches.set(batch.batch_id, batch);
    return batch;
  },
  getBatch(id) {
    return batches.get(id) ?? null;
  },
  listBatches(limit = 20) {
    return [...batches.values()].slice(-limit).reverse();
  },

  // Event log
  logEvent(event, ref, actor, status = 'success', meta = {}) {
    events.push({ ts: new Date().toISOString(), event, ref, actor, status, ...meta });
    if (events.length > 1000) events.shift(); // rolling window
  },
  getEvents(limit = 100) {
    return events.slice(-limit).reverse();
  },
};
