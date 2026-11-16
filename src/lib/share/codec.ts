// End-to-end encryption for sharing. Each share has its own random AES-256 key
// that travels only inside the pairing code, from one device to the other.
// The server stores ciphertext and never sees a key.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function newSecrets() {
  return { id: crypto.randomUUID(), key: toB64(random(32)), writeToken: toB64(random(24)) };
}

export async function sha256Hex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Pairing code = room id (16 bytes) + key (32 bytes), base64url, with a version prefix.
const PREFIX = 'P1-';

export function pairingCode(id: string, key: string): string {
  const idBytes = new Uint8Array(id.replace(/-/g, '').match(/../g)!.map((h) => parseInt(h, 16)));
  const bytes = new Uint8Array(48);
  bytes.set(idBytes, 0);
  bytes.set(fromB64(key), 16);
  return PREFIX + toB64(bytes);
}

/** Accepts a bare code or a full pairing link. Returns null if it is not a valid code. */
export function parsePairing(input: string): { id: string; key: string } | null {
  const match = input.trim().match(/P1-[A-Za-z0-9_-]{64}/);
  if (!match) return null;
  try {
    const bytes = fromB64(match[0].slice(PREFIX.length));
    if (bytes.length !== 48) return null;
    const hex = [...bytes.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return { id, key: toB64(bytes.slice(16)) };
  } catch {
    return null;
  }
}

/** The key sits after '#', which browsers never send to a server. */
export const pairingLink = (code: string): string => `${location.origin}${location.pathname}#pair=${code}`;

const keys = new Map<string, Promise<CryptoKey>>();
function importKey(key: string): Promise<CryptoKey> {
  let k = keys.get(key);
  if (!k) {
    k = crypto.subtle.importKey('raw', fromB64(key), 'AES-GCM', false, ['encrypt', 'decrypt']);
    keys.set(key, k);
  }
  return k;
}

/** Encrypts a value to a single string: "<iv>.<ciphertext>". */
export async function seal(key: string, value: unknown): Promise<string> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(key), enc.encode(JSON.stringify(value)));
  return `${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

/** Returns null when the text cannot be decrypted with this key. */
export async function open<T>(key: string, sealed: string): Promise<T | null> {
  try {
    const [iv, ct] = sealed.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await importKey(key), fromB64(ct));
    return JSON.parse(dec.decode(plain)) as T;
  } catch {
    return null;
  }
}
