/**
 * supabase.js — Singleton Supabase client
 * Used by all store operations in production.
 * Falls back gracefully when env vars are missing (test/dev mode).
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.warn('[supabase] ⚠️  SUPABASE_URL or SERVICE_ROLE_KEY missing — running in memory-only mode');
}

export const supabase = (url && key)
  ? createClient(url, key, {
      auth: { persistSession: false },
      db:   { schema: 'public' },
    })
  : null;

export const isConnected = () => !!supabase;

/**
 * Thin wrapper — throws readable error on Supabase failures.
 * Usage: const rows = await sb('camera_readings').select('*')
 */
export async function sb(table) {
  if (!supabase) throw new Error(`[supabase] Not connected. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
  return supabase.from(table);
}
