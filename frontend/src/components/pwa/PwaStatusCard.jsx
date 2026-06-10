import { useState, useEffect } from 'react';
import { isInstalled } from '../../utils/registerSW';

export default function PwaStatusCard() {
  const [swStatus,  setSwStatus]  = useState('checking');
  const [cacheSize, setCacheSize] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isInstalled());

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          setSwStatus(reg.active ? 'active' : reg.installing ? 'installing' : 'waiting');
        } else {
          setSwStatus('not-registered');
        }
      });
    } else {
      setSwStatus('not-supported');
    }

    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(({ usage }) => {
        if (usage !== undefined) {
          setCacheSize(`${(usage / 1024 / 1024).toFixed(1)} MB used`);
        }
      });
    }
  }, []);

  const STATUS_MAP = {
    'checking':       { dot: 'bg-gray-300',                      label: 'Checking…'      },
    'active':         { dot: 'bg-green-500',                     label: 'Active'         },
    'installing':     { dot: 'bg-yellow-400 animate-pulse',      label: 'Installing'     },
    'waiting':        { dot: 'bg-blue-400',                      label: 'Update ready'   },
    'not-registered': { dot: 'bg-red-400',                       label: 'Not registered' },
    'not-supported':  { dot: 'bg-gray-400',                      label: 'Not supported'  },
  };
  const sw = STATUS_MAP[swStatus] || STATUS_MAP['checking'];

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">PWA status</h3>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">App installed</span>
          <span className={`text-xs font-medium ${installed ? 'text-green-600' : 'text-gray-400'}`}>
            {installed ? '✓ Yes (standalone)' : '○ Browser tab'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Service worker</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${sw.dot}`} />
            <span className="text-xs font-medium text-gray-700">{sw.label}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Offline shell</span>
          <span className={`text-xs font-medium
            ${swStatus === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
            {swStatus === 'active' ? '✓ Cached' : '—'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Web Share Target</span>
          <span className={`text-xs font-medium
            ${installed ? 'text-green-600' : 'text-gray-400'}`}>
            {installed ? '✓ Available' : 'Install app first'}
          </span>
        </div>

        {cacheSize && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Cache storage</span>
            <span className="text-xs text-gray-600 font-medium">{cacheSize}</span>
          </div>
        )}
      </div>

      {!installed && (
        <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <p className="text-xs text-blue-700">
            Install the app for offline access, push notifications, and direct image sharing.
          </p>
        </div>
      )}
    </div>
  );
}