import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const ACTION_META = {
  lead_created:             { label: 'Lead created',         color: 'bg-blue-100 text-blue-700'    },
  lead_updated:             { label: 'Lead updated',         color: 'bg-gray-100 text-gray-600'    },
  lead_deleted:             { label: 'Lead deleted',         color: 'bg-red-100 text-red-700'      },
  lead_status_changed:      { label: 'Status changed',       color: 'bg-purple-100 text-purple-700'},
  lead_assigned_director:   { label: 'Director assigned',    color: 'bg-indigo-100 text-indigo-700'},
  lead_assigned_telecaller: { label: 'Telecaller assigned',  color: 'bg-teal-100 text-teal-700'   },
  lead_bulk_assigned:       { label: 'Bulk assigned',        color: 'bg-violet-100 text-violet-700'},
  lead_imported_csv:        { label: 'CSV imported',         color: 'bg-green-100 text-green-700'  },
  lead_imported_ocr:        { label: 'OCR imported',         color: 'bg-emerald-100 text-emerald-700'},
  user_login:               { label: 'User login',           color: 'bg-yellow-100 text-yellow-700'},
  user_created:             { label: 'User created',         color: 'bg-blue-100 text-blue-600'   },
  user_updated:             { label: 'User updated',         color: 'bg-gray-100 text-gray-600'   },
  user_deactivated:         { label: 'User deactivated',     color: 'bg-red-100 text-red-600'     },
  allocation_run:           { label: 'Allocation run',       color: 'bg-orange-100 text-orange-700'},
  allocation_config_changed:{ label: 'Alloc config changed', color: 'bg-amber-100 text-amber-700' },
  sheets_synced:            { label: 'Sheets synced',        color: 'bg-green-100 text-green-600' },
  ocr_import:               { label: 'OCR import',           color: 'bg-emerald-100 text-emerald-600'},
};

const ROLE_BADGE = {
  admin:      'bg-purple-100 text-purple-700',
  director:   'bg-blue-100 text-blue-700',
  telecaller: 'bg-green-100 text-green-700',
  system:     'bg-gray-100 text-gray-500',
};

