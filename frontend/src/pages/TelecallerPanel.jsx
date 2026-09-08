import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { STATUS_BADGE_CLASSES, STATUS_BAR_COLORS } from '../constants/leadConstants';
import StatusEditor from '../components/leads/StatusEditor';
import LeadDetailDrawer from '../components/leads/LeadDetailDrawer';
import PriorityBadge from '../components/leads/PriorityBadge';
import LeadCard from '../components/telecaller/LeadCard';
import toast from 'react-hot-toast';

function KpiStrip({ kpis }) {
  const items = [
    { label: 'My leads',  value: kpis.totalLeads,      color: 'text-gray-900' },
    { label: 'Today',     value: kpis.todayFollowUps,  color: 'text-blue-600',   sub: 'follow-ups' },
    { label: 'Overdue',   value: kpis.overdueFollowUps,
      color: kpis.overdueFollowUps > 0 ? 'text-red-500' : 'text-green-600' },
    { label: 'Interested',value: kpis.interested,      color: 'text-green-600' },
    { label: 'Booked',    value: kpis.booked,          color: 'text-emerald-600' },
    { label: 'Conv%',     value: `${kpis.convRate}%`,  color: 'text-blue-700' },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
      {items.map((item) => (
        <div key={item.label} className="card p-3 text-center">
          <p className={`text-xl font-bold leading-none ${item.color}`}>{item.value ?? '—'}</p>
          <p className="text-xs text-gray-400 mt-1 leading-tight">{item.label}</p>
          {item.sub && <p className="text-xs text-gray-300">{item.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function FollowUpItem({ lead, onOpen }) {
  const followUpDate = new Date(lead.followUpDate);
  const isOverdue    = followUpDate < new Date();
  const isToday      = followUpDate.toDateString() === new Date().toDateString();
  const daysUntil    = Math.ceil((followUpDate - new Date()) / (1000 * 60 * 60 * 24));

  return (
    <button
      onClick={() => onOpen(lead)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50
                 transition-colors text-left border-b border-gray-50 last:border-0
                 touch-manipulation"
    >
      <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center
        flex-shrink-0 text-center
        ${isOverdue ? 'bg-red-100' : isToday ? 'bg-orange-100' : 'bg-blue-50'}`}>
        <span className={`text-xs font-bold leading-none
          ${isOverdue ? 'text-red-600' : isToday ? 'text-orange-600' : 'text-blue-600'}`}>
          {followUpDate.getDate()}
        </span>
        <span className={`text-xs leading-none
          ${isOverdue ? 'text-red-400' : isToday ? 'text-orange-400' : 'text-blue-400'}`}>
          {followUpDate.toLocaleDateString('en-IN', { month: 'short' })}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{lead.name}</p>
        <p className="text-xs text-gray-400">{lead.phone}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-xs font-medium
          ${isOverdue ? 'text-red-500' : isToday ? 'text-orange-500' : 'text-blue-500'}`}>
          {isOverdue ? 'Overdue' : isToday ? 'Today' : `${daysUntil}d`}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs
          font-medium ring-1 ring-inset hidden sm:inline-flex
          ${STATUS_BADGE_CLASSES[lead.status] || ''}`}>
          {lead.status}
        </span>
      </div>
    </button>
  );
}

const STATUS_TABS = [
  { label: 'All',         value: '' },
  { label: 'Follow Up',   value: 'Follow Up' },
  { label: 'Called',      value: 'Called' },
  { label: 'Interested',  value: 'Interested' },
  { label: 'Site Visit',  value: 'Site Visit Planned' },
  { label: 'Negotiation', value: 'Negotiation' },
];

export default function TelecallerPanel() {
  const { user } = useAuth();
  const [kpis, setKpis]             = useState(null);
  const [leads, setLeads]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [statusTab, setStatusTab]   = useState('');
  const [search, setSearch]         = useState('');
  const [view, setView]             = useState('cards');
  const [page, setPage]             = useState(1);
  const [pages, setPages]           = useState(1);
  const [rightTab, setRightTab]     = useState('overview');
  const [dashData, setDashData]     = useState(null);
  const [drawerLead, setDrawerLead] = useState(null);
  const LIMIT = 20;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (statusTab) params.status = statusTab;
      if (search)    params.search = search;
      const { data } = await api.get('/leads', { params });
      setLeads(data.leads);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [statusTab, search, page]);

  const fetchDashboard = useCallback(async () => {
    setKpiLoading(true);
    try {
      const { data } = await api.get('/telecaller/dashboard');
      setKpis(data.kpis);
      setDashData(data);
    } catch {} finally {
      setKpiLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  useEffect(() => {
    const t = setTimeout(fetchLeads, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetchLeads]);
  useEffect(() => { setPage(1); }, [statusTab, search]);

  // PHASE D FIX: previously destructured only {status, notes,
  // followUpDate}, so remarks/siteVisit updates from the drawer's new
  // sections would have been silently dropped for telecallers. Now
  // forwards the full payload — the backend's telecaller branch
  // (leadsController.updateLead) already validates/restricts what it
  // actually accepts.
  const handleStatusSave = async (leadId, payload) => {
    try {
      const { data: updated } = await api.put(`/leads/${leadId}`, payload);
      setLeads((prev) => prev.map((l) => (l._id === leadId ? updated : l)));
      if (drawerLead?._id === leadId) setDrawerLead(updated);
      toast.success('Updated');
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
      throw err;
    }
  };

  const hasFilters = statusTab || search;

  return (
    <>
      <div>
        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="page-title">My Leads</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Welcome, <span className="font-medium text-gray-700">{user?.name}</span>
            </p>
          </div>
          {/* View toggle — visible on all sizes */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('cards')}
              className={`p-2 transition-colors touch-manipulation
                ${view === 'cards' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-50'}`}
              title="Card view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setView('table')}
              className={`p-2 transition-colors touch-manipulation
                ${view === 'table' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-50'}`}
              title="Table view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── KPI strip ──────────────────────────────────── */}
        {kpis && !kpiLoading && <KpiStrip kpis={kpis} />}

        {/* ── Main layout ────────────────────────────────── */}
        <div className="flex gap-5">
          {/* ── Left: leads ──────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {/* Status tabs — scrollable on mobile */}
            <div className="status-tabs mb-4">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatusTab(tab.value)}
                  className={`flex-shrink-0 px-3 py-2.5 text-sm font-medium border-b-2
                    whitespace-nowrap transition-colors -mb-px touch-manipulation
                    ${statusTab === tab.value
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className="input pl-9"
                placeholder="Search name, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                             hover:text-gray-600 touch-manipulation p-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Result count */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-gray-800">{total}</span> leads
                {statusTab && (
                  <span className="ml-1">in <span className="font-medium">{statusTab}</span></span>
                )}
              </p>
              {hasFilters && (
                <button
                  onClick={() => { setStatusTab(''); setSearch(''); }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            {/* ── Card view ────────────────────────────── */}
            {view === 'cards' && (
              <>
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
                        <div className="flex gap-3 mb-3">
                          <div className="w-9 h-9 rounded-full bg-gray-100" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3 bg-gray-100 rounded w-3/4" />
                            <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 rounded mb-2" />
                        <div className="h-2 bg-gray-100 rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : leads.length === 0 ? (
                  <div className="py-16 text-center">
                    <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none"
                      viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-sm text-gray-400">
                      {hasFilters ? 'No leads match your filters.' : 'No leads assigned to you yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {leads.map((lead) => (
                      <LeadCard
                        key={lead._id}
                        lead={lead}
                        onSave={handleStatusSave}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Table view ─────────────────────────── */}
            {view === 'table' && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {loading ? (
                  <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
                ) : leads.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">No leads found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="table-th">Name</th>
                          <th className="table-th">Phone</th>
                          <th className="table-th">Priority</th>
                          <th className="table-th">Status</th>
                          <th className="table-th hidden md:table-cell">Follow-up</th>
                          <th className="table-th hidden lg:table-cell">Source</th>
                          <th className="table-th w-14"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {leads.map((lead) => {
                          const fu = lead.followUpDate ? new Date(lead.followUpDate) : null;
                          const fuOverdue = fu && fu < new Date();
                          return (
                            <tr key={lead._id}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => setDrawerLead(lead)}>
                              <td className="table-td">
                                <p className="font-medium text-gray-800">{lead.name}</p>
                              </td>
                              <td className="table-td">
                                <a href={`tel:${lead.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm text-blue-500 hover:underline">
                                  {lead.phone}
                                </a>
                              </td>
                              <td className="table-td">
                                <PriorityBadge priority={lead.priority} size="sm" />
                              </td>
                              <td className="table-td" onClick={(e) => e.stopPropagation()}>
                                <StatusEditor lead={lead} onSave={handleStatusSave} compact />
                              </td>
                              <td className="table-td hidden md:table-cell text-xs">
                                {fu ? (
                                  <span className={fuOverdue ? 'text-red-500 font-medium' : 'text-gray-600'}>
                                    {fu.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                    {fuOverdue && ' ⚠'}
                                  </span>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="table-td hidden lg:table-cell text-gray-500 text-xs">
                                {lead.source}
                              </td>
                              <td className="table-td" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => setDrawerLead(lead)}
                                  className="p-1.5 text-gray-400 hover:text-blue-600
                                    hover:bg-blue-50 rounded transition-colors touch-manipulation">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                                    stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-gray-500">Page {page} of {pages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">← Prev</button>
                  <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                    className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">Next →</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right panel — hidden on mobile/tablet ──────── */}
          <div className="hidden lg:flex flex-col w-72 flex-shrink-0 gap-4">
            <div className="flex border-b border-gray-200">
              {['overview','followups'].map((t) => (
                <button
                  key={t}
                  onClick={() => setRightTab(t)}
                  className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors -mb-px capitalize
                    ${rightTab === t
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  {t === 'followups'
                    ? `Follow-ups (${dashData?.upcomingFollowUps?.length || 0})`
                    : 'Overview'}
                </button>
              ))}
            </div>

            {rightTab === 'overview' && dashData && (
              <div className="card flex-1">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Status breakdown
                </h4>
                <div className="space-y-2">
                  {(dashData.statusBreakdown || []).map((s) => {
                    const pct = kpis?.totalLeads > 0
                      ? Math.round((s.count / kpis.totalLeads) * 100) : 0;
                    const barColor = STATUS_BAR_COLORS[s._id] || 'bg-gray-400';
                    const badgeCls = STATUS_BADGE_CLASSES[s._id] ||
                      'bg-gray-100 text-gray-500 ring-gray-200';
                    return (
                      <div key={s._id} className="flex items-center gap-2">
                        <button
                          onClick={() => setStatusTab(s._id === statusTab ? '' : s._id)}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full
                            text-xs font-medium ring-1 ring-inset w-36 truncate transition-opacity
                            ${s._id === statusTab ? 'opacity-100 ring-2' : 'opacity-80 hover:opacity-100'}
                            ${badgeCls}`}
                        >
                          {s._id}
                        </button>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div className={`${barColor} h-1.5 rounded-full`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-600 w-5 text-right">
                          {s.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {rightTab === 'followups' && (
              <div className="card flex-1 p-0 overflow-hidden">
                {(dashData?.upcomingFollowUps || []).length === 0 ? (
                  <div className="py-12 text-center px-4">
                    <svg className="w-10 h-10 text-green-200 mx-auto mb-2" fill="none"
                      viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-gray-400">No upcoming follow-ups</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 overflow-y-auto max-h-96 scrollbar-thin">
                    {dashData.upcomingFollowUps.map((lead) => (
                      <FollowUpItem key={lead._id} lead={lead} onOpen={setDrawerLead} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {drawerLead && (
        <LeadDetailDrawer
          lead={drawerLead}
          onClose={() => setDrawerLead(null)}
          onStatusSave={handleStatusSave}
        />
      )}
    </>
  );
}