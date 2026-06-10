import { useState, useEffect } from 'react';
import { isInstalled } from '../../utils/registerSW';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible]               = useState(false);
  const [isIOS, setIsIOS]                   = useState(false);

  useEffect(() => {
    // Already installed as PWA — don't show
    if (isInstalled()) return;
    // Already dismissed
    if (localStorage.getItem('pwa-install-dismissed')) return;

    // Detect iOS Safari (no beforeinstallprompt support)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !window.navigator.standalone;
    if (ios) {
      setIsIOS(true);
      // Show iOS manual instruction after 3s
      const t = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(t);
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem('pwa-install-dismissed', '1');
  };

  if (!visible) return null;

  return (
    /* Bottom banner — sits above nav safe area */
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 pointer-events-none"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="max-w-sm mx-auto bg-white rounded-2xl shadow-xl border border-gray-200
                      p-4 pointer-events-auto">
        <div className="flex items-start gap-3">
          {/* App icon */}
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center
                          flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Install A2S CRM</p>

            {isIOS ? (
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                Tap{' '}
                <span className="inline-flex items-center mx-0.5">
                  <svg className="w-3.5 h-3.5 text-blue-500 inline" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </span>
                {' '}Share → <strong>Add to Home Screen</strong>
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-0.5">
                Add to home screen for offline access & fast launch.
              </p>
            )}

            <div className="flex gap-2 mt-3">
              {!isIOS && (
                <button
                  onClick={handleInstall}
                  className="flex-1 bg-blue-600 text-white text-xs font-semibold
                             py-2.5 px-3 rounded-lg hover:bg-blue-700 transition-colors
                             touch-manipulation"
                >
                  Install app
                </button>
              )}
              <button
                onClick={handleDismiss}
                className="text-xs text-gray-400 hover:text-gray-600 px-2
                           transition-colors touch-manipulation"
              >
                {isIOS ? 'Got it' : 'Not now'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}