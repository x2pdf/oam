import {
  keccak256,
  toUtf8Bytes,
  SigningKey,
  Wallet,
  getBytes,
  hexlify,
  randomBytes
} from "ethers";

/**
 * Derives a symmetric key for personal notes (A -> A)
 * Uses the signature of a specific message to ensure the key is tied to the wallet
 * but not the private key itself.
 */
export async function derivePersonalKey(wallet: Wallet): Promise<Uint8Array> {
  const message = "OAMP Personal Note Key Derivation";
  const signature = await wallet.signMessage(message);
  // Hash the signature to get a 32-byte key
  return getBytes(keccak256(signature));
}

/**
 * Derives a shared secret for P2P messages (A -> B)
 */
export function deriveSharedSecret(
  senderPrivateKey: string,
  recipientPublicKey: string
): Uint8Array {
  const senderKey = new SigningKey(senderPrivateKey);
  const sharedSecret = senderKey.computeSharedSecret(recipientPublicKey);
  // Hash the shared secret to get a 32-byte key
  return getBytes(keccak256(sharedSecret));
}

/**
 * Simple AES-GCM implementation using Web Crypto API
 * Note: In React Native, you may need to polyfill crypto.subtle
 */
export async function encrypt(
  key: Uint8Array,
  data: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not available.");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    data
  );

  return new Uint8Array(encrypted);
}

export async function decrypt(
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not available.");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    ciphertext
  );

  return new Uint8Array(decrypted);
}

export function generateNonce(): Uint8Array {
  return randomBytes(12);
}
