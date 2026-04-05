/**
 * GET  /api/passport/:id  — Retrieve a specific ESG passport
 * GET  /api/passport       — List recent passports
 */

import { store } from '../lib/store.js';

export default function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Extract ID from URL path
  const urlParts = req.url.split('/').filter(Boolean);
  const passportId = urlParts[urlParts.length - 1];

  if (passportId && passportId !== 'passport') {
    const passport = store.getPassport(passportId);
    if (!passport) return res.status(404).json({ error: `Passport ${passportId} not found` });
    return res.status(200).json(passport);
  }

  // List passports
  const limit = parseInt(req.query.limit ?? '20');
  const passports = store.listPassports(limit);
  return res.status(200).json({
    total: store.countPassports(),
    passports,
  });
}