function ActionBadge({ action }) {
  const meta = ACTION_META[action] || { label: action, color: 'bg-gray-100 text-gray-500' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full
      text-xs font-medium ${meta.color} whitespace-nowrap`}>
      {meta.label}
    </span>
  );
}

function ChangeDiff({ before, after }) {
  if (!before && !after) return null;
  if (before?.status && after?.status) {
    return (
      <div className="flex items-center gap-1.5 text-xs mt-1 flex-wrap">
        <span className="bg-red-50 border border-red-100 text-red-600 px-1.5 py-0.5
                         rounded font-medium">
          {before.status}
        </span>
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="bg-green-50 border border-green-100 text-green-600 px-1.5 py-0.5
                         rounded font-medium">
          {after.status}
        </span>
      </div>
    );
  }
  return null;
}

function LogRow({ log }) {
  const time = new Date(log.createdAt);
  const timeStr = time.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
    ' ' + time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
      <td className="table-td whitespace-nowrap text-xs text-gray-400 w-28">{timeStr}</td>
      <td className="table-td">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center
                          text-xs font-bold text-gray-600 flex-shrink-0">
            {(log.actor?.name || 'S').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">
              {log.actor?.name || 'System'}
            </p>
            {log.actor?.role && (
              <span className={`text-xs px-1 py-0 rounded font-medium
                ${ROLE_BADGE[log.actor.role] || 'bg-gray-100 text-gray-500'}`}>
                {log.actor.role}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="table-td whitespace-nowrap">
        <ActionBadge action={log.action} />
      </td>
      <td className="table-td">
        <p className="text-xs text-gray-700 leading-snug">{log.description}</p>
        {log.target?.phone && (
          <p className="text-xs text-gray-400 font-mono mt-0.5">{log.target.phone}</p>
        )}
        <ChangeDiff before={log.changes?.before} after={log.changes?.after} />
      </td>
    </tr>
  );
}

function StatsStrip({ stats }) {
  if (!stats) return null;
  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {[
        { label: 'Total events', value: stats.total,      color: 'text-gray-900'   },
        { label: 'Today',        value: stats.todayCount,  color: 'text-blue-600'  },
        { label: 'This week',    value: stats.weekCount,   color: 'text-indigo-600'},
      ].map((s) => (
        <div key={s.label} className="card text-center py-3">
          <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

function HourlySparkline({ data }) {
  if (!data?.length) return null;
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const hours    = Array.from({ length: 24 }, (_, h) => {
    const found = data.find((d) => d._id === h);
    return { h, count: found?.count || 0 };
  });

  return (
    <div className="card mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Today's activity (by hour)
      </p>
      <div className="flex items-end gap-0.5 h-12">
        {hours.map(({ h, count }) => {
          const pct = (count / maxCount) * 100;
          return (
            <div key={h} className="flex-1 flex flex-col items-center gap-0.5"
              title={`${h}:00 — ${count} events`}>
              <div
                className="w-full bg-blue-400 rounded-sm transition-all"
                style={{ height: `${Math.max(pct, count > 0 ? 8 : 2)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-300 mt-1">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
}

export default function AuditLogs() {
  const [logs,    setLogs]    = useState([]);
  const [stats,   setStats]   = useState(null);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  const [search,    setSearch]    = useState('');
  const [action,    setAction]    = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [exporting, setExporting] = useState(false);
  const [purging,   setPurging]   = useState(false);
  const LIMIT = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (search)   params.search   = search;
      if (action)   params.action   = action;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo)   params.dateTo   = dateTo;
      const { data } = await api.get('/audit/logs', { params });
      setLogs(data.logs);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Failed to load audit logs'); }
    finally { setLoading(false); }
  }, [search, action, dateFrom, dateTo, page]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const { data } = await api.get('/audit/stats');
      setStats(data);
    } catch {} finally { setStatsLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchLogs, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetchLogs]);

  useEffect(() => { setPage(1); }, [search, action, dateFrom, dateTo]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (action)   params.set('action',   action);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo)   params.set('dateTo',   dateTo);
      const token    = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/audit/export?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const handlePurge = async () => {
    const days = window.prompt('Purge logs older than how many days?', '365');
    if (!days) return;
    if (!window.confirm(`Delete audit logs older than ${days} days?`)) return;
    setPurging(true);
    try {
      const { data } = await api.delete('/audit/purge', { data: { olderThanDays: Number(days) } });
      toast.success(data.message);
      fetchLogs();
      fetchStats();
    } catch { toast.error('Purge failed'); }
    finally { setPurging(false); }
  };

  const clearFilters = () => { setSearch(''); setAction(''); setDateFrom(''); setDateTo(''); };
  const hasFilters   = search || action || dateFrom || dateTo;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="page-title">Audit Logs</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Complete history of every action in the system
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExport} disabled={exporting} className="btn-secondary text-xs py-1.5">
            {exporting ? 'Exporting…' : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Export CSV
              </>
            )}
          </button>
          <button onClick={handlePurge} disabled={purging}
            className="btn-ghost text-xs py-1.5 text-red-400 hover:text-red-600">
            {purging ? 'Purging…' : 'Purge old'}
          </button>
        </div>
      </div>

      {!statsLoading && <StatsStrip stats={stats} />}
      {stats?.hourlyToday?.length > 0 && <HourlySparkline data={stats.hourlyToday} />}

      {/* Top actors */}
      {stats?.topActors?.length > 0 && (
        <div className="card mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Most active this month
          </p>
          <div className="flex flex-wrap gap-2">
            {stats.topActors.slice(0, 8).map((a, i) => (
              <div key={i}
                className="flex items-center gap-1.5 bg-gray-50 border border-gray-200
                           rounded-full px-2.5 py-1">
                <span className={`text-xs font-medium
                  ${ROLE_BADGE[a.role] || 'text-gray-600'}`}>{a.name}</span>
                <span className="text-xs font-bold text-gray-700">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input className="input pl-9 text-sm" placeholder="Search logs…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <select className="input w-44 text-sm" value={action}
          onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {Object.entries(ACTION_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <input type="date" className="input w-36 text-sm" value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)} title="From date" />
        <input type="date" className="input w-36 text-sm" value={dateTo}
          onChange={(e) => setDateTo(e.target.value)} title="To date" />

        {hasFilters && (
          <button onClick={clearFilters} className="btn-ghost text-xs">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-3">
        {total.toLocaleString()} event{total !== 1 ? 's' : ''}{hasFilters ? ' (filtered)' : ''}
      </p>

      {/* Log table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <svg className="w-6 h-6 text-blue-400 animate-spin mx-auto mb-2"
              fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm text-gray-400">Loading logs…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {hasFilters ? (
              <>No logs match.{' '}
                <button onClick={clearFilters}
                  className="text-blue-600 hover:underline touch-manipulation">
                  Clear filters
                </button>
              </>
            ) : 'No audit logs yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="table-th w-28">Time</th>
                  <th className="table-th w-40">User</th>
                  <th className="table-th w-40">Action</th>
                  <th className="table-th">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => <LogRow key={log._id} log={log} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">
              ← Prev
            </button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}