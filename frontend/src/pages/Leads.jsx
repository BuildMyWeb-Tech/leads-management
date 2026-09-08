import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';
import StatusEditor from '../components/leads/StatusEditor';
import LeadDetailDrawer from '../components/leads/LeadDetailDrawer';
import PriorityBadge from '../components/leads/PriorityBadge';
import FollowUpBadge from '../components/leads/FollowUpBadge';
import SiteVisitBadge from '../components/leads/SiteVisitBadge';
import { LEAD_STATUSES, LEAD_SOURCES, STATUS_BAR_COLORS, STATUS_BADGE_CLASSES } from '../constants/leadConstants';
import toast from 'react-hot-toast';

const STATUS_GROUPS = [
  { label: 'Intake',      statuses: ['New','Allocated'] },
  { label: 'Engagement',  statuses: ['Called','Follow Up'] },
  { label: 'Visit',       statuses: ['Site Visit Planned','Site Visit Done'] },
  { label: 'Conversion',  statuses: ['Interested','Negotiation','Booked'] },
  { label: 'Dead',        statuses: ['Wrong Number','Not Interested','Closed'] },
];

// ── Mobile lead card ───────────────────────────────────────────
function MobileLeadCard({ lead, onOpen, onStatusSave, isAdmin }) {
  const badgeCls = STATUS_BADGE_CLASSES[lead.status] || 'bg-gray-100 text-gray-500 ring-gray-200';
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-4
                 active:bg-gray-50 transition-colors cursor-pointer"
      onClick={() => onOpen(lead)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-gray-900 truncate">{lead.name}</p>
            {lead.leadId && <span className="text-xs font-mono text-gray-300">{lead.leadId}</span>}
          </div>
          <a
            href={`tel:${lead.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-blue-500 hover:underline"
          >
            {lead.phone}
          </a>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs
            font-medium ring-1 ring-inset ${badgeCls}`}>
            {lead.status}
          </span>
          <PriorityBadge priority={lead.priority} size="sm" />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
        {lead.propertyType && <span className="bg-gray-50 px-2 py-0.5 rounded">{lead.propertyType}</span>}
        {lead.targetLocation && <span className="truncate max-w-[8rem]">{lead.targetLocation}</span>}
        {lead.budget && <span>{lead.budget}</span>}
        {lead.assignedTelecaller && (
          <span>TC: <span className="text-gray-600">{lead.assignedTelecaller.name}</span></span>
        )}
      </div>

      {(lead.followUpDate || lead.siteVisits?.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {lead.followUpDate && <FollowUpBadge followUpDate={lead.followUpDate} status={lead.status} size="sm" />}
          <SiteVisitBadge siteVisits={lead.siteVisits} />
        </div>
      )}

      {/* Inline status editor row */}
      <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}>
        <StatusEditor lead={lead} onSave={onStatusSave} compact />
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(lead); }}
          className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 touch-manipulation"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Details
        </button>
      </div>
    </div>
  );
}

