/** Optional market quote only; never used for signing or balance checks. */
const AR_USD_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd&include_last_updated_at=true';
const CACHE_MS = 5 * 60 * 1000;
const MAX_QUOTE_AGE_MS = 10 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

let cachedQuote: { price: number; expiresAt: number } | null = null;
let pendingPrice: Promise<number | null> | null = null;

export async function fetchArUsdPrice(): Promise<number | null> {
  if (cachedQuote && Date.now() < cachedQuote.expiresAt) return cachedQuote.price;
  if (pendingPrice) return pendingPrice;
  pendingPrice = requestArUsdPrice().finally(() => { pendingPrice = null; });
  return pendingPrice;
}

async function requestArUsdPrice(): Promise<number | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    // Race the entire read, including JSON, so a stalled body cannot block retry.
    const request = (async () => {
      const response = await fetch(AR_USD_URL, { signal: controller.signal });
      if (!response.ok) return null;
      const json = await response.json() as { arweave?: { usd?: number; last_updated_at?: number } };
      const price = json?.arweave?.usd;
      const updatedAt = json?.arweave?.last_updated_at;
      const now = Date.now();
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0
        || typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)
        || now - updatedAt * 1000 >= MAX_QUOTE_AGE_MS
        || updatedAt * 1000 - now > FUTURE_TOLERANCE_MS) return null;
      return { price, expiresAt: Math.min(now + CACHE_MS, updatedAt * 1000 + MAX_QUOTE_AGE_MS) };
    })();
    const quote = await Promise.race([request, timeout]);
    if (!quote) return null;
    cachedQuote = quote;
    return quote.price;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Keep tiny positive fees visible rather than rounding them to $0.00. */
export function arToUsdDisplay(arAmount: string | null, arUsdPrice: number | null): string | null {
  if (!arAmount || !/^\d+(\.\d+)?$/.test(arAmount)
    || arUsdPrice == null || !Number.isFinite(arUsdPrice) || arUsdPrice <= 0) return null;
  const usd = Number(arAmount) * arUsdPrice;
  if (!Number.isFinite(usd)) return null;
  if (usd > 0 && usd < 0.0001) return '< $0.0001';
  const digits = usd > 0 && usd < 0.01 ? 6 : usd < 1 && usd > 0 ? 4 : 2;
  return '$' + usd.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
}
