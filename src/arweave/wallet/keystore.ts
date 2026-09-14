import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { randomBytes } from 'ethers';
import type { ArweaveJwk } from './jwk';
import { deserializeJwk, serializeJwk } from './jwk';

export const AR_KEYSTORE_STORAGE_KEY = 'oam_ar_wallet_keystore';

const USE_ASYNC_STORAGE = Platform.OS === 'web';
const PBKDF2_ITERATIONS = 100_000;

interface EncryptedPayload {
  v: 1;
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

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
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
      iterations: PBKDF2_ITERATIONS,
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
  const key = await deriveKey(password, salt);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(serializeJwk(jwk));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBufferSource(iv) },
    key,
    plaintext,
  );
  const payload: EncryptedPayload = {
    v: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };
  return JSON.stringify(payload);
}

export async function decryptJwk(payloadJson: string, password: string): Promise<ArweaveJwk> {
  const payload = JSON.parse(payloadJson) as EncryptedPayload;
  const salt = fromBase64(payload.salt);
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ciphertext);
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBufferSource(iv) },
    key,
    toBufferSource(ciphertext),
  );
  const decoder = new TextDecoder();
  return deserializeJwk(decoder.decode(decrypted));
}

export async function saveEncryptedArKeystore(keystoreJson: string): Promise<void> {
  if (USE_ASYNC_STORAGE) {
    await AsyncStorage.setItem(AR_KEYSTORE_STORAGE_KEY, keystoreJson);
  } else {
    await SecureStore.setItemAsync(AR_KEYSTORE_STORAGE_KEY, keystoreJson);
  }
}

export async function loadEncryptedArKeystore(): Promise<string | null> {
  if (USE_ASYNC_STORAGE) {
    return AsyncStorage.getItem(AR_KEYSTORE_STORAGE_KEY);
  }
  return SecureStore.getItemAsync(AR_KEYSTORE_STORAGE_KEY);
}

export async function removeEncryptedArKeystore(): Promise<void> {
  if (USE_ASYNC_STORAGE) {
    await AsyncStorage.removeItem(AR_KEYSTORE_STORAGE_KEY);
  } else {
    await SecureStore.deleteItemAsync(AR_KEYSTORE_STORAGE_KEY);
  }
}
