// Offline support, update handling, and the background half of the period
// heads-up reminder. The two placeholders below are filled in at build time
// (see vite.config.ts).
const VERSION = '__VERSION__';
const PRECACHE = ['__PRECACHE__'];
const CACHE = `petal-${VERSION}`;

const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Petal</title><body style="font-family:system-ui,sans-serif;background:#fbf5ee;color:#3d2b30;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">
<div><h1 style="font-size:1.5rem">You're offline</h1><p>Petal has not finished saving itself to this device yet. Connect once and open it again; after that it works without a connection.</p>
<button onclick="location.reload()" style="font:inherit;font-weight:700;border:0;border-radius:999px;padding:12px 24px;background:#d9627d;color:#fffaf7">Try again</button></div>`;

// Cache the whole app up front. A new version waits until the app asks it to take over.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...PRECACHE.filter((f) => f !== 'index.html')])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Serve this version's page so the page and its files always match.
    event.respondWith(
      caches.match('./', { cacheName: CACHE, ignoreVary: true }).then(
        (hit) => hit || fetch(req).catch(() => new Response(OFFLINE_PAGE, { headers: { 'content-type': 'text/html' } })),
      ),
    );
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req)));
});

// The app stores { due, tag, title, body } under 'petal-reminder' (see src/lib/reminders.ts).
function store(mode) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('keyval-store');
    open.onupgradeneeded = () => open.result.createObjectStore('keyval');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(open.result.transaction('keyval', mode).objectStore('keyval'));
  });
}
const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const read = async (key) => wrap((await store('readonly')).get(key));
const write = async (key, value) => wrap((await store('readwrite')).put(value, key));

async function checkReminder() {
  const pending = await read('petal-reminder');
  if (!pending) return;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (today < pending.due || (await read('petal-reminder-shown')) === pending.tag) return;
  await write('petal-reminder-shown', pending.tag);
  await self.registration.showNotification(pending.title, { body: pending.body, tag: 'petal-heads-up', icon: './icon-192.png' });
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'petal-reminder') event.waitUntil(checkReminder());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('./'))),
  );
});
