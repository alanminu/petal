import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppData, DayLog, ISODate, Settings } from './types';
import { emptyData, isEmptyLog, normalizeData } from './types';
import { addDays, todayISO } from './lib/dates';
import * as storage from './lib/storage';

type Status = 'loading' | 'locked' | 'ready';

interface Store {
  status: Status;
  data: AppData;
  hasPin: boolean;
  updateLog(date: ISODate, patch: Partial<Omit<DayLog, 'date'>>): void;
  /** Fills a run of days with medium flow without overwriting days that already have a flow. */
  addPeriod(start: ISODate, days: number): void;
  updateSettings(patch: Partial<Settings>): void;
  /** Records supplies used on a day (delta may be negative) and adjusts the stock to match. */
  logSupplyUse(date: ISODate, id: string, delta: number): void;
  /** General-purpose change for features that own a slice of the data. */
  update(fn: (prev: AppData) => AppData): void;
  replaceData(next: AppData): void;
  unlock(pin: string): Promise<boolean>;
  lock(): void;
  setPin(pin: string): Promise<void>;
  removePin(): Promise<void>;
  eraseAll(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
};

/** Lock again if the app has been in the background this long. */
const AUTO_LOCK_MS = 60_000;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<AppData>(emptyData);
  const [hasPin, setHasPin] = useState(false);
  const lockRef = useRef<storage.Lock | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    storage.load().then((r) => {
      if (r.state === 'locked') {
        setHasPin(true);
        setStatus('locked');
      } else {
        if (r.state === 'open') setData(normalizeData(r.data));
        setStatus('ready');
      }
    });
    // Ask the browser not to evict our data under storage pressure.
    void navigator.storage?.persist?.();
  }, []);

  // Persist after every change made while unlocked.
  useEffect(() => {
    if (status !== 'ready' || !dirty.current) return;
    dirty.current = false;
    void storage.save(data, lockRef.current);
  }, [data, status]);

  const change = useCallback((fn: (prev: AppData) => AppData) => {
    dirty.current = true;
    setData(fn);
  }, []);

  const lock = useCallback(() => {
    if (!lockRef.current) return;
    lockRef.current = null;
    dirty.current = false;
    setData(emptyData());
    setStatus('locked');
  }, []);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) lock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [lock]);

  const store = useMemo<Store>(
    () => ({
      status,
      data,
      hasPin,
      updateLog(date, patch) {
        if (date > todayISO()) return;
        change((prev) => {
          const current: DayLog = prev.logs[date] ?? { date, symptoms: [], moods: [], tags: [] };
          const next: DayLog = { ...current, ...patch, date };
          const logs = { ...prev.logs };
          if (isEmptyLog(next)) delete logs[date];
          else logs[date] = next;
          return { ...prev, logs };
        });
      },
      addPeriod(start, days) {
        const today = todayISO();
        change((prev) => {
          const logs = { ...prev.logs };
          for (let i = 0; i < days; i++) {
            const date = addDays(start, i);
            if (date > today) break;
            const current: DayLog = logs[date] ?? { date, symptoms: [], moods: [], tags: [] };
            if ((current.flow ?? 0) < 2) logs[date] = { ...current, flow: 3 };
          }
          return { ...prev, logs };
        });
      },
      updateSettings(patch) {
        change((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
      },
      logSupplyUse(date, id, delta) {
        change((prev) => {
          const current: DayLog = prev.logs[date] ?? { date, symptoms: [], moods: [], tags: [] };
          const before = current.used?.[id] ?? 0;
          const after = Math.max(0, before + delta);
          if (after === before) return prev;
          const used = { ...current.used };
          if (after === 0) delete used[id];
          else used[id] = after;
          const next: DayLog = { ...current, used: Object.keys(used).length ? used : undefined };
          const logs = { ...prev.logs };
          if (isEmptyLog(next)) delete logs[date];
          else logs[date] = next;
          const supplies = prev.supplies.map((s) =>
            s.id === id ? { ...s, count: Math.max(0, s.count - (after - before)) } : s,
          );
          return { ...prev, logs, supplies };
        });
      },
      update: change,
      replaceData(next) {
        change(() => next);
      },
      async unlock(pin) {
        const r = await storage.unlock(pin);
        if (!r) return false;
        lockRef.current = r.lock;
        setData(normalizeData(r.data));
        setStatus('ready');
        return true;
      },
      lock,
      async setPin(pin) {
        lockRef.current = await storage.createLock(pin);
        setHasPin(true);
        await storage.save(data, lockRef.current);
      },
      async removePin() {
        lockRef.current = null;
        setHasPin(false);
        await storage.save(data, null);
      },
      async eraseAll() {
        await storage.erase();
        lockRef.current = null;
        dirty.current = false;
        setHasPin(false);
        setData(emptyData());
        setStatus('ready');
      },
    }),
    [status, data, hasPin, change, lock],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
