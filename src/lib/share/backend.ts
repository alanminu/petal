import { createClient } from '@supabase/supabase-js';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// Thin wrapper around the Supabase functions defined in supabase/schema.sql.
// Everything passed as `payload` is already encrypted on the device.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False until the two VITE_SUPABASE_* values are set (see .env.example). */
export const sharingConfigured = Boolean(url && anonKey);

let client: SupabaseClient | undefined;
function sb(): SupabaseClient {
  if (!sharingConfigured) throw new Error('Sharing is not set up yet.');
  client ??= createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(error.message || 'The sharing server could not be reached.');
  return data as T;
}

export interface ServerMessage {
  id: number;
  /** 'o' = the person tracking, 's' = the supporter. */
  sender: 'o' | 's';
  payload: string;
  created_at: string;
}

export const createRoom = (room: string, writeHash: string) =>
  call<void>('petal_create_room', { p_room: room, p_write_hash: writeHash });

export const putSnapshot = (room: string, token: string, payload: string) =>
  call<void>('petal_put_snapshot', { p_room: room, p_token: token, p_payload: payload });

/** Null means the room no longer exists: sharing was stopped. */
export async function getSnapshot(room: string): Promise<{ payload: string | null; updated_at: string | null } | null> {
  const rows = await call<{ payload: string | null; updated_at: string | null }[] | null>('petal_get_snapshot', { p_room: room });
  return rows?.[0] ?? null;
}

export const postMessage = (room: string, sender: 'o' | 's', payload: string) =>
  call<number>('petal_post_message', { p_room: room, p_sender: sender, p_payload: payload });

export const getMessages = async (room: string, after = 0) =>
  (await call<ServerMessage[] | null>('petal_get_messages', { p_room: room, p_after: after })) ?? [];

export const deleteRoom = (room: string, token: string) =>
  call<void>('petal_delete_room', { p_room: room, p_token: token });

// Live updates: a broadcast channel per room carries a contentless "something
// changed" signal; the receiver then fetches and decrypts as usual.
const channels = new Map<string, { channel: RealtimeChannel; listeners: Set<() => void> }>();

export function subscribe(room: string, onChange: () => void): () => void {
  let entry = channels.get(room);
  if (!entry) {
    const listeners = new Set<() => void>();
    const channel = sb()
      .channel(`petal:${room}`)
      .on('broadcast', { event: 'changed' }, () => listeners.forEach((l) => l()))
      .subscribe();
    entry = { channel, listeners };
    channels.set(room, entry);
  }
  entry.listeners.add(onChange);
  return () => {
    const e = channels.get(room);
    if (!e) return;
    e.listeners.delete(onChange);
    if (e.listeners.size === 0) {
      void sb().removeChannel(e.channel);
      channels.delete(room);
    }
  };
}

/** Tells the other device to refresh now. Best effort; polling covers a miss. */
export function announce(room: string): void {
  const entry = channels.get(room);
  void (entry?.channel ?? sb().channel(`petal:${room}`))
    .send({ type: 'broadcast', event: 'changed', payload: {} })
    .catch(() => undefined);
}
