const CACHE = 'farmers-campus-shell-v2';
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
    event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(ROOT, copy)); } return response; }).catch(() => caches.match(ROOT).then(cached => cached || new Response('Farmers is offline. Reconnect to load this page.', {status:503,headers:{'Content-Type':'text/plain'}}))));
  } else if (isAsset) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); } return response; })));
  }
});
