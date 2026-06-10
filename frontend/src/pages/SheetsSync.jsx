import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const ALL_COLUMNS = [
  { value: 'name',             label: 'Name' },
  { value: 'phone',            label: 'Phone' },
  { value: 'email',            label: 'Email' },
  { value: 'director',         label: 'Director' },
  { value: 'telecaller',       label: 'Telecaller' },
  { value: 'status',           label: 'Status' },
  { value: 'source',           label: 'Source' },
  { value: 'budget',           label: 'Budget' },
  { value: 'propertyInterest', label: 'Property Interest' },
  { value: 'notes',            label: 'Notes' },
  { value: 'createdAt',        label: 'Created Date' },
  { value: 'updatedAt',        label: 'Updated Date' },
];

function SyncStatusBadge({ status }) {
  const map = {
    success: { cls: 'bg-green-100 text-green-700 ring-green-200',  dot: 'bg-green-500', label: 'Connected' },
    failed:  { cls: 'bg-red-100 text-red-700 ring-red-200',        dot: 'bg-red-500',   label: 'Error'     },
    never:   { cls: 'bg-gray-100 text-gray-500 ring-gray-200',     dot: 'bg-gray-400',  label: 'Not synced'},
  };
  const s = map[status] || map.never;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full
      text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function ColumnOrderEditor({ order, onChange }) {
  const move = (from, to) => {
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const toggle = (col) => {
    if (order.includes(col)) {
      if (order.length <= 1) return;
      onChange(order.filter((c) => c !== col));
    } else {
      onChange([...order, col]);
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Column order in sheet
      </p>

      <div className="space-y-1.5 mb-4">
        {order.map((col, i) => {
          const meta = ALL_COLUMNS.find((c) => c.value === col);
          return (
            <div key={col} className="flex items-center gap-2 bg-blue-50 border border-blue-100
                                      rounded-lg px-3 py-2">
              <span className="text-xs font-bold text-blue-400 w-5 text-center flex-shrink-0">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-sm font-medium text-gray-800 flex-1">
                {meta?.label || col}
              </span>
              <div className="flex gap-0.5">
                <button onClick={() => i > 0 && move(i, i - 1)} disabled={i === 0}
                  className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30
                             touch-manipulation">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button onClick={() => i < order.length - 1 && move(i, i + 1)}
                  disabled={i === order.length - 1}
                  className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30
                             touch-manipulation">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              <button onClick={() => toggle(col)}
                className="p-1 text-gray-300 hover:text-red-500 touch-manipulation"
                title="Remove column">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs font-medium text-gray-400 mb-2">Add columns</p>
      <div className="flex flex-wrap gap-1.5">
        {ALL_COLUMNS.filter((c) => !order.includes(c.value)).map((col) => (
          <button
            key={col.value}
            onClick={() => toggle(col.value)}
            className="px-2.5 py-1 text-xs border border-dashed border-gray-300 rounded-full
                       text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors
                       touch-manipulation"
          >
            + {col.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SyncStats({ cfg }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-gray-50 rounded-xl p-3 text-center">
        <p className="text-xl font-bold text-gray-900">{cfg.totalSynced || 0}</p>
        <p className="text-xs text-gray-500 mt-0.5">Total synced</p>
      </div>
      <div className={`rounded-xl p-3 text-center
        ${cfg.retryQueue?.length > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
        <p className={`text-xl font-bold
          ${cfg.retryQueue?.length > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
          {cfg.retryQueue?.length || 0}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">In retry queue</p>
      </div>
      <div className="bg-gray-50 rounded-xl p-3 text-center">
        <p className="text-xs font-semibold text-gray-700 mt-1">
          {cfg.lastSyncAt
            ? new Date(cfg.lastSyncAt).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short',
                hour: '2-digit', minute: '2-digit',
              })
            : '—'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">Last sync</p>
      </div>
    </div>
  );
}

export default function SheetsSync() {
  const [cfg,           setCfg]           = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName,     setSheetName]     = useState('Leads');
  const [serviceAccJson, setServiceAccJson] = useState('');
  const [isActive,      setIsActive]      = useState(false);
  const [syncOnCreate,  setSyncOnCreate]  = useState(true);
  const [syncOnUpdate,  setSyncOnUpdate]  = useState(true);
  const [columnOrder,   setColumnOrder]   = useState([
    'name','phone','director','telecaller','status','source','budget','notes','createdAt',
  ]);
  const [saving,    setSaving]    = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [syncing,   setSyncing]   = useState(false);
  const [retrying,  setRetrying]  = useState(false);
  const [showJson,  setShowJson]  = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sheets/config');
      setCfg(data);
      setSpreadsheetId(data.spreadsheetId || '');
      setSheetName(data.sheetName || 'Leads');
      setIsActive(data.isActive || false);
      setSyncOnCreate(data.syncOnCreate !== false);
      setSyncOnUpdate(data.syncOnUpdate !== false);
      if (data.columnOrder?.length) setColumnOrder(data.columnOrder);
    } catch {
      toast.error('Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        spreadsheetId, sheetName, isActive,
        syncOnCreate, syncOnUpdate, columnOrder,
      };
      if (serviceAccJson.trim()) body.serviceAccountJson = serviceAccJson.trim();
      const { data } = await api.put('/sheets/config', body);
      setCfg(data);
      setServiceAccJson('');
      toast.success('Configuration saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const { data } = await api.post('/sheets/verify');
      toast.success(`Connected! "${data.spreadsheetTitle}" → "${data.sheetName}"`);
      fetchConfig();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Connection failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleSyncAll = async () => {
    if (!window.confirm('Overwrite all sheet data with current MongoDB data?')) return;
    setSyncing(true);
    try {
      const { data } = await api.post('/sheets/sync-all');
      toast.success(data.message);
      fetchConfig();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryQueue = async () => {
    setRetrying(true);
    try {
      const { data } = await api.post('/sheets/retry-queue');
      toast.success(data.message);
      fetchConfig();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  const handleClearQueue = async () => {
    if (!window.confirm('Clear all failed rows from retry queue?')) return;
    try {
      await api.delete('/sheets/retry-queue');
      toast.success('Retry queue cleared');
      fetchConfig();
    } catch { toast.error('Failed to clear queue'); }
  };

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
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="page-title">Google Sheets Sync</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            MongoDB is always the source of truth. Sheets is the reporting layer.
          </p>
        </div>
        {cfg && <SyncStatusBadge status={cfg.lastSyncStatus} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Config form */}
        <div className="lg:col-span-3 space-y-4">

          {/* Auto-sync toggle */}
          <div className="card flex items-center justify-between">
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm font-semibold text-gray-800">Auto-sync</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Automatically append rows when leads are created or updated.
              </p>
            </div>
            <button
              onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full
                transition-colors touch-manipulation
                ${isActive ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow
                transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Spreadsheet settings */}
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Spreadsheet settings</h3>

            <div>
              <label className="label">
                Spreadsheet ID <span className="text-red-400">*</span>
              </label>
              <input
                className="input font-mono text-sm"
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                Found in the spreadsheet URL: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
              </p>
            </div>

            <div>
              <label className="label">Sheet tab name</label>
              <input
                className="input"
                placeholder="Leads"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Sync triggers</label>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer touch-manipulation">
                  <input
                    type="checkbox"
                    checked={syncOnCreate}
                    onChange={(e) => setSyncOnCreate(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">On lead create</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer touch-manipulation">
                  <input
                    type="checkbox"
                    checked={syncOnUpdate}
                    onChange={(e) => setSyncOnUpdate(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">On lead update</span>
                </label>
              </div>
            </div>
          </div>

          {/* Service account credentials */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-gray-800">
                Service account credentials
              </h3>
              {cfg?.hasCredentials && (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 13l4 4L19 7" />
                  </svg>
                  Credentials configured
                </span>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3
                            text-xs text-blue-700 space-y-1">
              <p className="font-semibold mb-1">Setup steps:</p>
              <p>1. Google Cloud Console → APIs & Services → Credentials</p>
              <p>2. Create a Service Account, download the JSON key file</p>
              <p>3. Share spreadsheet → add service account email as Editor</p>
              <p>4. Enable the Google Sheets API in your project</p>
              <p>5. Paste the JSON key content below</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">
                  {cfg?.hasCredentials ? 'Replace credentials (paste new JSON)' : 'Service account JSON key'}
                </label>
                <button
                  onClick={() => setShowJson((v) => !v)}
                  className="text-xs text-gray-400 hover:text-gray-600 touch-manipulation"
                >
                  {showJson ? 'Hide' : 'Show'} field
                </button>
              </div>
              {showJson && (
                <textarea
                  className="input font-mono text-xs"
                  rows={6}
                  placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                  value={serviceAccJson}
                  onChange={(e) => setServiceAccJson(e.target.value)}
                  spellCheck={false}
                />
              )}
              {!showJson && cfg?.hasCredentials && (
                <div className="input bg-gray-50 text-gray-400 font-mono text-xs">
                  ••••••• (credentials stored securely)
                </div>
              )}
            </div>
          </div>

          {/* Column order */}
          <div className="card">
            <ColumnOrderEditor order={columnOrder} onChange={setColumnOrder} />
            <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 font-medium">Preview header row:</p>
              <p className="text-xs font-mono text-gray-600 mt-1 overflow-x-auto scrollbar-hide">
                {columnOrder.map((c, i) => {
                  const meta = ALL_COLUMNS.find((x) => x.value === c);
                  return `${String.fromCharCode(65 + i)}: ${meta?.label || c}`;
                }).join('  |  ')}
              </p>
            </div>
          </div>

          {/* Save button */}
          <div className="flex gap-3 flex-wrap">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Saving…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 13l4 4L19 7" />
                  </svg>
                  Save config
                </>
              )}
            </button>
            <button
              onClick={handleVerify}
              disabled={verifying || !spreadsheetId || !cfg?.hasCredentials}
              className="btn-secondary"
            >
              {verifying ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Testing…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Test connection
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Status + actions */}
        <div className="lg:col-span-2 space-y-4">

          {cfg && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Sync statistics</h3>
              <SyncStats cfg={cfg} />
              {cfg.lastSyncError && (
                <div className="mt-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <p className="text-xs font-medium text-red-600 mb-0.5">Last error</p>
                  <p className="text-xs text-red-500 font-mono break-all">{cfg.lastSyncError}</p>
                </div>
              )}
            </div>
          )}

          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Manual sync</h3>
            <p className="text-xs text-gray-400">
              Overwrites the entire sheet with current MongoDB data. MongoDB is never affected.
            </p>
            <button
              onClick={handleSyncAll}
              disabled={syncing || !cfg?.hasCredentials || !spreadsheetId}
              className="btn-primary w-full justify-center"
            >
              {syncing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Syncing all leads…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync all leads now
                </>
              )}
            </button>
          </div>

          {cfg && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Retry queue</h3>
                {(cfg.retryQueue?.length || 0) > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-600 font-medium
                                   px-2 py-0.5 rounded-full">
                    {cfg.retryQueue.length} pending
                  </span>
                )}
              </div>

              {(cfg.retryQueue?.length || 0) === 0 ? (
                <div className="py-6 text-center">
                  <svg className="w-8 h-8 text-green-300 mx-auto mb-1" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-gray-400">Queue is empty</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    These rows failed to sync. MongoDB data is safe.
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1 scrollbar-thin">
                    {cfg.retryQueue.slice(0, 5).map((item, i) => (
                      <div key={i}
                        className="text-xs bg-orange-50 rounded-md px-2.5 py-1.5">
                        <span className="font-mono text-orange-600">
                          {item.rowData?.[0] || 'Unknown'}
                        </span>
                        <span className="text-gray-400 ml-2">· attempt {item.attempts}</span>
                      </div>
                    ))}
                    {cfg.retryQueue.length > 5 && (
                      <p className="text-xs text-gray-400">
                        + {cfg.retryQueue.length - 5} more
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={handleRetryQueue} disabled={retrying}
                      className="btn-primary flex-1 text-xs py-1.5 justify-center">
                      {retrying ? 'Retrying…' : 'Retry now'}
                    </button>
                    <button onClick={handleClearQueue} className="btn-ghost text-xs py-1.5">
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}