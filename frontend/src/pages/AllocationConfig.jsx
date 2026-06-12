import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

// ── Director sequence row — drag handle + enable toggle ────────
// Replaces old RatioRow. No weight controls.
function DirectorSequenceRow({
  entry, index, directors, onChange, onRemove, isOnly,
  onDragStart, onDragOver, onDrop, onDragEnd, isDragging,
}) {
  const dir = directors.find((d) => d._id === entry.director);

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

      {/* Enable / disable toggle */}
      <button
        type="button"
        onClick={() => onChange(index, 'enabled', !entry.enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full
          transition-colors
          ${entry.enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
        title={entry.enabled ? 'Enabled — receives leads' : 'Disabled — skipped'}
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

// ── Live preview — numbered Lead N → Director list ──────────────
function SequencePreview({ preview, loading }) {
  if (loading) {
    return <div className="py-6 text-center text-sm text-gray-400">Computing preview...</div>;
  }
  if (!preview) return null;

  const { sequence, enabledCount, startPointer } = preview;

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
        {enabledCount} director{enabledCount !== 1 ? 's' : ''} in rotation
        {startPointer > 0 && (
          <span> — continuing from position {(startPointer % enabledCount) + 1}</span>
        )}
      </p>

      <div className="space-y-1.5">
        {sequence.map((item) => (
          <div key={item.leadNumber} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-16 flex-shrink-0">
              Lead {item.leadNumber}
            </span>
            <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full
              text-xs font-medium truncate ${colorMap[item.directorId]}`}>
              {item.director}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        After lead {sequence.length} the sequence continues — position {enabledCount} loops back to 1.
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
        Assign unallocated leads to directors using the configured sequence.
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
  const [entries,       setEntries]       = useState([{ director: '', enabled: true, sequenceOrder: 0 }]);
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
      const payload = valid.map((e, i) => ({ ...e, sequenceOrder: i }));
      const { data } = await api.post('/allocation/preview', { directors: payload, count: 8 });
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
    setEntries((prev) => [...prev, { director: '', enabled: true, sequenceOrder: prev.length }]);

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

    const enabledCount = valid.filter((e) => e.enabled).length;
    if (isActive && enabledCount === 0) {
      return toast.error('At least one director must be enabled');
    }

    setSaving(true);
    try {
      const payload = valid.map((e, i) => ({
        director: e.director,
        enabled: e.enabled,
        sequenceOrder: i,
      }));
      await api.put('/allocation/config', { directors: payload, isActive });
      toast.success('Allocation config saved');
      await refreshStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleResetCursor = async () => {
    if (!window.confirm('Reset the sequence to position 1? The next lead will go to the first director in the sequence again.')) return;
    try {
      await api.post('/allocation/reset-cursor');
      toast.success('Sequence pointer reset to position 1');
      await refreshStats();
      await fetchPreview();
    } catch {
      toast.error('Reset failed');
    }
  };

  const enabledCount = entries.filter((e) => e.director && e.enabled).length;

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
          Round-robin auto-assignment of incoming leads to directors, in sequence order.
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
                When active, new leads are automatically assigned to the next director in sequence.
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

          {/* Director sequence editor */}
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-800">Director sequence</h3>
              {enabledCount > 0 && (
                <span className="text-xs text-gray-400">
                  <span className="font-semibold text-gray-600">{enabledCount}</span> enabled
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Drag to reorder. Each new lead goes to the next enabled director in this list,
              looping back to the top after the last one.
            </p>

            <div className="flex items-center gap-3 mb-1 px-1">
              <div className="w-5" />
              <div className="w-6" />
              <span className="flex-1 text-xs font-medium text-gray-400">Director</span>
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
                  <DirectorSequenceRow
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
            <p className="text-xs font-medium text-blue-700 mb-1">How round robin works</p>
            <p className="text-xs text-blue-600">
              With 4 enabled directors D1–D4: Lead 1 → D1, Lead 2 → D2, Lead 3 → D3, Lead 4 → D4,
              Lead 5 → D1, and so on. Disabled directors are skipped automatically.
              Adding a new director joins the rotation immediately without resetting past assignments.
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
                Add directors to see the upcoming sequence.
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

              {stats.enabledCount > 0 && (
                <div className="text-xs text-gray-400 mb-3">
                  Sequence position:{' '}
                  <span className="font-medium text-gray-600">
                    {stats.pointerPosition + 1} / {stats.enabledCount}
                  </span>
                  <span className="text-gray-300"> (pointer: {stats.currentPointer})</span>
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

          <RunPanel
            unallocated={stats?.unallocated || 0}
            onAllocated={refreshStats}
          />
        </div>
      </div>
    </div>
  );
}