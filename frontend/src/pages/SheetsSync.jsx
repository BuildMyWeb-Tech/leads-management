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

// ── Extract spreadsheet ID from a full URL or raw ID ─────────
// Works with all formats:
//   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?...
//   SPREADSHEET_ID  (already just the ID)
const extractId = (input) => {
  if (!input) return '';
  const trimmed = input.trim();
  const match   = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : trimmed;
};

// ─────────────────────────────────────────────────────────────

// ── Custom confirm modal ──────────────────────────────────────
function ConfirmModal({ open, title, message, warning,
  confirmLabel = 'Confirm', confirmClass = 'btn-primary',
  onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed z-50 inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="h-1.5 bg-orange-400 w-full" />
        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{message}</p>
            </div>
          </div>
          {warning && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-5">
              <p className="text-sm text-orange-700 font-medium">{warning}</p>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <button onClick={onCancel} className="btn-ghost">Cancel</button>
            <button onClick={onConfirm} className={confirmClass}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </>
  );
}

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
                  className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 touch-manipulation">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button onClick={() => i < order.length - 1 && move(i, i + 1)}
                  disabled={i === order.length - 1}
                  className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 touch-manipulation">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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

// ─────────────────────────────────────────────────────────────
export default function SheetsSync() {
  const [cfg,           setCfg]           = useState(null);
  const [loading,       setLoading]       = useState(true);

  // The raw value the user types/pastes (may be a full URL)
  const [spreadsheetRaw, setSpreadsheetRaw] = useState('');
  // The extracted clean ID (shown in green below the field)
  const [extractedId,    setExtractedId]    = useState('');

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
  const [showJson,         setShowJson]         = useState(false);
  const [syncConfirmOpen,  setSyncConfirmOpen]  = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Update extracted ID whenever user types/pastes
  const handleSpreadsheetInput = (value) => {
    setSpreadsheetRaw(value);
    setExtractedId(extractId(value));
  };

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sheets/config');
      setCfg(data);
      // Show the clean ID (already extracted by backend)
      setSpreadsheetRaw(data.spreadsheetId || '');
      setExtractedId(data.spreadsheetId || '');
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
        // Always send the raw value — backend will extract the ID
        spreadsheetId: spreadsheetRaw,
        sheetName,
        isActive,
        syncOnCreate,
        syncOnUpdate,
        columnOrder,
      };
      if (serviceAccJson.trim()) body.serviceAccountJson = serviceAccJson.trim();
      const { data } = await api.put('/sheets/config', body);
      setCfg(data);
      // Sync displayed value to what backend actually stored
      setSpreadsheetRaw(data.spreadsheetId || '');
      setExtractedId(data.spreadsheetId || '');
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
      toast.success(`✅ Connected! "${data.spreadsheetTitle}" → Sheet: "${data.sheetName}"`);
      fetchConfig();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Connection failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleSyncAll = () => setSyncConfirmOpen(true);

  const handleSyncAllConfirmed = async () => {
    setSyncConfirmOpen(false);
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

  const handleClearQueue = () => setClearConfirmOpen(true);

  const handleClearQueueConfirmed = async () => {
    setClearConfirmOpen(false);
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

  const isUrlPasted = spreadsheetRaw.includes('docs.google.com');

  return (
    <div className="max-w-4xl">
      {/* Sync All confirm modal */}
      <ConfirmModal
        open={syncConfirmOpen}
        title="Sync all leads to Google Sheets?"
        message="This rewrites the entire sheet with all current leads. Each lead gets exactly one row — existing rows are updated in place, not duplicated."
        warning="⚠ The Google Sheet will be fully overwritten. Your database (MongoDB) is never affected."
        confirmLabel="Yes, sync all leads"
        confirmClass="btn-primary"
        onConfirm={handleSyncAllConfirmed}
        onCancel={() => setSyncConfirmOpen(false)}
      />

      {/* Clear queue confirm modal */}
      <ConfirmModal
        open={clearConfirmOpen}
        title="Clear the retry queue?"
        message="The failed rows will be permanently removed and will not be retried."
        warning="⚠ Run a full sync after clearing to ensure all leads appear in the sheet."
        confirmLabel="Clear queue"
        confirmClass="btn-danger"
        onConfirm={handleClearQueueConfirmed}
        onCancel={() => setClearConfirmOpen(false)}
      />

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

        {/* ── Left: Config form ────────────────── */}
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

            {/* Spreadsheet ID — accepts full URL or raw ID */}
            <div>
              <label className="label">
                Spreadsheet ID or URL <span className="text-red-400">*</span>
              </label>
              <input
                className={`input font-mono text-sm ${
                  isUrlPasted ? 'border-blue-300 bg-blue-50' : ''
                }`}
                placeholder="Paste the spreadsheet URL or just the ID"
                value={spreadsheetRaw}
                onChange={(e) => handleSpreadsheetInput(e.target.value)}
              />

              {/* Show what was extracted when a full URL is pasted */}
              {isUrlPasted && extractedId ? (
                <div className="mt-1.5 flex items-center gap-2 bg-green-50 border border-green-200
                                rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <p className="text-xs text-green-700 font-medium">URL detected — ID extracted:</p>
                    <p className="text-xs font-mono text-green-800 break-all">{extractedId}</p>
                  </div>
                </div>
              ) : extractedId ? (
                <p className="text-xs text-gray-400 mt-1">
                  ID: <span className="font-mono text-gray-600">{extractedId}</span>
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">
                  You can paste the full URL — the ID will be extracted automatically.
                </p>
              )}
            </div>

            <div>
              <label className="label">Sheet tab name</label>
              <input
                className="input"
                placeholder="Leads"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                The tab name inside the spreadsheet. Created automatically if it doesn't exist.
              </p>
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

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold mb-1">Setup steps:</p>
              <p>1. Google Cloud Console → APIs & Services → Credentials</p>
              <p>2. Create a Service Account, download the JSON key file</p>
              <p>3. Share spreadsheet → add service account email as <strong>Editor</strong></p>
              <p>4. Enable the Google Sheets API in your project</p>
              <p>5. Paste the full JSON key content below</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">
                  {cfg?.hasCredentials
                    ? 'Replace credentials (paste new JSON to update)'
                    : 'Service account JSON key'}
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
                  placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "...",\n  "client_email": "...@....iam.gserviceaccount.com",\n  ...\n}'}
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

          {/* Save + Test */}
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
              disabled={verifying || !extractedId || !cfg?.hasCredentials}
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

        {/* ── Right: Status + actions ───────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Sync stats */}
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

          {/* Manual sync */}
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Manual sync</h3>
            <p className="text-xs text-gray-400">
              Overwrites the entire sheet with current MongoDB data. MongoDB is never affected.
            </p>
            <button
              onClick={handleSyncAll}
              disabled={syncing || !cfg?.hasCredentials || !extractedId}
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

          {/* Retry queue */}
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
                      <div key={i} className="text-xs bg-orange-50 rounded-md px-2.5 py-1.5">
                        <span className="font-mono text-orange-600">
                          {item.rowData?.[0] || 'Unknown'}
                        </span>
                        <span className="text-gray-400 ml-2">· attempt {item.attempts}</span>
                      </div>
                    ))}
                    {cfg.retryQueue.length > 5 && (
                      <p className="text-xs text-gray-400">+ {cfg.retryQueue.length - 5} more</p>
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

          {/* Data flow info */}
          <div className="card bg-gray-50 border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              How sync works
            </h3>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span>🗄️</span><span>Lead saved/updated in MongoDB</span>
              </div>
              <div className="flex justify-center text-gray-300">↓</div>
              <div className="flex items-center gap-2">
                <span>📋</span><span>Row appended to Google Sheet</span>
              </div>
              <div className="flex justify-center text-gray-300">↓</div>
              <div className="flex items-center gap-2">
                <span>✓</span><span>If Sheets fails → queued for retry</span>
              </div>
              <p className="text-gray-400 pt-2 border-t border-gray-200 mt-2">
                MongoDB data is <strong>never</strong> affected by Sheets failures.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}