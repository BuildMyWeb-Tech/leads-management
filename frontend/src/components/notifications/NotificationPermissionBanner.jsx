import { useState, useEffect } from 'react';
import { getPermissionState, subscribeToPush } from '../../utils/pushManager';
import toast from 'react-hot-toast';

/**
 * NotificationPermissionBanner — shown once to users who haven't
 * enabled push notifications yet. Dismissable permanently.
 */
export default function NotificationPermissionBanner() {
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed or not supported
    if (localStorage.getItem('push-banner-dismissed')) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (!('PushManager' in window)) return;

    const perm = getPermissionState();
    if (perm === 'default') {
      // Show after 2s delay — let page settle first
      const t = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(t);
    }
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    try {
      await subscribeToPush('Default device');
      toast.success('Push notifications enabled!');
      setShow(false);
    } catch (err) {
      toast.error(err.message);
      if (err.message.includes('denied')) setShow(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('push-banner-dismissed', '1');
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pointer-events-none">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-gray-200 p-4 pointer-events-auto">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Enable notifications</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Get notified instantly when leads are assigned to you, follow-ups are due, and more.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleEnable}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Enabling…' : 'Enable now'}
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
