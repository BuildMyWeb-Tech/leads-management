import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

// ── Director row — drag handle + quota input + enable toggle ───
// Replaces the old sequence-only row. sequenceOrder still
// determines cycle participation ORDER (drag to reorder); quota
// determines how many leads this director receives per cycle
// before being skipped until the next cycle.
function DirectorQuotaRow({
  entry, index, directors, onChange, onRemove, isOnly,
  onDragStart, onDragOver, onDrop, onDragEnd, isDragging,
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0
        transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
    >
      {/* Drag handle */}
      <div
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing
                   select-none text-base w-5 text-center flex-shrink-0 touch-none"
        title="Drag to reorder"
      >
        ⠿
      </div>

      {/* Sequence position number */}
      <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold
                      flex items-center justify-center flex-shrink-0">
        {index + 1}
      </div>

      {/* Director select */}
      <select
        className="input flex-1 text-sm"
        value={entry.director}
        onChange={(e) => onChange(index, 'director', e.target.value)}
      >
        <option value="">— Select Director —</option>
        {directors.map((d) => (
          <option key={d._id} value={d._id}>{d.name}</option>
        ))}
      </select>

      {/* Quota input */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <label className="text-xs text-gray-400 hidden sm:inline">Quota</label>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={entry.quota}
          onChange={(e) => onChange(index, 'quota', e.target.value)}
          className="input w-16 text-sm text-center py-1"
        />
      </div>

      {/* Enable / disable toggle */}
      <button
        type="button"
        onClick={() => onChange(index, 'enabled', !entry.enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full
          transition-colors
          ${entry.enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
        title={entry.enabled ? 'Enabled — participates in the cycle' : 'Disabled — skipped'}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow
          transition-transform ${entry.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>

      {/* Status label */}
      <span className={`text-xs font-medium w-16 flex-shrink-0
        ${entry.enabled ? 'text-green-600' : 'text-gray-400'}`}>
        {entry.enabled ? 'Enabled' : 'Disabled'}
      </span>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(index)}
        disabled={isOnly}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-300
                   hover:text-red-500 hover:bg-red-50 disabled:opacity-30
                   disabled:cursor-not-allowed transition-colors flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Live preview — Adaptive Quota-Based Round Robin sequence ────
// Shows Lead N → Director, with a cycle-reset divider where the
// engine would reset all quotas back to full and start over.
function SequencePreview({ preview, loading }) {
  if (loading) {
    return <div className="py-6 text-center text-sm text-gray-400">Computing preview...</div>;
  }
  if (!preview) return null;

  const { sequence, enabledCount } = preview;

  const colors = [
    'bg-blue-100 text-blue-700','bg-indigo-100 text-indigo-700',
    'bg-purple-100 text-purple-700','bg-teal-100 text-teal-700',
    'bg-green-100 text-green-700','bg-amber-100 text-amber-700',
    'bg-orange-100 text-orange-700','bg-pink-100 text-pink-700',
  ];

  // Map each unique director name to a stable color
  const colorMap = {};
  let nextColor = 0;
  sequence.forEach((s) => {
    if (!(s.directorId in colorMap)) {
      colorMap[s.directorId] = colors[nextColor % colors.length];
      nextColor++;
    }
  });

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Upcoming sequence
      </p>
      <p className="text-xs text-gray-400 mb-3">
        {enabledCount} director{enabledCount !== 1 ? 's' : ''} with quota &gt; 0 —
        leads interleave across directors and skip any whose quota for
        the current cycle is used up. When all are exhausted, quotas
        reset and the cycle repeats.
      </p>

      <div className="space-y-2">
        {sequence.map((item) => (
          <div key={item.leadNumber}>
            {item.cycleReset && item.leadNumber > 1 && (
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 border-t border-dashed border-gray-200" />
                <span className="text-xs text-gray-400 font-medium px-1 whitespace-nowrap">
                  cycle reset — quotas refilled
                </span>
                <div className="flex-1 border-t border-dashed border-gray-200" />
              </div>
            )}
            {/* Two-line row: Lead N -> Director on top, full
                remaining-quota breakdown wraps freely underneath.
                Avoids the cramped single-line layout where the
                countdown text got clipped in a narrow column. */}
            <div className="rounded-lg bg-gray-50/60 px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-14 flex-shrink-0">
                  Lead {item.leadNumber}
                </span>
                <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full
                  text-xs font-medium whitespace-nowrap ${colorMap[item.directorId]}`}>
                  {item.director}
                </span>
              </div>
              <div className="mt-1 pl-[4.75rem] flex flex-wrap gap-x-3 gap-y-0.5">
                {item.remainingAfter.map((r) => (
                  <span key={r.directorId || r.director} className="text-xs text-gray-400 whitespace-nowrap">
                    {r.director}=<span className="font-medium text-gray-600">{r.remaining}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Numbers on the right show each director's remaining quota for the
        current cycle, immediately after that lead is allocated.
      </p>
    </div>
  );
}

// ── RunPanel — unchanged from previous fix ──────────────────────
function RunPanel({ unallocated, onAllocated }) {
  const [count,   setCount]   = useState('');
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState(null);

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
        Assign unallocated leads to directors using the configured quotas.
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
  const [directors,     setDirectors]     = useState([]); // all available directors (users)
  const [entries,       setEntries]       = useState([{ director: '', enabled: true, sequenceOrder: 0, quota: 1 }]);
  const [isActive,      setIsActive]      = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [preview,       setPreview]       = useState(null);
  const [previewLoading,setPreviewLoading]= useState(false);
  const [stats,         setStats]         = useState(null);
  const [configLoading, setConfigLoading] = useState(true);

  const dragIndex = useRef(null);

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
        if (cfg.directors?.length) {
          setEntries(
            [...cfg.directors]
              .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
              .map((d) => ({
                director:      String(d.director?._id || d.director),
                enabled:       d.enabled !== false,
                sequenceOrder: d.sequenceOrder,
                quota:         d.quota ?? 1,
              }))
          );
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
    const valid = entries.filter((e) => e.director);
    if (valid.length === 0) { setPreview(null); return; }
    setPreviewLoading(true);
    try {
      const payload = valid.map((e, i) => ({ ...e, sequenceOrder: i, quota: Number(e.quota) || 0 }));
      const { data } = await api.post('/allocation/preview', { directors: payload, count: 18 });
      setPreview(data);
    } catch { setPreview(null); }
    finally { setPreviewLoading(false); }
  }, [entries]);

  useEffect(() => {
    const t = setTimeout(fetchPreview, 400);
    return () => clearTimeout(t);
  }, [fetchPreview]);

  const handleEntryChange = (index, field, value) =>
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));

  const addRow = () =>
    setEntries((prev) => [...prev, { director: '', enabled: true, sequenceOrder: prev.length, quota: 1 }]);

  const removeRow = (index) =>
    setEntries((prev) => prev.filter((_, i) => i !== index)
      .map((e, i) => ({ ...e, sequenceOrder: i })));

  // ── Drag and drop reordering ──────────────────────────────
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (index !== dragIndex.current) setDragOverIndex(index);
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    const from = dragIndex.current;
    const to   = index;
    if (from === null || from === to) {
      setDragOverIndex(null);
      return;
    }
    setEntries((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      // Re-number sequenceOrder to match new array order
      return next.map((e, i) => ({ ...e, sequenceOrder: i }));
    });
    dragIndex.current = null;
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    setDragOverIndex(null);
  };

  const handleSave = async () => {
    const valid = entries.filter((e) => e.director);
    if (valid.length === 0) return toast.error('Add at least one director');
    const ids = valid.map((e) => e.director);
    if (new Set(ids).size !== ids.length) return toast.error('Each director can only appear once');

    for (const e of valid) {
      const q = Number(e.quota);
      if (!Number.isFinite(q) || q < 0) {
        return toast.error('Quotas must be 0 or greater');
      }
    }

    const enabledWithQuota = valid.filter((e) => e.enabled && Number(e.quota) > 0).length;
    if (isActive && enabledWithQuota === 0) {
      return toast.error('At least one enabled director must have a quota greater than 0');
    }

    setSaving(true);
    try {
      const payload = valid.map((e, i) => ({
        director: e.director,
        enabled: e.enabled,
        sequenceOrder: i,
        quota: Number(e.quota),
      }));
      await api.put('/allocation/config', { directors: payload, isActive });
      toast.success('Allocation config saved');
      await refreshStats();
      await fetchPreview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleResetCursor = async () => {
    if (!window.confirm('Reset the allocation cycle? Quotas will refill to their configured values and the next lead will go to the first director in sequence.')) return;
    try {
      await api.post('/allocation/reset-cursor');
      toast.success('Allocation cycle reset');
      await refreshStats();
      await fetchPreview();
    } catch {
      toast.error('Reset failed');
    }
  };

  const enabledCount = entries.filter((e) => e.director && e.enabled && Number(e.quota) > 0).length;

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
          Adaptive Quota-Based Round Robin — leads interleave across
          directors in sequence order, each receiving up to its quota
          per cycle. When every director's quota is used up, the cycle
          resets and repeats.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ── Left: Config editor ───────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Active toggle */}
          <div className="card flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Auto-allocation</p>
              <p className="text-xs text-gray-400 mt-0.5">
                When active, new leads are automatically assigned using the
                quota-based cycle below.
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

          {/* Director quota editor */}
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-800">Directors & quotas</h3>
              {enabledCount > 0 && (
                <span className="text-xs text-gray-400">
                  <span className="font-semibold text-gray-600">{enabledCount}</span> in rotation
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Drag to reorder — this sets each director's position in the
              interleave cycle (A, B, C, D, ...). Quota sets how many leads
              each director receives per cycle before being skipped until
              the next cycle.
            </p>

            <div className="flex items-center gap-3 mb-1 px-1">
              <div className="w-5" />
              <div className="w-6" />
              <span className="flex-1 text-xs font-medium text-gray-400">Director</span>
              <span className="text-xs font-medium text-gray-400 w-20 text-center">Quota</span>
              <span className="text-xs font-medium text-gray-400 w-11 text-center">Active</span>
              <span className="text-xs font-medium text-gray-400 w-16">Status</span>
              <div className="w-7" />
            </div>

            <div>
              {entries.map((entry, index) => (
                <div
                  key={index}
                  className={dragOverIndex === index ? 'border-t-2 border-blue-400' : ''}
                >
                  <DirectorQuotaRow
                    entry={entry}
                    index={index}
                    directors={directors}
                    onChange={handleEntryChange}
                    onRemove={removeRow}
                    isOnly={entries.length === 1}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    isDragging={dragIndex.current === index}
                  />
                </div>
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
            <p className="text-xs font-medium text-blue-700 mb-1">How Adaptive Quota-Based Round Robin works</p>
            <p className="text-xs text-blue-600">
              Example — A=9, B=4, C=4, D=1: Lead 1→A, 2→B, 3→C, 4→D, 5→A, 6→B,
              7→C, 8→A, 9→B, 10→C, 11→A, 12→B, 13→C, 14→A, 15→A, 16→A, 17→A,
              18→A — then all quotas are used up, so the cycle resets and
              repeats from Lead 19. Directors are skipped once their quota
              for the current cycle reaches 0. Disabled directors or those
              with quota 0 never receive leads. Adding a new director or
              changing quotas/order starts a fresh cycle; existing leads are
              never reallocated.
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
              Reset cycle
            </button>
          </div>
        </div>

        {/* ── Right: Preview + stats ────────────── */}
        <div className="lg:col-span-3 space-y-5">

          <div className="card">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Live preview</h3>
            <SequencePreview preview={preview} loading={previewLoading} />
            {!preview && !previewLoading && (
              <p className="text-xs text-gray-400 text-center py-4">
                Add directors with a quota to see the upcoming sequence.
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

              {(stats.cycleRemaining || []).length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-400 mb-2">
                    Current cycle — remaining quota
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {stats.cycleRemaining.map((c) => (
                      <span key={c.directorId}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                                   text-xs font-medium bg-gray-100 text-gray-600">
                        {c.name}
                        <span className="font-semibold text-gray-800">
                          {c.remaining}{c.quota != null ? `/${c.quota}` : ''}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(stats.directorBreakdown || []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-400 mb-1">
                    All-time allocation totals
                  </p>
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

          <RunPanel
            unallocated={stats?.unallocated || 0}
            onAllocated={refreshStats}
          />
        </div>
      </div>
    </div>
  );
}