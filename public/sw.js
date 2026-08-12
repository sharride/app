/*
 * Sharride service worker.
 *
 * IMPORTANT — why this is a *runtime-cache* worker and not a precache worker:
 * The project builds with plain Vite (no vite-plugin-pwa / Workbox), so the
 * hashed JS/CSS filenames Vite produces on `npm run build` aren't known
 * ahead of time and can't be listed here. Instead, this worker:
 *   1. Precaches only files with STABLE paths (app shell, icons, fonts,
 *      manifest) on install.
 *   2. Opportunistically caches every other same-origin GET response the
 *      first time it's fetched (stale-while-revalidate), so repeat visits
 *      and most offline use are fast/available without guessing filenames.
 *   3. NEVER touches Supabase (cross-origin) requests or non-GET requests —
 *      auth, journeys, bookings, notifications must always hit the network.
 *
 * If the project later adopts `vite-plugin-pwa`, this file should be
 * replaced by its generated worker (proper precache manifest + versioning).
 */

const CACHE_VERSION = 'sharride-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/fonts/Cairo-Regular.woff2',
  '/fonts/Cairo-Bold.woff2',
  '/fonts/Inter-Regular.woff2',
  '/fonts/Inter-SemiBold.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch((err) => {
        // Don't fail install over a single missing shell asset (e.g. during
        // local dev where some of these may 404).
        console.warn('[sw] shell precache had an issue:', err);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('sharride-') && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isSupabaseRequest(url) {
  return /\.supabase\.co$/.test(url.hostname) || url.hostname.includes('supabase');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only ever handle same-origin GET requests. Everything else (Supabase
  // REST/Auth/Realtime, OAuth redirects, POST/PUT/DELETE, etc.) must go
  // straight to the network, untouched.
  if (request.method !== 'GET' || url.origin !== self.location.origin || isSupabaseRequest(url)) {
    return;
  }

  // SPA navigations: network-first, fall back to cached shell when offline
  // so the app still boots (React Router then renders an offline-aware
  // screen client-side) instead of showing the browser's default error.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else same-origin (built JS/CSS chunks, images, fonts):
  // stale-while-revalidate — serve from cache instantly if we have it,
  // and refresh the cache in the background for next time.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
