import { jwkToAddress } from './client';

/** Arweave RSA JWK 最小字段 */
export interface ArweaveJwk {
  kty: string;
  n: string;
  e: string;
  d: string;
  p: string;
  q: string;
  dp: string;
  dq: string;
  qi: string;
}

const REQUIRED_FIELDS = ['kty', 'n', 'e', 'd', 'p', 'q', 'dp', 'dq', 'qi'] as const;

export function isArweaveJwk(value: unknown): value is ArweaveJwk {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return REQUIRED_FIELDS.every((field) => typeof obj[field] === 'string' && obj[field].length > 0);
}

export function parseJwkInput(text: string): { ok: true; jwk: ArweaveJwk } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: 'empty' };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isArweaveJwk(parsed)) {
      return { ok: false, error: 'invalid' };
    }
    return { ok: true, jwk: parsed };
  } catch {
    return { ok: false, error: 'parse' };
  }
}

export async function validateJwk(jwk: ArweaveJwk): Promise<{ ok: true; address: string } | { ok: false }> {
  try {
    const address = await jwkToAddress(jwk);
    if (!address) return { ok: false };
    return { ok: true, address };
  } catch {
    return { ok: false };
  }
}

export function serializeJwk(jwk: ArweaveJwk): string {
  return JSON.stringify(jwk);
}

export function deserializeJwk(json: string): ArweaveJwk {
  const parsed = parseJwkInput(json);
  if (!parsed.ok) {
    throw new Error('Invalid JWK');
  }
  return parsed.jwk;
}
