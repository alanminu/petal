import { get, set } from 'idb-keyval';
import type { Reminders } from '../types';
import type { Forecast } from './cycle';
import { addDays, diffDays } from './dates';

// Notifications without a server: Petal shows the heads-up when it is opened on
// or after the due date. It also leaves the due date (nothing else) where the
// service worker can read it, so browsers that support periodic background sync
// (installed Chrome on Android) can show it while the app is closed.
const PENDING = 'petal-reminder';
const SHOWN = 'petal-reminder-shown';

export interface PendingReminder {
  due: string;
  tag: string;
  title: string;
  body: string;
}

export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const result = await Notification.requestPermission();
  if (result !== 'granted') return false;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      periodicSync?: { register(tag: string, opts: { minInterval: number }): Promise<void> };
    };
    await reg.periodicSync?.register(PENDING, { minInterval: 12 * 60 * 60 * 1000 });
  } catch {
    // Periodic sync is optional; opening the app still triggers the reminder.
  }
  return true;
}

export function buildReminder(r: Reminders, f: Forecast | null, lastStart: string | undefined): PendingReminder | null {
  if (!r.periodHeadsUp || !f || !lastStart) return null;
  const next = f.upcoming[0];
  return {
    due: addDays(next.earliest, -r.daysBefore),
    tag: lastStart,
    title: r.discreet ? 'Petal' : 'Period heads-up',
    body: r.discreet
      ? 'A heads-up for the next few days. Open Petal for details.'
      : `Your period is likely in about ${r.daysBefore} day${r.daysBefore === 1 ? '' : 's'}. A good time to pack supplies.`,
  };
}

/** Stores the next reminder for the service worker and shows it now if it is due. */
export async function syncReminder(pending: PendingReminder | null, f: Forecast | null, today: string): Promise<void> {
  await set(PENDING, pending);
  if (!pending || !f || f.onPeriod) return;
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const untilLatest = diffDays(f.upcoming[0].latest, today);
  if (today < pending.due || untilLatest < 0) return;
  if ((await get<string>(SHOWN)) === pending.tag) return;
  await set(SHOWN, pending.tag);
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.showNotification(pending.title, { body: pending.body, tag: 'petal-heads-up', icon: './icon-192.png' });
  else new Notification(pending.title, { body: pending.body, tag: 'petal-heads-up' });
}
