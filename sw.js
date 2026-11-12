// Service worker: keeps a full copy of the app so it works offline.
// Scripts and styles have a content hash in their file names, and the page itself is always fetched fresh
// when there is a connection, so a page can never be paired with an older cached script or stylesheet.
const VERSION = '135b966d';
const CACHE = `neuro-cpt-${VERSION}`;
const PRECACHE = [
  "./",
  "app.5968f896.css",
  "app.cc77d806.js",
  "data.966090ff.js",
  "fonts/cardo-400-italic.woff2",
  "fonts/cardo-400.woff2",
  "fonts/cardo-700.woff2",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "manifest.webmanifest",
  "search.9776efd2.js"
];
const SLOW_NETWORK_MS = 5000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('neuro-cpt-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The saved copy of the page that matches this version's saved scripts and styles.
const savedPage = () => caches.open(CACHE).then((c) => c.match('./'));

async function page(request) {
  // Ask the server directly (no browser cache) so a new version shows up on the first visit after it ships.
  const network = fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
    .then((res) => (res.redirected ? Response.redirect(res.url, 302) : res));
  // On a very slow connection, open the saved copy instead of waiting.
  const slow = new Promise((resolve) => setTimeout(resolve, SLOW_NETWORK_MS)).then(savedPage);
  try {
    return await Promise.race([network, slow.then((res) => res || network)]);
  } catch {
    return (await savedPage()) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(page(req));
    return;
  }

  // Everything else: the saved copy for this exact address, otherwise the network.
  event.respondWith(caches.open(CACHE).then((c) => c.match(req)).then((hit) => hit || fetch(req)));
});
