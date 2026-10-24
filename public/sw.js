const CACHE = 'farmers-responsive-ux-v7';
const ROOT = new URL('./', self.location.href).pathname;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([ROOT, `${ROOT}manifest.webmanifest`, `${ROOT}icons/icon-192.png`, `${ROOT}vendor/sql-wasm.wasm`, `${ROOT}vendor/sql-wasm-browser.wasm`])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('hcommunity-') || key.startsWith('farmers-')) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(ROOT)) return;
  if (url.pathname.includes('/api/') || url.pathname.endsWith('/sw.js')) return;
  const isAsset = url.pathname.includes('/_next/static/') || url.pathname.includes('/icons/') || url.pathname.includes('/vendor/');
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); } return response; }).catch(() => caches.match(event.request).then(cached => cached || caches.match(ROOT)).then(cached => cached || new Response('Farmers is offline. Reconnect to load this page.', {status:503,headers:{'Content-Type':'text/plain'}}))));
  } else if (isAsset) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); } return response; })));
  }
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Show a generic update for unreadable payloads. */ }
  const it = data.locale === 'it';
  const body = data.kind === 'match'
    ? (it ? 'Avete entrambi detto sì! Apri Farmers per conoscere il tuo match.' : 'You both said yes! Open Farmers to meet your match.')
    : data.kind === 'test'
      ? (it ? 'Le notifiche Farmers funzionano su questo dispositivo.' : 'Farmers notifications are working on this device.')
      : (it ? 'Un nuovo suggerimento ti aspetta. Apri Farmers per scoprirlo.' : 'A new suggestion is ready. Open Farmers to explore it.');
  event.waitUntil(self.registration.showNotification('Farmers', {
    body, icon: `${ROOT}icons/icon-192.png`, badge: `${ROOT}icons/icon-192.png`,
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 100) : 'farmers-update',
    data: { tab: data.kind === 'match' ? 'connections' : 'matches' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const tab = event.notification.data?.tab === 'connections' ? 'connections' : 'matches';
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname.startsWith(ROOT));
    if (existing) { existing.postMessage({ type: 'farmers-open-matches', tab }); await existing.focus(); }
    else await self.clients.openWindow(`${ROOT}?tab=${tab}`);
  })());
});
