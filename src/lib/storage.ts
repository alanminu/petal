import { del, get, set } from 'idb-keyval';
import type { AppData } from '../types';
import { decryptJSON, deriveKey, encryptJSON, randomBytes } from './crypto';

// Everything lives in one IndexedDB record on this device. Nothing is sent anywhere.
const KEY = 'petal-data';

type Stored =
  | { v: 1; enc: false; data: AppData }
  | { v: 1; enc: true; salt: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer };

export interface Lock {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
}

export type LoadResult = { state: 'empty' } | { state: 'locked' } | { state: 'open'; data: unknown };

export async function load(): Promise<LoadResult> {
  const s = await get<Stored>(KEY);
  if (!s) return { state: 'empty' };
  if (s.enc) return { state: 'locked' };
  return { state: 'open', data: s.data };
}

/** Returns the decrypted data and the key to keep using, or null if the PIN is wrong. */
export async function unlock(pin: string): Promise<{ data: unknown; lock: Lock } | null> {
  const s = await get<Stored>(KEY);
  if (!s || !s.enc) return null;
  try {
    const key = await deriveKey(pin, s.salt);
    const data = await decryptJSON(key, s.iv, s.ct);
    return { data, lock: { key, salt: s.salt } };
  } catch {
    return null;
  }
}

export async function createLock(pin: string): Promise<Lock> {
  const salt = randomBytes(16);
  return { key: await deriveKey(pin, salt), salt };
}

export async function save(data: AppData, lock: Lock | null): Promise<void> {
  if (!lock) return set(KEY, { v: 1, enc: false, data } satisfies Stored);
  const { iv, ct } = await encryptJSON(lock.key, data);
  return set(KEY, { v: 1, enc: true, salt: lock.salt, iv, ct } satisfies Stored);
}

export const erase = (): Promise<void> => del(KEY);
