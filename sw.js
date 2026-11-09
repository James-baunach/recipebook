// Offline support: serve from cache first, refresh the cache in the background.
const CACHE = 'recipebook-v2';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/util.js', 'js/db.js', 'js/parse.js', 'js/store.js', 'js/helper.js',
  'js/views/browse.js', 'js/views/cards.js', 'js/views/recipe.js', 'js/views/edit.js', 'js/views/cook.js', 'js/views/compare.js',
  'js/views/diff.js', 'js/views/fridge.js', 'js/views/mine.js', 'js/views/shopping.js', 'js/views/settings.js', 'js/views/logcook.js', 'js/views/inbox.js', 'js/inbox.js', 'js/ocr.js',
  'data/index.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    const idx = await fetch('data/index.json').then((r) => r.json()).catch(() => ({}));
    const files = Object.values(idx).flat().map((f) => `data/${f}`);
    await c.addAll(files);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (await c.match('index.html')) || new Response('Offline', { status: 503 });
  })());
});
