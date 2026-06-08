import { useState, useEffect } from 'react';

/**
 * UpdateBanner — shown when a new service worker version is available.
 * User clicks "Update" → sends skipWaiting message → page reloads with new version.
 */
export default function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener('sw-update-available', handler);
    return () => window.removeEventListener('sw-update-available', handler);
  }, []);

  const handleUpdate = () => {
    // Tell the waiting SW to take control
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
    window.location.reload();
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pointer-events-none">
      <div className="max-w-sm mx-auto bg-blue-600 rounded-xl shadow-lg p-3 pointer-events-auto flex items-center gap-3">
        <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <p className="text-white text-xs font-medium flex-1">
          A new version is available
        </p>
        <button
          onClick={handleUpdate}
          className="bg-white text-blue-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
        >
          Update
        </button>
        <button
          onClick={() => setShow(false)}
          className="text-blue-200 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
