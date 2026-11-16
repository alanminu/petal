import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { todayISO } from './lib/dates';
import * as backend from './lib/share/backend';
import { open, seal } from './lib/share/codec';
import type { Note, SharedView } from './lib/share/view';
import { buildView } from './lib/share/view';
import { useStore } from './store';

const POLL_MS = 45_000;

export interface Message {
  id: number;
  /** Share or link id this message belongs to. */
  room: string;
  label: string;
  fromMe: boolean;
  text: string;
  at: number;
}

interface Peer {
  id: string;
  key: string;
  label: string;
}

async function loadMessages(peer: Peer, me: 'o' | 's'): Promise<Message[]> {
  const rows = await backend.getMessages(peer.id);
  const out: Message[] = [];
  for (const row of rows) {
    const note = await open<Note>(peer.key, row.payload);
    if (note && typeof note.text === 'string') {
      out.push({ id: row.id, room: peer.id, label: peer.label, fromMe: row.sender === me, text: note.text, at: note.at });
    }
  }
  return out;
}

/** Runs `refresh` now, on a timer, when the app returns to the foreground, and on a live signal from any room. */
function useLiveRefresh(rooms: string[], refresh: () => void) {
  const key = rooms.join(',');
  useEffect(() => {
    if (!backend.sharingConfigured || !key) return;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = key.split(',').map((room) => backend.subscribe(room, refresh));
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe.forEach((u) => u());
    };
  }, [key, refresh]);
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'The sharing server could not be reached.');

/** Tracker side: keeps each supporter's encrypted view up to date and exchanges nudges. */
export function useOwnerSync() {
  const { data, update } = useStore();
  const today = todayISO();
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const sent = useRef(new Map<string, string>());
  const shares = data.shares;

  // Upload a fresh view whenever what a supporter may see has changed.
  useEffect(() => {
    if (!backend.sharingConfigured || shares.length === 0) return;
    const timer = setTimeout(async () => {
      for (const share of shares) {
        const view = buildView(data, share, today);
        const json = JSON.stringify(view);
        if (sent.current.get(share.id) === json) continue;
        try {
          await backend.putSnapshot(share.id, share.writeToken, await seal(share.key, view));
          sent.current.set(share.id, json);
          backend.announce(share.id);
          setError('');
        } catch (e) {
          setError(errorText(e));
        }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [data, shares, today]);

  const sharesRef = useRef(shares);
  sharesRef.current = shares;
  const refresh = useCallback(() => {
    void (async () => {
      try {
        const lists = await Promise.all(sharesRef.current.map((s) => loadMessages(s, 'o')));
        setMessages(lists.flat().sort((a, b) => b.at - a.at));
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, []);
  useLiveRefresh(useMemo(() => shares.map((s) => s.id), [shares]), refresh);

  const sendNudge = useCallback(
    async (text: string, shareIds: string[]) => {
      for (const share of sharesRef.current.filter((s) => shareIds.includes(s.id) && !s.paused)) {
        await backend.postMessage(share.id, 'o', await seal(share.key, { text, at: Date.now() } satisfies Note));
        backend.announce(share.id);
      }
      refresh();
    },
    [refresh],
  );

  const markSeen = useCallback(() => {
    update((prev) => ({
      ...prev,
      shares: prev.shares.map((s) => ({
        ...s,
        seen: Math.max(s.seen, ...messages.filter((m) => m.room === s.id).map((m) => m.id)),
      })),
    }));
  }, [messages, update]);

  return { messages, error, sendNudge, markSeen };
}

export interface LinkState {
  /** 'loading' until the first fetch, 'ended' if sharing was stopped, 'waiting' before the first upload. */
  status: 'loading' | 'ok' | 'waiting' | 'ended' | 'unreadable' | 'error';
  view?: SharedView;
  updatedAt?: string;
  error?: string;
}

/** Supporter side: fetches and decrypts what each linked person shares, and exchanges messages. */
export function useSupporterSync() {
  const { data, update } = useStore();
  const links = data.supporter.links;
  const [states, setStates] = useState<Record<string, LinkState>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const linksRef = useRef(links);
  linksRef.current = links;

  const refresh = useCallback(() => {
    void (async () => {
      const next: Record<string, LinkState> = {};
      const lists: Message[][] = [];
      for (const link of linksRef.current) {
        try {
          const snap = await backend.getSnapshot(link.id);
          if (!snap) next[link.id] = { status: 'ended' };
          else if (!snap.payload) next[link.id] = { status: 'waiting' };
          else {
            const view = await open<SharedView>(link.key, snap.payload);
            next[link.id] = view
              ? { status: 'ok', view, updatedAt: snap.updated_at ?? undefined }
              : { status: 'unreadable' };
          }
          if (snap) lists.push(await loadMessages(link, 's'));
        } catch (e) {
          next[link.id] = { status: 'error', error: errorText(e) };
        }
      }
      setStates((prev) => {
        // Keep the last good view on screen through a temporary network error.
        for (const [id, s] of Object.entries(next)) if (s.status === 'error' && prev[id]?.view) next[id] = { ...prev[id], error: s.error };
        return next;
      });
      setMessages(lists.flat().sort((a, b) => b.at - a.at));
    })();
  }, []);
  useLiveRefresh(useMemo(() => links.map((l) => l.id), [links]), refresh);

  const reply = useCallback(
    async (linkId: string, text: string) => {
      const link = linksRef.current.find((l) => l.id === linkId);
      if (!link) return;
      await backend.postMessage(link.id, 's', await seal(link.key, { text, at: Date.now() } satisfies Note));
      backend.announce(link.id);
      refresh();
    },
    [refresh],
  );

  const markSeen = useCallback(
    (linkId: string) => {
      const top = Math.max(0, ...messages.filter((m) => m.room === linkId).map((m) => m.id));
      update((prev) => ({
        ...prev,
        supporter: {
          ...prev.supporter,
          links: prev.supporter.links.map((l) => (l.id === linkId && top > l.seen ? { ...l, seen: top } : l)),
        },
      }));
    },
    [messages, update],
  );

  return { states, messages, reply, markSeen, refresh };
}

export function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
