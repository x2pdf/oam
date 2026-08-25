import {
  keccak256,
  toUtf8Bytes,
  SigningKey,
  Wallet,
  getBytes,
  getBytesCopy,
  hexlify,
  randomBytes,
  concat,
  type BytesLike,
} from "ethers";

/**
 * WebCrypto / react-native-quick-crypto require BufferSource (ArrayBuffer view).
 * ethers v6 concat() returns hex strings; sliced Uint8Arrays share a larger buffer.
 * Always copy into a standalone ArrayBuffer of the exact length.
 */
function toBufferSource(data: BytesLike): ArrayBuffer {
  const bytes = getBytesCopy(data);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Personal-note key (A -> A).
 *
 * domain = UTF-8 "OAMP Personal Note Key Derivation"
 * sig    = EIP-191 personal_sign(domain) = r(32) || s(32) || v(1), v ∈ {27, 28}
 * key    = keccak256(sig)  // 32 bytes, AES-256
 */
export async function derivePersonalKey(wallet: Wallet): Promise<Uint8Array> {
  const message = "OAMP Personal Note Key Derivation";
  const signature = await wallet.signMessage(message);
  const sigBytes = getBytes(signature);
  if (sigBytes.length !== 65) {
    throw new Error(`personal_sign must return 65 bytes, got ${sigBytes.length}`);
  }
  return getBytes(keccak256(sigBytes));
}

/**
 * P2P AES key (A -> B).
 *
 * ECDH on secp256k1; shared point is encoded as SEC1 uncompressed
 * (65 bytes: 0x04 || X_be(32) || Y_be(32)), then key = keccak256(point).
 * Peer public key may be compressed or uncompressed as ECDH input;
 * the hashed encoding of the shared point is always uncompressed.
 */
export function deriveSharedSecret(
  senderPrivateKey: string,
  recipientPublicKey: string
): Uint8Array {
  const senderKey = new SigningKey(senderPrivateKey);
  const sharedPoint = getBytes(senderKey.computeSharedSecret(recipientPublicKey));
  if (sharedPoint.length !== 65 || sharedPoint[0] !== 0x04) {
    throw new Error("ECDH shared point must be SEC1 uncompressed (65 bytes, 0x04 prefix)");
  }
  return getBytes(keccak256(sharedPoint));
}

/**
 * AES-GCM encryption with AAD support
 */
export async function encrypt(
  key: Uint8Array,
  data: Uint8Array,
  nonce: Uint8Array,
  aad?: BytesLike
): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not available.");
  }

  const rawKey = toBufferSource(key);
  const rawData = toBufferSource(data);
  const rawIv = toBufferSource(nonce);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const algorithm: AesGcmParams = {
    name: "AES-GCM",
    iv: rawIv
  };
  if (aad != null) {
    const extra = toBufferSource(aad);
    if (extra.byteLength > 0) {
      algorithm.additionalData = extra;
    }
  }

  const encrypted = await crypto.subtle.encrypt(
    algorithm,
    cryptoKey,
    rawData
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
  aad?: BytesLike
): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not available.");
  }

  const rawKey = toBufferSource(key);
  const rawCiphertext = toBufferSource(ciphertext);
  const rawIv = toBufferSource(nonce);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const algorithm: AesGcmParams = {
    name: "AES-GCM",
    iv: rawIv
  };
  if (aad != null) {
    const extra = toBufferSource(aad);
    if (extra.byteLength > 0) {
      algorithm.additionalData = extra;
    }
  }

  const decrypted = await crypto.subtle.decrypt(
    algorithm,
    cryptoKey,
    rawCiphertext
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
