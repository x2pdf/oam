import {
  keccak256,
  toUtf8Bytes,
  SigningKey,
  Wallet,
  getBytes,
  hexlify,
  randomBytes,
  concat
} from "ethers";

/**
 * Derives a symmetric key for personal notes (A -> A)
 */
export async function derivePersonalKey(wallet: Wallet): Promise<Uint8Array> {
  const message = "OAMP Personal Note Key Derivation";
  const signature = await wallet.signMessage(message);
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
  return getBytes(keccak256(sharedSecret));
}

/**
 * AES-GCM encryption with AAD support
 */
export async function encrypt(
  key: Uint8Array,
  data: Uint8Array,
  nonce: Uint8Array,
  aad?: Uint8Array
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

  const algorithm: AesGcmParams = {
    name: "AES-GCM",
    iv: nonce
  };
  if (aad) {
    algorithm.additionalData = aad;
  }

  const encrypted = await crypto.subtle.encrypt(
    algorithm,
    cryptoKey,
    data
  );

  return new Uint8Array(encrypted);
}

/**
 * AES-GCM decryption with AAD support
 */
export async function decrypt(
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  aad?: Uint8Array
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

  const algorithm: AesGcmParams = {
    name: "AES-GCM",
    iv: nonce
  };
  if (aad) {
    algorithm.additionalData = aad;
  }

  const decrypted = await crypto.subtle.decrypt(
    algorithm,
    cryptoKey,
    ciphertext
  );

  return new Uint8Array(decrypted);
}

/**
 * Generates a deterministic nonce to prevent reuse.
 * Formula: first 12 bytes of keccak256(wallet_nonce + recipient + timestamp + random_salt)
 */
export function generateDeterministicNonce(
  walletNonce: number,
  recipient: string,
  extraSalt?: Uint8Array
): Uint8Array {
  const nonceBytes = toUtf8Bytes(walletNonce.toString());
  const recipientBytes = getBytes(recipient);
  const timestampBytes = getBytes(hexlify(toUtf8Bytes(Date.now().toString())));
  const salt = extraSalt || randomBytes(8);

  const hash = keccak256(concat([nonceBytes, recipientBytes, timestampBytes, salt]));
  return getBytes(hash).slice(0, 12);
}

export function generateNonce(): Uint8Array {
  return randomBytes(12);
}
