/**
 * Fetch ETH/USD price.
 *
 * Primary: Chainlink on-chain oracle via eth_call (free, no gas).
 *   Aggregator: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
 *   latestRoundData() → answer with 8 decimals (e.g. 250_00000000 = $2500).
 *
 * Fallback: CoinGecko simple/price HTTP API (works when RPC nodes are unreachable).
 */
import { Contract } from 'ethers';
import { withRpcFallback } from './rpcClient';

const CHAINLINK_ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
const AGGREGATOR_ABI = [
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
];
const DECIMALS = 100_000_000; // 10^8

/** Module-level price cache (5 min TTL). */
let cachedPrice: number | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

/**
 * Fallback: fetch ETH/USD from CoinGecko simple/price API.
 */
async function fetchPriceFromCoinGecko(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (!res.ok) return null;
      const json = await res.json() as { ethereum?: { usd?: number } };
      const price = json?.ethereum?.usd;
      return typeof price === 'number' && price > 0 ? price : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * Fetch the current ETH → USD price.
 * Tries Chainlink on-chain first, falls back to CoinGecko HTTP API.
 * Returns null on failure so callers can silently degrade.
 */
export async function fetchEthUsdPrice(): Promise<number | null> {
  if (cachedPrice !== null && Date.now() - cachedAt < CACHE_MS) {
    return cachedPrice;
  }

  // --- Primary: Chainlink on-chain oracle ---
  try {
    const price = await withRpcFallback(async (provider) => {
      const contract = new Contract(CHAINLINK_ETH_USD, AGGREGATOR_ABI, provider);
      const [, answer] = await contract.latestRoundData();
      return Number(answer) / DECIMALS;
    }, { noFatal: true });
    if (price > 0) {
      cachedPrice = price;
      cachedAt = Date.now();
      return price;
    }
  } catch (err) {
    console.warn('Chainlink price fetch failed, trying CoinGecko:', errorText(err));
  }

  // --- Fallback: CoinGecko HTTP API ---
  try {
    const price = await fetchPriceFromCoinGecko();
    if (price !== null) {
      cachedPrice = price;
      cachedAt = Date.now();
      return price;
    }
  } catch (err) {
    console.warn('CoinGecko price fetch failed:', err);
  }

  return cachedPrice; // return stale cache on total failure
}

function errorText(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { shortMessage?: string; message?: string };
    return String(e.shortMessage || e.message || err);
  }
  return String(err);
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

/** Format a number as "$X,XXX.XX". */
export function formatUsd(value: number): string {
  return '$' + value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Given an ETH amount (decimal string) and a cached USD price,
 * return a formatted USD string, or null if price is unavailable.
 */
export function ethToUsdDisplay(ethAmount: string | null, ethUsdPrice: number | null): string | null {
  if (!ethAmount || ethUsdPrice == null) return null;
  const eth = parseFloat(ethAmount);
  if (isNaN(eth)) return null;
  return formatUsd(eth * ethUsdPrice);
}
