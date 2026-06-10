/**
 * sw.js — A2S CRM Service Worker
 *
 * FIXES vs previous version:
 *  1. Merged duplicate addEventListener('fetch') — was two separate handlers,
 *     second (Web Share Target) never fired because first caught everything.
 *  2. skipWaiting() moved to message handler so UpdateBanner controls it.
 *  3. Push notification handler fully implemented.
 *  4. Offline fallback improved.
 *
 * Cache strategies:
 *   App Shell (HTML/JS/CSS)  → Cache First, network fallback
 *   API requests             → Network First, stale fallback
 *   Static assets (bundles)  → Cache First (immutable hashes)
 *   Tesseract WASM           → Cache First (large, rarely changes)
 */

const APP_VERSION  = 'a2s-crm-v9';
const SHELL_CACHE  = `${APP_VERSION}-shell`;
const DATA_CACHE   = `${APP_VERSION}-data`;
const STATIC_CACHE = `${APP_VERSION}-static`;
const SHARE_CACHE  = `${APP_VERSION}-share`;

// App shell — cache on install
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', APP_VERSION);
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_URLS).catch((err) => {
        // Don't block install if some shell URLs fail
        console.warn('[SW] Shell cache partial failure:', err);
      });
    })
  );
  // Do NOT call skipWaiting() here — let UpdateBanner control the update
  // so users see the "New version available" prompt instead of silent reload
});

// ── Activate — clean old caches ──────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', APP_VERSION);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) =>
            k.startsWith('a2s-crm-') && !k.startsWith(APP_VERSION)
          )
          .map((k) => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    )
  );
  // Take control of all open pages immediately
  self.clients.claim();
});

// ── Message handler — skipWaiting from UpdateBanner ──────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] Skipping waiting — applying update');
    self.skipWaiting();
  }
});

// ── Single fetch handler (FIXED — was split into two) ────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Web Share Target (POST /ocr-capture) ─────────────────
  // Must be checked FIRST before the GET-only guard below
  if (
    request.method === 'POST' &&
    url.pathname === '/ocr-capture'
  ) {
    event.respondWith(
      (async () => {
        try {
          const formData  = await event.request.formData();
          const imageFile = formData.get('image');

          if (imageFile && imageFile instanceof File) {
            const cache  = await caches.open(SHARE_CACHE);
            const buffer = await imageFile.arrayBuffer();
            await cache.put(
              '/shared-image',
              new Response(buffer, {
                headers: {
                  'Content-Type':      imageFile.type || 'image/jpeg',
                  'X-Share-Filename':  imageFile.name || 'shared-image.jpg',
                },
              })
            );
          }
        } catch (err) {
          console.error('[SW] Share target error:', err);
        }
        // Redirect to OCR page — React picks up ?shared=1 to retrieve the file
        return Response.redirect('/ocr-capture?shared=1', 303);
      })()
    );
    return;
  }

  // ── Skip non-GET requests (POST/PUT/DELETE → network only) ─
  if (request.method !== 'GET') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({
            message: 'You are offline. Please reconnect to save changes.',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // ── Skip cross-origin requests ─────────────────────────────
  if (url.origin !== self.location.origin) {
    // Let Google Fonts and other CDN requests pass through normally
    event.respondWith(fetch(request));
    return;
  }

  // ── 1. Tesseract WASM / worker — Cache First (large files) ─
  if (
    url.pathname.includes('tesseract') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.includes('tesseract-worker')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── 2. Static assets (hashed JS/CSS bundles, icons) ────────
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/) ||
    url.pathname.startsWith('/static/')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── 3. API requests — Network First with stale fallback ────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, DATA_CACHE));
    return;
  }

  // ── 4. HTML navigation — Shell fallback (SPA routes) ───────
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
        .then((res) => res || caches.match('/index.html'))
    );
    return;
  }

  // ── 5. Everything else — Network First ─────────────────────
  event.respondWith(networkFirstWithCache(request, DATA_CACHE));
});

// ── Cache strategies ─────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — resource not cached', { status: 503 });
  }
}

async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({
        message: 'You are offline. Showing cached data.',
        offline: true,
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Push notifications ───────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const options = {
      body:    data.body    || '',
      icon:    '/icon-192x192.png',
      badge:   '/icon-72x72.png',
      tag:     data.tag     || 'crm-notification',
      data:    { url: data.url || '/dashboard' },
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
      vibrate: [200, 100, 200],
    };
    event.waitUntil(
      self.registration.showNotification(data.title || 'A2S CRM', options)
    );
  } catch (err) {
    console.error('[SW] Push notification error:', err);
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing tab if open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new tab
        return clients.openWindow(url);
      })
  );
});

// ── Background sync (future) ─────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-leads') {
    console.log('[SW] Background sync: sync-leads');
  }
});