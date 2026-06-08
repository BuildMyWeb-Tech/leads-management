import { useState, useEffect } from 'react';
import { isInstalled } from '../../utils/registerSW';

/**
 * InstallPrompt — shows "Add to home screen" banner.
 * Uses the beforeinstallprompt event (Chrome/Android).
 * Dismissed state persisted in localStorage.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible]               = useState(false);

  useEffect(() => {
    // Already installed as PWA — don't show
    if (isInstalled()) return;

    // Already dismissed by user
    if (localStorage.getItem('pwa-install-dismissed')) return;

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
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem('pwa-install-dismissed', '1');
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pointer-events-none">
      <div className="max-w-sm mx-auto bg-white rounded-2xl shadow-lg border border-gray-200 p-4 pointer-events-auto">
        <div className="flex items-start gap-3">
          {/* App icon */}
          <img
            src="/icon-96x96.png"
            alt="A2S CRM"
            className="w-12 h-12 rounded-xl flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Install A2S CRM</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Add to your home screen for quick access, offline support, and a native app experience.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Install app
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
