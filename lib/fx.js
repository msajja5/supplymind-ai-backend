/**
 * SupplyMind AI — FX Converter
 * Converts INR to EUR using ECB rates via Frankfurter API.
 * Falls back to a hardcoded rate if the API is unavailable.
 */

const FALLBACK_RATE = 89.77; // INR per EUR (April 2026 approximate)
let cachedRate = null;
let cacheTime = 0;
const CACHE_TTL_MS = 3600 * 1000; // 1 hour

/**
 * Fetch current INR/EUR rate from ECB (via Frankfurter.app).
 */
async function fetchRate() {
  if (cachedRate && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cachedRate;
  }
  try {
    const url = process.env.ECB_FX_API_URL || 'https://api.frankfurter.app/latest';
    const res = await fetch(`${url}?from=EUR&to=INR`);
    const data = await res.json();
    cachedRate = data.rates?.INR ?? FALLBACK_RATE;
    cacheTime = Date.now();
    return cachedRate;
  } catch {
    return FALLBACK_RATE;
  }
}

/**
 * Convert INR amount to EUR.
 */
export async function inrToEur(amountInr) {
  const rate = await fetchRate();
  return {
    eur: parseFloat((amountInr / rate).toFixed(2)),
    rate,
    source: cachedRate === FALLBACK_RATE ? 'fallback' : 'ecb',
  };
}

/**
 * Convert EUR to INR.
 */
export async function eurToInr(amountEur) {
  const rate = await fetchRate();
  return parseFloat((amountEur * rate).toFixed(2));
}

export { fetchRate };
