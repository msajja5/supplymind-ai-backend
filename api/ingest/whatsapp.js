/**
 * POST /api/ingest/whatsapp
 * WhatsApp Cloud API webhook — receives media messages (certificate photos, delivery notes).
 * GET  /api/ingest/whatsapp — webhook verification (Meta requirement).
 */

import { store } from '../../lib/store.js';

export default async function handler(req, res) {
  // WhatsApp webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.status(200).json({ status: 'no_message' });

    const batchId = `WA-${Date.now()}`;
    const from = message.from; // supplier phone number
    const type = message.type; // image, document, text

    let extractedData = {
      source: 'whatsapp',
      supplier_phone: from,
      message_type: type,
      received_at: new Date().toISOString(),
    };

    if (type === 'image' || type === 'document') {
      // In production: download media via WhatsApp API, then OCR
      const mediaId = message[type]?.id;
      extractedData = {
        ...extractedData,
        media_id: mediaId,
        ocr_status: 'queued',
        ocr_note: 'Production: trigger OCR pipeline (Google Vision / Textract)',
      };
    } else if (type === 'text') {
      extractedData.text_body = message.text?.body;
    }

    const batch = {
      batch_id: batchId,
      source: 'whatsapp',
      record_count: 1,
      received_at: extractedData.received_at,
      status: 'ocr_pending',
      records: [extractedData],
    };

    store.saveBatch(batch);
    store.logEvent('whatsapp_received', batchId, 'channel/whatsapp', 'success', { type });

    // Always return 200 to WhatsApp to avoid retries
    return res.status(200).json({ success: true, batch_id: batchId });
  } catch (err) {
    return res.status(200).json({ status: 'error', message: err.message });
  }
}
