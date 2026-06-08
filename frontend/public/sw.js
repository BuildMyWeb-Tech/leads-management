/**
 * sw.js — A2S CRM Service Worker (Phase 8)
 *
 * Cache strategies:
 *   App Shell (HTML/JS/CSS)  → Cache First, network fallback
 *   API requests             → Network First, cache fallback (stale-while-revalidate)
 *   Static assets            → Cache First (immutable)
 *   Tesseract WASM           → Cache First (large, rarely changes)
 *
 * Offline behaviour:
 *   - App shell always available offline
 *   - Last-fetched API data served from cache when offline
 *   - OCR still works offline (Tesseract WASM cached)
 *   - Mutations (POST/PUT/DELETE) fail gracefully with clear error
 */

const APP_VERSION   = 'a2s-crm-v8';
const SHELL_CACHE   = `${APP_VERSION}-shell`;
const DATA_CACHE    = `${APP_VERSION}-data`;
const STATIC_CACHE  = `${APP_VERSION}-static`;

// App shell — always cache these on install
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(SHELL_URLS).catch((err) => {
        console.warn('[SW] Shell cache partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate — clean old caches ──────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('a2s-crm-') && !k.startsWith(APP_VERSION))
          .map((k) => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch strategy router ────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests for caching (POST/PUT/DELETE go straight to network)
  if (request.method !== 'GET') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ message: 'You are offline. Please reconnect to save changes.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // 1. Tesseract WASM & worker files — Cache First (large, immutable-ish)
  if (
    url.pathname.includes('tesseract') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.includes('tesseract-worker')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 2. Static assets (JS bundles, CSS, icons) — Cache First
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/) ||
    url.pathname.startsWith('/static/')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 3. API requests — Network First, stale fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, DATA_CACHE));
    return;
  }

  // 4. App navigation (HTML) — Shell fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 5. Everything else — Network First
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
      JSON.stringify({ message: 'You are offline. Showing cached data.', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Web Share Target handler ─────────────────────────────────
// When user shares an image to the app via Web Share Target API,
// the POST comes here. We redirect to /ocr-capture with the image
// stored in Cache Storage so the page can retrieve it.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    event.request.method === 'POST' &&
    url.pathname === '/ocr-capture'
  ) {
    event.respondWith(
      (async () => {
        try {
          const formData  = await event.request.formData();
          const imageFile = formData.get('image');

          if (imageFile && imageFile instanceof File) {
            // Store the shared image in Cache Storage so the page can pick it up
            const cache  = await caches.open(`${APP_VERSION}-share`);
            const buffer = await imageFile.arrayBuffer();
            await cache.put(
              '/shared-image',
              new Response(buffer, {
                headers: {
                  'Content-Type': imageFile.type || 'image/jpeg',
                  'X-Share-Filename': imageFile.name || 'shared-image.jpg',
                },
              })
            );
          }
        } catch (err) {
          console.error('[SW] Share target error:', err);
        }

        // Redirect to OCR capture page
        return Response.redirect('/ocr-capture?shared=1', 303);
      })()
    );
  }
});

// ── Background sync (future-ready stub) ─────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-leads') {
    console.log('[SW] Background sync: sync-leads');
    // Phase 9 will use this for offline mutation queuing
  }
});

// ── Push notification handler (Phase 9 stub) ────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'A2S CRM', {
        body:    data.body    || '',
        icon:    '/icon-192x192.png',
        badge:   '/icon-72x72.png',
        tag:     data.tag     || 'crm-notification',
        data:    data.url     ? { url: data.url } : {},
        actions: data.actions || [],
      })
    );
  } catch (err) {
    console.error('[SW] Push notification error:', err);
  }
});

// Handle notification click — navigate to relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
