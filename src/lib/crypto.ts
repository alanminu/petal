// PIN-based encryption at rest using the browser's Web Crypto API.
// The PIN is never stored: it is stretched into an AES-GCM key with PBKDF2,
// and a wrong PIN simply fails to decrypt.

const ITERATIONS = 310_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const randomBytes = (n: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(n));

export async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(key: CryptoKey, value: unknown) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { iv, ct };
}

/** Throws if the key is wrong or the data was tampered with. */
export async function decryptJSON(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, ct: ArrayBuffer): Promise<unknown> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(dec.decode(plain));
}
