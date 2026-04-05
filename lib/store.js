/**
 * In-memory store for local / Codespaces development
 * In production: swap each save* with a Supabase insert
 */

const db = {
  passports:      [],
  wa_messages:    [],
  wa_documents:   [],
  wa_extractions: [],
  wa_esg_entries: [],
  camera_readings:[],
  ingest_log:     [],
};

export const store = {
  // ── Passports ────────────────────────────────────────────────────────────
  savePassport(p)            { db.passports.push(p); },
  getPassport(id)            { return db.passports.find(p => p.passport_id === id); },
  getAllPassports()           { return db.passports; },
  countPassports()           { return db.passports.length; },

  // ── WhatsApp ─────────────────────────────────────────────────────────────
  saveWaMessage(msg)         { db.wa_messages.push(msg); },
  getAllWaMessages()          { return db.wa_messages; },

  saveWaDocument(doc)        { db.wa_documents.push(doc); },
  updateWaDocument(id, patch) {
    const i = db.wa_documents.findIndex(d => d.document_id === id);
    if (i >= 0) Object.assign(db.wa_documents[i], patch);
  },
  getAllWaDocuments()         { return db.wa_documents; },

  saveWaExtraction(ext)      { db.wa_extractions.push(ext); },
  getAllWaExtractions()       { return db.wa_extractions; },

  saveWaEsgEntry(entry)      { db.wa_esg_entries.push(entry); },
  getAllWaEsgEntries()        { return db.wa_esg_entries; },

  // ── Camera / IoT ─────────────────────────────────────────────────────────
  saveCameraReading(r)       { db.camera_readings.push(r); },
  getAllCameraReadings()      { return db.camera_readings; },

  // ── Audit log ────────────────────────────────────────────────────────────
  logEvent(event, batchId, channel, status, meta = {}) {
    db.ingest_log.push({
      event, batch_id: batchId, channel, status,
      meta: JSON.stringify(meta),
      logged_at: new Date().toISOString(),
    });
  },

  // ── Legacy ───────────────────────────────────────────────────────────────
  saveBatch(batch) {
    db.ingest_log.push({ event: 'batch', ...batch, logged_at: new Date().toISOString() });
  },
  getEvents(n = 10)  { return db.ingest_log.slice(-n); },
  listBatches(n = 5) { return db.ingest_log.filter(e => e.event === 'batch').slice(-n); },

  // ── Stats ────────────────────────────────────────────────────────────────
  stats() {
    return {
      passports:       db.passports.length,
      wa_messages:     db.wa_messages.length,
      wa_documents:    db.wa_documents.length,
      wa_extractions:  db.wa_extractions.length,
      wa_esg_entries:  db.wa_esg_entries.length,
      camera_readings: db.camera_readings.length,
      ingest_log:      db.ingest_log.length,
    };
  },

  reset() { Object.keys(db).forEach(k => { db[k] = []; }); },
};
