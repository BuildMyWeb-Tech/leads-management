import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import {
  getSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  getPermissionState,
} from '../utils/pushManager';
import toast from 'react-hot-toast';

// ── Toggle row ────────────────────────────────────────────────
function PrefToggle({ label, description, checked, onChange, disabled }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-3 border-b border-gray-50 last:border-0 ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  );
}

// ── Device card ───────────────────────────────────────────────
function DeviceCard({ sub }) {
  const ago = sub.lastUsed
    ? Math.floor((Date.now() - new Date(sub.lastUsed)) / (1000 * 60 * 60 * 24))
    : null;

  const getDeviceIcon = (ua = '') => {
    if (/android/i.test(ua)) return '📱';
    if (/iphone|ipad/i.test(ua)) return '🍎';
    if (/chrome/i.test(ua)) return '🌐';
    if (/firefox/i.test(ua)) return '🦊';
    return '💻';
  };

  const getDeviceName = (ua = '') => {
    if (/android/i.test(ua)) return 'Android device';
    if (/iphone/i.test(ua)) return 'iPhone';
    if (/ipad/i.test(ua)) return 'iPad';
    if (/windows/i.test(ua)) return 'Windows browser';
    if (/macintosh/i.test(ua)) return 'Mac browser';
    return 'Browser';
  };

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xl flex-shrink-0">{getDeviceIcon(sub.userAgent)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">
          {sub.deviceLabel || getDeviceName(sub.userAgent)}
        </p>
        <p className="text-xs text-gray-400 font-mono truncate">{sub.endpoint}</p>
        {sub.failCount > 0 && (
          <p className="text-xs text-orange-500 mt-0.5">⚠ {sub.failCount} delivery failure{sub.failCount > 1 ? 's' : ''}</p>
        )}
      </div>
      <p className="text-xs text-gray-400 flex-shrink-0">
        {ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : ago ? `${ago}d ago` : '—'}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function NotificationSettings() {
  const { user } = useAuth();

  const [subState,    setSubState]    = useState(null);   // null = checking
  const [subs,        setSubs]        = useState([]);
  const [prefs,       setPrefs]       = useState(null);
  const [pushStatus,  setPushStatus]  = useState(null);   // admin only
  const [loading,     setLoading]     = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [testing,     setTesting]     = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [triggeringReminders, setTriggeringReminders] = useState(false);

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const [stateRes, subsRes, userRes] = await Promise.all([
        getSubscriptionState(),
        api.get('/push/subscriptions').catch(() => ({ data: [] })),
        api.get('/api/auth/me').catch(() => null),
      ]);

      setSubState(stateRes);
      setSubs(subsRes.data || []);

      // Get current prefs from user object
      if (user?.notificationPrefs) {
        setPrefs(user.notificationPrefs);
      } else {
        // Default prefs
        setPrefs({
          leadAssigned:       true,
          telecallerAssigned: true,
          followUpReminder:   true,
          statusChanged:      false,
          dailySummary:       false,
        });
      }

      if (user?.role === 'admin') {
        const statusRes = await api.get('/push/status').catch(() => ({ data: null }));
        setPushStatus(statusRes.data);
      }
    } catch (err) {
      console.error('Failed to load notification state:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchState(); }, [fetchState]);

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      await subscribeToPush(navigator.userAgent.slice(0, 60));
      toast.success('Push notifications enabled!');
      await fetchState();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubscribing(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!window.confirm('Disable push notifications on this device?')) return;
    try {
      await unsubscribeFromPush();
      toast.success('Push notifications disabled on this device');
      await fetchState();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handlePrefChange = async (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSavingPrefs(true);
    try {
      await api.put('/push/preferences', { [key]: value });
    } catch {
      toast.error('Failed to save preference');
      setPrefs(prefs); // rollback
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data } = await api.post('/push/test');
      toast.success(data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleTriggerReminders = async () => {
    setTriggeringReminders(true);
    try {
      await api.post('/push/send-reminders');
      toast.success('Follow-up reminders dispatched!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setTriggeringReminders(false);
    }
  };

  // Permission state display config
  const permConfig = {
    granted:     { color: 'text-green-600', bg: 'bg-green-50 border-green-100', icon: '✓', label: 'Allowed' },
    default:     { color: 'text-orange-500', bg: 'bg-orange-50 border-orange-100', icon: '?', label: 'Not set' },
    denied:      { color: 'text-red-600', bg: 'bg-red-50 border-red-100', icon: '✗', label: 'Blocked' },
    unsupported: { color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', icon: '—', label: 'Not supported' },
  };
  const perm     = subState?.permission || 'default';
  const pc       = permConfig[perm] || permConfig.default;
  const isSubbed = subState?.subscribed;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="w-6 h-6 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="page-title">Notification settings</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Control which push notifications you receive on this device.
        </p>
      </div>

      <div className="space-y-5">

        {/* ── Push permission status ──────────── */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Push notification permission</h3>

          <div className={`flex items-center justify-between p-3 rounded-xl border mb-4 ${pc.bg}`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${pc.color} bg-white border`}>
                {pc.icon}
              </div>
              <div>
                <p className={`text-sm font-semibold ${pc.color}`}>
                  {isSubbed ? 'Subscribed on this device' : pc.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {perm === 'denied'
                    ? 'Blocked in browser settings — reset via the 🔒 icon in your address bar'
                    : perm === 'unsupported'
                    ? 'Your browser does not support Web Push'
                    : isSubbed
                    ? 'Notifications will be delivered to this device'
                    : 'Click "Enable" to receive push notifications'}
                </p>
              </div>
            </div>

            {perm !== 'denied' && perm !== 'unsupported' && (
              isSubbed ? (
                <button onClick={handleUnsubscribe} className="btn-secondary text-xs py-1.5">
                  Disable
                </button>
              ) : (
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing}
                  className="btn-primary text-xs py-1.5"
                >
                  {subscribing ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Enabling…
                    </>
                  ) : 'Enable'}
                </button>
              )
            )}
          </div>

          {/* Test button */}
          {isSubbed && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="btn-secondary w-full justify-center text-sm"
            >
              {testing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Sending test…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  Send test notification
                </>
              )}
            </button>
          )}
        </div>

        {/* ── Notification preferences ────────── */}
        {prefs && (
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-800">What to notify me about</h3>
              {savingPrefs && (
                <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">Changes save instantly.</p>

            {/* Role-relevant prefs */}
            {(user?.role === 'admin' || user?.role === 'director') && (
              <PrefToggle
                label="Lead allocated to me"
                description="When a new lead is assigned to you as director"
                checked={prefs.leadAssigned}
                onChange={(v) => handlePrefChange('leadAssigned', v)}
                disabled={!isSubbed}
              />
            )}
            {user?.role === 'telecaller' && (
              <PrefToggle
                label="Lead assigned to me"
                description="When a director assigns a lead to you"
                checked={prefs.telecallerAssigned}
                onChange={(v) => handlePrefChange('telecallerAssigned', v)}
                disabled={!isSubbed}
              />
            )}
            <PrefToggle
              label="Follow-up reminders"
              description="Daily at 9 AM — when you have follow-ups scheduled for today"
              checked={prefs.followUpReminder}
              onChange={(v) => handlePrefChange('followUpReminder', v)}
              disabled={!isSubbed}
            />
            {(user?.role === 'admin' || user?.role === 'director') && (
              <PrefToggle
                label="Status changes"
                description="When a telecaller updates the status of your leads"
                checked={prefs.statusChanged}
                onChange={(v) => handlePrefChange('statusChanged', v)}
                disabled={!isSubbed}
              />
            )}

            {!isSubbed && (
              <p className="text-xs text-gray-400 text-center mt-3 pt-3 border-t border-gray-100">
                Enable push notifications above to activate these preferences
              </p>
            )}
          </div>
        )}

        {/* ── Subscribed devices ──────────────── */}
        {subs.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">
              Subscribed devices ({subs.length})
            </h3>
            {subs.map((sub, i) => (
              <DeviceCard key={i} sub={sub} />
            ))}
            <p className="text-xs text-gray-400 mt-3">
              Subscriptions expire after 90 days of inactivity.
            </p>
          </div>
        )}

        {/* ── Admin: Push system status ────────── */}
        {user?.role === 'admin' && pushStatus && (
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">System push status</h3>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{pushStatus.totalSubs}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total subscriptions</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${pushStatus.configured ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className={`text-sm font-bold mt-1 ${pushStatus.configured ? 'text-green-600' : 'text-red-600'}`}>
                  {pushStatus.configured ? '✓ VAPID ready' : '✗ Not configured'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Server status</p>
              </div>
            </div>

            {/* Per-role breakdown */}
            {pushStatus.perRole?.length > 0 && (
              <div className="space-y-2 mb-4">
                {pushStatus.perRole.map((r) => (
                  <div key={r._id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 capitalize">{r._id}</span>
                    <span className="font-medium text-gray-800">{r.count} device{r.count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}

            {!pushStatus.configured && (
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-xs text-orange-700 space-y-1">
                <p className="font-semibold">Setup required:</p>
                <p>1. Run <code className="bg-orange-100 px-1 rounded">npm run generate-vapid</code> in backend/</p>
                <p>2. Add <code className="bg-orange-100 px-1 rounded">VAPID_PUBLIC_KEY</code> and <code className="bg-orange-100 px-1 rounded">VAPID_PRIVATE_KEY</code> to your <code className="bg-orange-100 px-1 rounded">.env</code></p>
                <p>3. Add <code className="bg-orange-100 px-1 rounded">VAPID_EMAIL=mailto:you@domain.com</code></p>
                <p>4. Restart the backend server</p>
              </div>
            )}

            {/* Manual trigger */}
            <div className="pt-3 mt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Reminder scheduler runs daily at 9 AM IST automatically.</p>
              <button
                onClick={handleTriggerReminders}
                disabled={triggeringReminders}
                className="btn-secondary w-full justify-center text-sm"
              >
                {triggeringReminders ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Dispatching…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Trigger follow-up reminders now
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
