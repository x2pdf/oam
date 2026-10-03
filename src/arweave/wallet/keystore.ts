import { randomBytes } from 'ethers';
import { secureDelete, secureGet, secureSet } from '../../storage/secureStorage';
import type { ArweaveJwk } from './jwk';
import { deserializeJwk, serializeJwk } from './jwk';

export const AR_KEYSTORE_STORAGE_KEY = 'oam_ar_wallet_keystore';

/** Iterations for new keystores (OWASP 2023 guidance for PBKDF2-HMAC-SHA256). */
const PBKDF2_ITERATIONS = 600_000;
const MAX_PBKDF2_ITERATIONS = 10_000_000;

/** The payload records its iteration count, so the cost can be raised later. */
interface EncryptedPayload {
  v: 2;
  iter: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBufferSource(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toBufferSource(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJwk(jwk: ArweaveJwk, password: string): Promise<string> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(serializeJwk(jwk));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBufferSource(iv) },
    key,
    plaintext,
  );
  const payload: EncryptedPayload = {
    v: 2,
    iter: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };
  return JSON.stringify(payload);
}

function payloadIterations(payload: EncryptedPayload): number {
  const iter = payload.iter;
  if (
    payload.v !== 2
    || typeof iter !== 'number'
    || !Number.isInteger(iter)
    || iter < PBKDF2_ITERATIONS
    || iter > MAX_PBKDF2_ITERATIONS
  ) {
    throw new Error('Unsupported AR keystore format');
  }
  return iter;
}

export async function decryptJwk(payloadJson: string, password: string): Promise<ArweaveJwk> {
  const payload = JSON.parse(payloadJson) as EncryptedPayload;
  const iterations = payloadIterations(payload);
  const salt = fromBase64(payload.salt);
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ciphertext);
  const key = await deriveKey(password, salt, iterations);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBufferSource(iv) },
    key,
    toBufferSource(ciphertext),
  );
  const decoder = new TextDecoder();
  return deserializeJwk(decoder.decode(decrypted));
}

export async function saveEncryptedArKeystore(keystoreJson: string): Promise<void> {
  await secureSet(AR_KEYSTORE_STORAGE_KEY, keystoreJson);
}

export async function loadEncryptedArKeystore(): Promise<string | null> {
  return secureGet(AR_KEYSTORE_STORAGE_KEY);
}

export async function removeEncryptedArKeystore(): Promise<void> {
  await secureDelete(AR_KEYSTORE_STORAGE_KEY);
}
