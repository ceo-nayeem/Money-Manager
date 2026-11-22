/* FinVault service worker
 * - Pre-caches the app shell so the app opens instantly and works offline.
 * - The app's own files (index.html, style.css, app.js, services): network-first → after you edit a file and
 *   redeploy, the next reload already shows it; when offline the saved copy is used.
 * - CDN libraries (Chart.js, Firebase SDK, fonts) and icons: stale-while-revalidate (fast, refreshed in background).
 * - Firebase / Google API traffic (Auth, Firestore, sign-in popup) is NEVER intercepted.
 * Bump VERSION only when you ADD or REMOVE files (so the offline file list is rebuilt).
 */
const VERSION = 'fv-v3';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';

const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

// Cross-origin hosts whose static files are safe to cache.
const CACHEABLE_HOSTS = [
  'www.gstatic.com',            // Firebase JS SDK modules
  'cdnjs.cloudflare.com',       // Chart.js
  'fonts.googleapis.com',       // Google Fonts CSS
  'fonts.gstatic.com'           // Google Fonts files
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // add one by one so a single missing file never blocks the install
    await Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isCacheable(response) {
  return response && (response.ok || response.type === 'opaque');
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await Promise.race([
      fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }),   // bypass the HTTP cache so updates show up immediately
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ]);
    if (fresh && fresh.ok) cache.put('./index.html', fresh.clone()).catch(() => {});
    return fresh;
  } catch (e) {
    const cached = (await cache.match('./index.html')) || (await cache.match('./')) || (await caches.match(request));
    if (cached) return cached;
    throw e;
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await Promise.race([
      fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);
    if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  } catch (e) {
    const cached = (await cache.match(request)) || (await caches.match(request));
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (isCacheable(res)) cache.put(request, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return;

  // Firebase Hosting's reserved auth/init endpoints — always network
  if (url.origin === self.location.origin && url.pathname.startsWith('/__/')) return;

  // App pages
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
    return;
  }
  // Same-origin files: icons/manifest → fast path; everything else (style.css, app.js, services) → always fresh when online
  if (url.origin === self.location.origin) {
    const isStatic = url.pathname.includes('/icons/') || url.pathname.endsWith('.webmanifest');
    event.respondWith(isStatic ? staleWhileRevalidate(req) : networkFirstAsset(req));
    return;
  }
  // Allow-listed CDNs (but never Firebase data/auth APIs, which live on other hosts)
  if (CACHEABLE_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});
