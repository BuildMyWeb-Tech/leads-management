/**
 * registerSW.js — Service Worker registration with update flow.
 *
 * Called once from index.js.
 * Handles: first install, update available, offline/online events.
 */

export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service workers not supported');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('[PWA] Service worker registered:', registration.scope);

      // Check for updates every 60 seconds while app is open
      setInterval(() => registration.update(), 60 * 1000);

      // New SW waiting — notify user to refresh
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Dispatch custom event — caught by UpdateBanner component
            window.dispatchEvent(new CustomEvent('sw-update-available'));
          }
        });
      });

    } catch (err) {
      console.error('[PWA] Service worker registration failed:', err);
    }
  });

  // Online / offline events — dispatch for UI components
  window.addEventListener('online',  () => window.dispatchEvent(new CustomEvent('app-online')));
  window.addEventListener('offline', () => window.dispatchEvent(new CustomEvent('app-offline')));
};

// ── Check if app is installed (standalone mode) ──────────────
export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

// ── Get shared image from Cache Storage (Web Share Target) ───
export const getSharedImage = async () => {
  try {
    const caches_list = await caches.keys();
    const shareCache  = caches_list.find((k) => k.includes('-share'));
    if (!shareCache) return null;

    const cache    = await caches.open(shareCache);
    const response = await cache.match('/shared-image');
    if (!response) return null;

    const blob     = await response.blob();
    const filename = response.headers.get('X-Share-Filename') || 'shared-image.jpg';
    const file     = new File([blob], filename, { type: blob.type });

    // Clear after retrieval — one-time use
    await cache.delete('/shared-image');

    return file;
  } catch (err) {
    console.error('[PWA] getSharedImage error:', err);
    return null;
  }
};

// ── Request persistent storage (for better PWA data retention) ─
export const requestPersistentStorage = async () => {
  if (navigator.storage?.persist) {
    const granted = await navigator.storage.persist();
    console.log('[PWA] Persistent storage:', granted ? 'granted' : 'denied');
    return granted;
  }
  return false;
};
