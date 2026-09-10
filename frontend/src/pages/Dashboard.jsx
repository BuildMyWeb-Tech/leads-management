import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { LEAD_STATUSES, STATUS_BAR_COLORS, STATUS_BADGE_CLASSES } from '../constants/leadConstants';
import KpiCard from '../components/director/KpiCard';
import PwaStatusCard from '../components/pwa/PwaStatusCard';
import toast from 'react-hot-toast';

function StatCard({ label, value, color = 'text-gray-900', sub, icon }) {
  return (
    <div className="card flex items-start gap-3 p-4">
      {icon && (
        <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const PIPELINE_ORDER = [
  'New','Allocated','Called','Follow Up',
  'Site Visit Planned','Site Visit Done',
  'Interested','Negotiation','Booked',
];
const DEAD_ORDER = ['Wrong Number','Not Interested','Closed'];

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats]           = useState(null);
  const [allocStats, setAllocStats] = useState(null);
  const [loading, setLoading]       = useState(true);
  // PHASE E: explicit error state — a failed stats fetch must never
  // silently render as an all-zero dashboard (previous behavior: no
  // catch at all on the primary fetch).
  const [error, setError]           = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statsRes = await api.get('/leads/dashboard/stats');
      setStats(statsRes.data);
      if (user?.role === 'admin') {
        try {
          const aRes = await api.get('/allocation/stats');
          setAllocStats(aRes.data);
        } catch (_) {
          // Allocation stats are a secondary, admin-only widget —
          // its own failure shouldn't block the primary dashboard.
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load dashboard data.');
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <svg className="w-10 h-10 text-red-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm font-medium text-gray-700">Unable to load dashboard data.</p>
        <p className="text-xs text-gray-400 mt-1 mb-4">{error}</p>
        <button onClick={fetchAll} className="btn-secondary text-sm">
          Try again
        </button>
      </div>
    );
  }

  const statusMap      = Object.fromEntries((stats?.statusStats || []).map((s) => [s._id, s.count]));
  const total          = stats?.totalLeads || 0;
  const booked         = statusMap['Booked'] || 0;
  const siteVisit      = (statusMap['Site Visit Planned'] || 0) + (statusMap['Site Visit Done'] || 0);
  const conversionRate = total > 0 ? Math.round((booked / total) * 100) : 0;

  return (
    <div>
      {/* ── Header ───────────────────────────────────────── */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome back, <span className="font-medium text-gray-700">{user?.name}</span>
            <span className="ml-2 text-xs text-gray-400 capitalize">({user?.role})</span>
          </p>
        </div>
        {(user.role === 'admin' || user.role === 'director' || user.role === 'tl') && (
          <Link to="/leads/add" className="btn-primary text-sm flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Add Lead</span>
            <span className="sm:hidden">Add Lead </span>
          </Link>
        )}
      </div>

      {/* ── KPI cards — 2 cols mobile, 4 cols desktop ─────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Total Leads" value={total}
          icon={<svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>}
        />
        <StatCard
          label="Unassigned" value={stats?.unassigned}
          color={stats?.unassigned > 0 ? 'text-orange-500' : 'text-green-600'}
          sub="needs allocation"
          icon={<svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>}
        />
        <StatCard
          label="Site Visits" value={siteVisit}
          color="text-purple-600"
          icon={<svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>}
        />
        <StatCard
          label="Booked" value={booked}
          color="text-emerald-600"
          sub={`${conversionRate}% conversion`}
          icon={<svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>}
        />
      </div>

      {/* ── Director summary cards — Admin only (Phase 11D) ──
           One KpiCard per director showing Total Leads.
           Each card links to the Director Dashboard, pre-filtered
           to that director (Phase 11E will read this query param).
           Reuses stats.directorStats from /leads/dashboard/stats —
           no new API call. ────────────────────────────────── */}
      {user?.role === 'admin' && (stats?.directorStats || []).length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Directors</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.directorStats.map((d) => (
              <Link
                key={d._id}
                to={`/director-dashboard?director=${encodeURIComponent(d.name)}`}
                className="block hover:opacity-80 transition-opacity"
              >
                <KpiCard
                  label={d.name}
                  value={d.count}
                  sub="Total Leads"
                  color="text-indigo-600"
                  icon={
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center
                                    justify-center text-sm font-bold text-indigo-700">
                      {d.name?.charAt(0)}
                    </div>
                  }
                />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Main grid — stacks on mobile ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Pipeline breakdown */}
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Pipeline breakdown</h3>

          <div className="mb-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              Active stages
            </p>
            <div className="space-y-2">
              {PIPELINE_ORDER.map((s) => {
                const count    = statusMap[s] || 0;
                const pct      = total > 0 ? Math.round((count / total) * 100) : 0;
                const barColor = STATUS_BAR_COLORS[s]    || 'bg-gray-400';
                const badgeCls = STATUS_BADGE_CLASSES[s] || 'bg-gray-100 text-gray-500 ring-gray-200';
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs
                      font-medium ring-1 ring-inset flex-shrink-0
                      w-32 sm:w-40 truncate ${badgeCls}`}>
                      {s}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className={`${barColor} h-1.5 rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-7 text-right font-medium flex-shrink-0">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              Closed / dead
            </p>
            <div className="flex flex-wrap gap-3">
              {DEAD_ORDER.map((s) => {
                const count    = statusMap[s] || 0;
                const badgeCls = STATUS_BADGE_CLASSES[s] || 'bg-gray-100 text-gray-500';
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full
                      text-xs font-medium ring-1 ring-inset ${badgeCls}`}>
                      {s}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* By source */}
          <div className="card flex-1">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">By source</h3>
            <div className="space-y-2">
              {(stats?.sourceStats || []).slice(0, 7).map((s) => {
                const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
                return (
                  <div key={s._id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-20 flex-shrink-0 truncate">
                      {s._id}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-400 h-1.5 rounded-full"
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-6 text-right">{s.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Allocation engine — Admin only ──────────────── */}
      {/* {user?.role === 'admin' && allocStats && (
        <div className="card mt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Allocation engine</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {allocStats.config?.isActive
                  ? <span className="text-green-600 font-medium">● Active</span>
                  : <span className="text-gray-400">○ Inactive</span>
                }
                {allocStats.enabledCount > 0 && (
                  <span className="ml-2">
                    Sequence position: {allocStats.pointerPosition + 1} / {allocStats.enabledCount}
                  </span>
                )}
              </p>
            </div>
            <Link to="/allocation-config" className="btn-ghost text-xs py-1.5">
              Configure →
            </Link>
          </div>
          <div className="flex items-center flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              <span className="text-sm font-semibold text-gray-800">{allocStats.unallocated}</span>
              <span className="text-xs text-gray-400">unallocated</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              <span className="text-sm font-semibold text-gray-800">{allocStats.allocated}</span>
              <span className="text-xs text-gray-400">allocated</span>
            </div>
            {allocStats.unallocated > 0 && (
              <Link to="/allocation-config"
                className="ml-auto text-xs text-blue-600 hover:underline font-medium">
                Run allocation →
              </Link>
            )}
          </div>
        </div>
      )} */}

      {/* ── Recent leads ─────────────────────────────────── */}
      {(stats?.recentLeads || []).length > 0 && (
        <div className="card mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Recent leads</h3>
            <Link to="/leads" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.recentLeads.map((lead) => (
              <div key={lead._id}
                className="flex items-center justify-between py-2.5 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{lead.name}</p>
                  <p className="text-xs text-gray-400">{lead.phone}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-400 hidden sm:block">{lead.source}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full
                    text-xs font-medium ring-1 ring-inset
                    ${STATUS_BADGE_CLASSES[lead.status] || ''}`}>
                    {lead.status}
                  </span>
                  {lead.assignedDirector && (
                    <span className="text-xs text-gray-500 hidden md:block">
                      {lead.assignedDirector.name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PWA status — Admin only */}
      {/* {user?.role === 'admin' && (
        <div className="mt-4">
          <PwaStatusCard />
        </div>
      )} */}
    </div>
  );
}