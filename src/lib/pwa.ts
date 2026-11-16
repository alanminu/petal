import { useEffect, useState } from 'react';

// Service worker registration and update handling. A new version installs in
// the background and waits; the app shows a notice and switches only when asked.

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const setWaiting = (sw: ServiceWorker | null) => {
  waiting = sw;
  listeners.forEach((l) => l());
};

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return;
        const check = () => sw.state === 'installed' && navigator.serviceWorker.controller && setWaiting(sw);
        check();
        sw.addEventListener('statechange', check);
      };
      track(reg.waiting);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Look for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => !document.hidden && void reg.update().catch(() => undefined));
    } catch {
      // Without a service worker the app still works online.
    }
  });
}

/** Switches to the waiting version and reloads once it has taken over. */
export function applyUpdate(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage('SKIP_WAITING');
}

export function useUpdateReady(): boolean {
  const [ready, setReady] = useState(Boolean(waiting));
  useEffect(() => {
    const l = () => setReady(Boolean(waiting));
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return ready;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
