import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

// ── Sub-components ────────────────────────────────────────────

function RatioRow({ ratio, index, directors, onChange, onRemove, isOnly }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="text-gray-300 cursor-grab select-none text-sm w-4 text-center">⠿</div>

      <select
        className="input flex-1 text-sm"
        value={ratio.director}
        onChange={(e) => onChange(index, 'director', e.target.value)}
      >
        <option value="">— Select Director —</option>
        {directors.map((d) => (
          <option key={d._id} value={d._id}>{d.name}</option>
        ))}
      </select>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => onChange(index, 'weight', Math.max(1, ratio.weight - 1))}
          className="w-7 h-7 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50
                     flex items-center justify-center text-sm font-medium"
        >−</button>
        <input
          type="number"
          min={1} max={100}
          className="w-14 border border-gray-200 rounded-md px-2 py-1 text-sm text-center
                     font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={ratio.weight}
          onChange={(e) => onChange(index, 'weight',
            Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
        />
        <button
          type="button"
          onClick={() => onChange(index, 'weight', Math.min(100, ratio.weight + 1))}
          className="w-7 h-7 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50
                     flex items-center justify-center text-sm font-medium"
        >+</button>
      </div>

      <button
        type="button"
        onClick={() => onRemove(index)}
        disabled={isOnly}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-300
                   hover:text-red-500 hover:bg-red-50 disabled:opacity-30
                   disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function SequencePreview({ preview, loading }) {
  if (loading) {
    return <div className="py-6 text-center text-sm text-gray-400">Computing preview...</div>;
  }
  if (!preview) return null;

  const { summary, totalWeight } = preview;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Sequence preview — 1 cycle = {totalWeight} leads
      </p>

      <div className="flex rounded-lg overflow-hidden h-8 mb-4">
        {summary.map((item, i) => {
          const colors = ['bg-blue-500','bg-indigo-500','bg-purple-500','bg-teal-500',
                          'bg-green-500','bg-amber-500','bg-orange-500','bg-pink-500'];
          return (
            <div
              key={i}
              className={`${colors[i % colors.length]} flex items-center justify-center
                text-white text-xs font-semibold transition-all`}
              style={{ width: `${item.pct}%` }}
              title={`${item.director}: ${item.count} leads (${item.pct}%)`}
            >
              {item.pct >= 8 ? `${item.pct}%` : ''}
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {summary.map((item, i) => {
          const colors = [
            'bg-blue-100 text-blue-700','bg-indigo-100 text-indigo-700',
            'bg-purple-100 text-purple-700','bg-teal-100 text-teal-700',
            'bg-green-100 text-green-700','bg-amber-100 text-amber-700',
            'bg-orange-100 text-orange-700','bg-pink-100 text-pink-700',
          ];
          const cls = colors[i % colors.length];
          return (
            <div key={i} className="flex items-center gap-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full
                text-xs font-medium w-36 truncate ${cls}`}>
                {item.director}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${
                    cls.replace(/text-\S+/, '').replace('bg-', 'bg-').replace('-100', '-400')
                  }`}
                  style={{ width: `${item.pct}%` }}
                />
              </div>
              <span className="text-xs text-gray-600 w-24 text-right">
                {item.from}–{item.to} ({item.weight} lead{item.weight !== 1 ? 's' : ''})
              </span>
              <span className="text-xs font-medium text-gray-500 w-8 text-right">
                {item.pct}%
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        After lead #{totalWeight} the sequence repeats from position 1.
      </p>
    </div>
  );
}

// ── RunPanel — FIXED: guards result.summary with ?. and || [] ─
function RunPanel({ unallocated, onAllocated }) {
  const [count,   setCount]   = useState('');
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState(null);

  // Reset result display when unallocated count changes
  useEffect(() => {
    if (unallocated > 0) setResult(null);
  }, [unallocated]);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const body      = count ? { count: Number(count) } : {};
      const { data }  = await api.post('/allocation/run', body);
      setResult(data);
      toast.success(data.message);
      // Notify parent to refresh stats
      onAllocated?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Allocation failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">Run allocation</h3>
      <p className="text-xs text-gray-400 mb-4">
        Assign unallocated leads to directors using the configured ratios.
        <span className="ml-1 font-medium text-orange-500">
          {unallocated} lead{unallocated !== 1 ? 's' : ''} waiting.
        </span>
      </p>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="number"
          min={1}
          placeholder={`All (${unallocated})`}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className="input w-36 text-sm"
          inputMode="numeric"
        />
        <button
          onClick={handleRun}
          disabled={running || unallocated === 0}
          className="btn-primary"
        >
          {running ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Run now
            </>
          )}
        </button>
      </div>

      {result && (
        <div className={`rounded-lg p-3 border
          ${result.allocated > 0
            ? 'bg-green-50 border-green-100'
            : 'bg-gray-50 border-gray-200'}`}>
          <p className={`text-sm font-medium mb-2
            ${result.allocated > 0 ? 'text-green-700' : 'text-gray-500'}`}>
            {result.allocated > 0
              ? `✓ ${result.allocated} lead${result.allocated !== 1 ? 's' : ''} allocated`
              : '✓ No unallocated leads found — everything is already assigned'}
          </p>
          {/* FIX: guard with ?. and || [] so .map never crashes on undefined */}
          {(result.summary || []).length > 0 && (
            <div className="space-y-1">
              {(result.summary || []).map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-green-600">
                  <span className="font-medium">{s.director}</span>
                  <span>→ {s.count} lead{s.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function AllocationConfig() {
  const [directors,     setDirectors]     = useState([]);
  const [ratios,        setRatios]        = useState([{ director: '', weight: 1 }]);
  const [isActive,      setIsActive]      = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [preview,       setPreview]       = useState(null);
  const [previewLoading,setPreviewLoading]= useState(false);
  const [stats,         setStats]         = useState(null);
  const [configLoading, setConfigLoading] = useState(true);

  const refreshStats = useCallback(async () => {
    const { data } = await api.get('/allocation/stats');
    setStats(data);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [dirRes, cfgRes, statsRes] = await Promise.all([
          api.get('/users?role=director'),
          api.get('/allocation/config'),
          api.get('/allocation/stats'),
        ]);
        setDirectors(dirRes.data);
        setStats(statsRes.data);

        const cfg = cfgRes.data;
        setIsActive(cfg.isActive);
        if (cfg.ratios?.length) {
          setRatios(cfg.ratios.map((r) => ({
            director: String(r.director?._id || r.director),
            weight:   r.weight,
          })));
        }
      } catch {
        toast.error('Failed to load config');
      } finally {
        setConfigLoading(false);
      }
    };
    load();
  }, []);

  const fetchPreview = useCallback(async () => {
    const valid = ratios.filter((r) => r.director && r.weight > 0);
    if (valid.length === 0) { setPreview(null); return; }
    setPreviewLoading(true);
    try {
      const { data } = await api.post('/allocation/preview', { ratios: valid });
      setPreview(data);
    } catch { setPreview(null); }
    finally { setPreviewLoading(false); }
  }, [ratios]);

  useEffect(() => {
    const t = setTimeout(fetchPreview, 400);
    return () => clearTimeout(t);
  }, [fetchPreview]);

  const handleRatioChange = (index, field, value) =>
    setRatios((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));

  const addRow    = () => setRatios((prev) => [...prev, { director: '', weight: 1 }]);
  const removeRow = (index) => setRatios((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    const valid = ratios.filter((r) => r.director && r.weight > 0);
    if (valid.length === 0) return toast.error('Add at least one director with a weight');
    const ids = valid.map((r) => r.director);
    if (new Set(ids).size !== ids.length) return toast.error('Each director can only appear once');

    setSaving(true);
    try {
      await api.put('/allocation/config', { ratios: valid, isActive });
      toast.success('Allocation config saved');
      await refreshStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleResetCursor = async () => {
    if (!window.confirm('Reset the sequence to position 1? The next lead will go to the first director again.')) return;
    try {
      await api.post('/allocation/reset-cursor');
      toast.success('Sequence cursor reset to position 1');
      await refreshStats();
    } catch {
      toast.error('Reset failed');
    }
  };

  const totalWeight = ratios.filter((r) => r.director && r.weight > 0)
    .reduce((s, r) => s + Number(r.weight), 0);

  if (configLoading) {
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
      <div className="mb-6">
        <h2 className="page-title">Allocation Engine</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Configure ratio-based auto-assignment of incoming leads to directors.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* ── Left: Config editor ───────────────── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Active toggle */}
          <div className="card flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Auto-allocation</p>
              <p className="text-xs text-gray-400 mt-0.5">
                When active, new leads are automatically assigned to directors using the ratios below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full
                transition-colors focus:outline-none
                ${isActive ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow
                transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Ratios editor */}
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-800">Director ratios</h3>
              {totalWeight > 0 && (
                <span className="text-xs text-gray-400">
                  Total: <span className="font-semibold text-gray-600">{totalWeight}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Weight = number of leads that director receives per cycle. Higher = more leads.
            </p>

            <div className="flex items-center gap-3 mb-1 px-1">
              <div className="w-4" />
              <span className="flex-1 text-xs font-medium text-gray-400">Director</span>
              <span className="text-xs font-medium text-gray-400 w-32 text-center">Weight</span>
              <div className="w-7" />
            </div>

            <div>
              {ratios.map((ratio, index) => (
                <RatioRow
                  key={index}
                  ratio={ratio}
                  index={index}
                  directors={directors}
                  onChange={handleRatioChange}
                  onRemove={removeRow}
                  isOnly={ratios.length === 1}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addRow}
              className="mt-3 flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add director
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
            <p className="text-xs font-medium text-blue-700 mb-1">Example: A=9, B=4, C=4, D=1</p>
            <p className="text-xs text-blue-600">
              Total = 18. Leads 1–9 → A, 10–13 → B, 14–17 → C, 18 → D. Then repeats.
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Saving...
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
            <button type="button" onClick={handleResetCursor} className="btn-ghost text-xs">
              Reset sequence
            </button>
          </div>
        </div>

        {/* ── Right: Preview + stats ────────────── */}
        <div className="lg:col-span-2 space-y-5">

          <div className="card">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Live preview</h3>
            <SequencePreview preview={preview} loading={previewLoading} />
            {!preview && !previewLoading && (
              <p className="text-xs text-gray-400 text-center py-4">
                Configure ratios to see the sequence preview.
              </p>
            )}
          </div>

          {stats && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Current distribution</h3>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{stats.unallocated}</p>
                  <p className="text-xs text-orange-500 mt-0.5">Unallocated</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{stats.allocated}</p>
                  <p className="text-xs text-green-600 mt-0.5">Allocated</p>
                </div>
              </div>

              {stats.totalWeight > 0 && (
                <div className="text-xs text-gray-400 mb-3">
                  Sequence position:{' '}
                  <span className="font-medium text-gray-600">
                    {stats.cursorPosition} / {stats.totalWeight}
                  </span>
                </div>
              )}

              {(stats.directorBreakdown || []).length > 0 && (
                <div className="space-y-2">
                  {stats.directorBreakdown.map((d) => {
                    const pct = stats.allocated > 0
                      ? Math.round((d.count / stats.allocated) * 100) : 0;
                    return (
                      <div key={d._id} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center
                                        justify-center text-xs font-semibold text-blue-700 flex-shrink-0">
                          {d.name?.charAt(0)}
                        </div>
                        <span className="text-xs text-gray-700 flex-1 truncate">{d.name}</span>
                        <div className="w-16 bg-gray-100 rounded-full h-1.5">
                          <div className="bg-blue-400 h-1.5 rounded-full"
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-600 w-6 text-right">
                          {d.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* RunPanel — passes onAllocated so stats refresh after run */}
          <RunPanel
            unallocated={stats?.unallocated || 0}
            onAllocated={refreshStats}
          />
        </div>
      </div>
    </div>
  );
}