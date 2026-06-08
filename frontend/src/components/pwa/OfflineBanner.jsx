import { useState, useEffect } from 'react';

/**
 * OfflineBanner — slim top bar shown when network is unavailable.
 * Disappears automatically when back online.
 */
export default function OfflineBanner() {
  const [offline, setOffline]   = useState(!navigator.onLine);
  const [showBack, setShowBack] = useState(false);
  const [timer, setTimer]       = useState(null);

  useEffect(() => {
    const goOffline = () => {
      setOffline(true);
      setShowBack(false);
      if (timer) clearTimeout(timer);
    };

    const goOnline = () => {
      setShowBack(true);
      setOffline(false);
      // Hide "back online" message after 3s
      const t = setTimeout(() => setShowBack(false), 3000);
      setTimer(t);
    };

    window.addEventListener('app-offline', goOffline);
    window.addEventListener('app-online',  goOnline);
    // Also listen to native events as fallback
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);

    return () => {
      window.removeEventListener('app-offline', goOffline);
      window.removeEventListener('app-online',  goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
      if (timer) clearTimeout(timer);
    };
  }, [timer]);

  if (!offline && !showBack) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300
      ${offline
        ? 'bg-red-500'
        : 'bg-green-500'
      }`}
    >
      <div className="flex items-center justify-center gap-2 px-4 py-2">
        {offline ? (
          <>
            <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a5 5 0 010-7.072M9.172 9.172a5 5 0 000 7.07M5.636 5.636a9 9 0 000 12.728M12 12h.01" />
            </svg>
            <p className="text-white text-xs font-medium">
              You're offline — showing cached data. Changes won't save until you reconnect.
            </p>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-white text-xs font-medium">Back online!</p>
          </>
        )}
      </div>
    </div>
  );
}