export default function Leads() {
  const { user } = useAuth();
  const [leads,  setLeads]  = useState([]);
  const [total,  setTotal]  = useState(0);
  const [loading, setLoading] = useState(false);

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  // 'createdAt' (default, unchanged behavior) or 'priority' — uses the
  // backend's existing GET /api/leads?sort=priority support
  // (leadsController.js, Phase C) — no client-side reordering of an
  // incomplete/paginated list is done.
  const [sortMode, setSortMode] = useState('createdAt');
  const [page,  setPage]  = useState(1);
  const [pages, setPages] = useState(1);
  const LIMIT = 25;

  const [drawerLead, setDrawerLead] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source = sourceFilter;
      if (search)       params.search = search;
      if (sortMode === 'priority') params.sort = 'priority';
      const { data } = await api.get('/leads', { params });
      setLeads(data.leads);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sourceFilter, sortMode, page]);

  useEffect(() => {
    const t = setTimeout(fetchLeads, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  useEffect(() => { setPage(1); }, [search, statusFilter, sourceFilter, sortMode]);

  // PHASE D FIX: previously destructured only {status, notes}, silently
  // dropping followUpDate (and any other field) before sending to the
  // API — a pre-existing bug. Now forwards whatever payload the caller
  // built (status/notes/followUpDate/remarks/siteVisit/profile fields),
  // matching what StatusEditor and the new drawer sections actually send.
  const handleStatusSave = async (leadId, payload) => {
    try {
      const { data: updated } = await api.put(`/leads/${leadId}`, payload);
      setLeads((prev) => prev.map((l) => (l._id === leadId ? updated : l)));
      if (drawerLead?._id === leadId) setDrawerLead(updated);
      toast.success('Lead updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
      throw err;
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete lead "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/leads/${id}`);
      toast.success('Lead deleted');
      setDrawerLead(null);
      fetchLeads();
    } catch {
      toast.error('Delete failed');
    }
  };

  const clearFilters = () => {
    setSearch(''); setStatusFilter(''); setSourceFilter(''); setPage(1);
  };
  const hasFilters = search || statusFilter || sourceFilter;

  return (
    <>
      <div>
        {/* ── Header ────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="page-title">Leads</h2>
            <p className="text-sm text-gray-400 mt-0.5">{total} total records</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile filter toggle */}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`sm:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg
                text-xs font-medium border transition-colors touch-manipulation
                ${showFilters || hasFilters
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-gray-600 border-gray-200'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {hasFilters && (
                <span className="w-4 h-4 bg-blue-600 text-white rounded-full text-xs
                                 flex items-center justify-center font-bold">!</span>
              )}
            </button>
            {(user.role === 'admin' || user.role === 'director') && (
              <Link to="/leads/add" className="btn-primary text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Add Lead</span>
                <span className="sm:hidden">Add</span>
              </Link>
            )}
          </div>
        </div>

        {/* ── Pipeline filter strip — horizontal scroll on mobile ── */}
        <div className="filter-strip mb-3">
          <button
            onClick={() => setStatusFilter('')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              touch-manipulation
              ${!statusFilter
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200'}`}
          >
            All ({total})
          </button>
          {STATUS_GROUPS.map((group) => (
            group.statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-medium border
                  transition-colors touch-manipulation
                  ${statusFilter === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {s}
              </button>
            ))
          ))}
        </div>

        {/* ── Search + source filter ─────────────────────── */}
        {/* Always visible on sm+, toggle-able on mobile */}
        <div className={`mb-4 ${showFilters ? 'block' : 'hidden sm:flex'} flex flex-col sm:flex-row flex-wrap gap-2`}>
          <div className="relative flex-1 min-w-0 sm:min-w-48 sm:max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="input pl-9"
              placeholder="Search name, phone, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input sm:w-40"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All Sources</option>
            {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-ghost text-xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}
          {/* Sort toggle — uses the backend's existing ?sort=priority
              support (Phase C). Priority filtering/property-type
              filtering are NOT exposed here because the backend does
              not yet accept those as query params (reported as a
              Phase D follow-up rather than faked client-side). */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-xs">
            <button
              onClick={() => setSortMode('createdAt')}
              className={`px-3 py-2 font-medium transition-colors touch-manipulation
                ${sortMode === 'createdAt' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}
            >
              Recent
            </button>
            <button
              onClick={() => setSortMode('priority')}
              className={`px-3 py-2 font-medium transition-colors touch-manipulation
                ${sortMode === 'priority' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}
            >
              Priority
            </button>
          </div>
        </div>

        {/* ── Content ───────────────────────────────────── */}
        {loading ? (
          <div className="py-16 text-center">
            <svg className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2"
              fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm text-gray-400">Loading leads...</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {hasFilters ? (
              <>No leads match these filters.{' '}
                <button onClick={clearFilters} className="text-blue-600 hover:underline">
                  Clear filters
                </button>
              </>
            ) : (
              <>No leads yet.{' '}
                {(user.role === 'admin' || user.role === 'director') && (
                  <Link to="/leads/add" className="text-blue-600 hover:underline">Add one?</Link>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
              {leads.map((lead) => (
                <MobileLeadCard
                  key={lead._id}
                  lead={lead}
                  onOpen={setDrawerLead}
                  onStatusSave={handleStatusSave}
                  isAdmin={user.role === 'admin'}
                />
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="table-th">Lead</th>
                      <th className="table-th">Mobile</th>
                      <th className="table-th hidden lg:table-cell">Property</th>
                      <th className="table-th hidden xl:table-cell">Location</th>
                      <th className="table-th hidden xl:table-cell">Budget</th>
                      <th className="table-th">Priority</th>
                      <th className="table-th">Status</th>
                      <th className="table-th hidden lg:table-cell">Follow-Up / Visit</th>
                      <th className="table-th hidden lg:table-cell">Telecaller</th>
                      <th className="table-th w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leads.map((lead) => (
                      <tr
                        key={lead._id}
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                        onClick={() => setDrawerLead(lead)}
                      >
                        <td className="table-td">
                          <p className="font-medium text-gray-800 leading-tight">{lead.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">{lead.leadId || '—'}</p>
                        </td>
                        <td className="table-td whitespace-nowrap text-gray-600">
                          <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()}
                            className="hover:text-blue-600 transition-colors">
                            {lead.phone}
                          </a>
                        </td>
                        <td className="table-td hidden lg:table-cell text-gray-500 text-xs">
                          {lead.propertyType || '—'}
                          {lead.propertyType === 'Plot' && lead.plotSquareFeet && (
                            <span className="text-gray-400"> ({lead.plotSquareFeet})</span>
                          )}
                        </td>
                        <td className="table-td hidden xl:table-cell text-gray-500 text-xs truncate max-w-[8rem]">
                          {lead.targetLocation || '—'}
                        </td>
                        <td className="table-td hidden xl:table-cell text-gray-500 text-xs">
                          {lead.budget || '—'}
                        </td>
                        <td className="table-td">
                          <PriorityBadge priority={lead.priority} size="sm" />
                        </td>
                        <td className="table-td" onClick={(e) => e.stopPropagation()}>
                          <StatusEditor lead={lead} onSave={handleStatusSave} compact />
                        </td>
                        <td className="table-td hidden lg:table-cell text-xs">
                          <div className="flex flex-col gap-1 items-start">
                            {lead.followUpDate && <FollowUpBadge followUpDate={lead.followUpDate} status={lead.status} size="sm" />}
                            <SiteVisitBadge siteVisits={lead.siteVisits} />
                          </div>
                        </td>
                        <td className="table-td hidden lg:table-cell text-xs">
                          {lead.assignedTelecaller
                            ? <span className="text-gray-700">{lead.assignedTelecaller.name}</span>
                            : <span className="text-orange-400 font-medium">Unassigned</span>}
                        </td>
                        <td className="table-td" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setDrawerLead(lead)}
                              className="p-1.5 text-gray-400 hover:text-blue-600
                                hover:bg-blue-50 rounded transition-colors"
                              title="View details"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                                stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            {user.role === 'admin' && (
                              <button
                                onClick={() => handleDelete(lead._id, lead.name)}
                                className="p-1.5 text-gray-400 hover:text-red-600
                                  hover:bg-red-50 rounded transition-colors"
                                title="Delete lead"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                                  stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Pagination ────────────────────────────────── */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-500">
              Page {page} of {pages} — {total} leads
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Drawer ───────────────────────────────── */}
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