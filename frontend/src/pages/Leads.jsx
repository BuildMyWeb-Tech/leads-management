import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';
import StatusEditor from '../components/leads/StatusEditor';
import LeadDetailDrawer from '../components/leads/LeadDetailDrawer';
import { LEAD_STATUSES, LEAD_SOURCES, STATUS_BAR_COLORS } from '../constants/leadConstants';
import toast from 'react-hot-toast';

// Pipeline groups for the filter strip
const STATUS_GROUPS = [
  { label: 'Intake',      statuses: ['New', 'Allocated'] },
  { label: 'Engagement',  statuses: ['Called', 'Follow Up'] },
  { label: 'Visit',       statuses: ['Site Visit Planned', 'Site Visit Done'] },
  { label: 'Conversion',  statuses: ['Interested', 'Negotiation', 'Booked'] },
  { label: 'Dead',        statuses: ['Wrong Number', 'Not Interested', 'Closed'] },
];

export default function Leads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const LIMIT = 25;

  // Drawer
  const [drawerLead, setDrawerLead] = useState(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source = sourceFilter;
      if (search)       params.search = search;
      const { data } = await api.get('/leads', { params });
      setLeads(data.leads);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sourceFilter, page]);

  // Debounce search; immediate on filter/page change
  useEffect(() => {
    const t = setTimeout(fetchLeads, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, sourceFilter]);

  const handleStatusSave = async (leadId, { status, notes }) => {
    try {
      const { data: updated } = await api.put(`/leads/${leadId}`, { status, notes });
      setLeads((prev) => prev.map((l) => (l._id === leadId ? updated : l)));
      // Keep drawer in sync
      if (drawerLead?._id === leadId) setDrawerLead(updated);
      toast.success('Status updated');
    } catch {
      toast.error('Update failed');
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
    setSearch('');
    setStatusFilter('');
    setSourceFilter('');
    setPage(1);
  };

  const hasFilters = search || statusFilter || sourceFilter;

  // Count by status for the filter pills
  const statusCounts = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div>
        {/* ── Header ──────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="page-title">Leads</h2>
            <p className="text-sm text-gray-400 mt-0.5">{total} total records</p>
          </div>
          {(user.role === 'admin' || user.role === 'director') && (
            <Link to="/leads/add" className="btn-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Lead
            </Link>
          )}
        </div>

        {/* ── Pipeline stage filter strip ─────────── */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {/* All button */}
            <button
              onClick={() => setStatusFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${!statusFilter
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
            >
              All ({total})
            </button>

            {STATUS_GROUPS.map((group) => (
              <div key={group.label} className="flex items-center gap-1">
                <span className="text-xs text-gray-300">|</span>
                {group.statuses.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                      ${statusFilter === s
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── Search + source filter ───────────────── */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-48 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="input pl-9"
              placeholder="Search name, phone, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input w-40"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All Sources</option>
            {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-ghost text-xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}
        </div>

        {/* ── Table ───────────────────────────────── */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <svg className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <p className="text-sm text-gray-400">Loading leads...</p>
            </div>
          ) : leads.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {hasFilters ? (
                <>
                  No leads match these filters.{' '}
                  <button onClick={clearFilters} className="text-blue-600 hover:underline">Clear filters</button>
                </>
              ) : (
                <>
                  No leads yet.{' '}
                  {(user.role === 'admin' || user.role === 'director') && (
                    <Link to="/leads/add" className="text-blue-600 hover:underline">Add one?</Link>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="table-th">Name</th>
                    <th className="table-th">Phone</th>
                    <th className="table-th hidden md:table-cell">Source</th>
                    <th className="table-th">Status</th>
                    <th className="table-th hidden lg:table-cell">Director</th>
                    <th className="table-th hidden lg:table-cell">Telecaller</th>
                    <th className="table-th hidden xl:table-cell">Date</th>
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
                      {/* Name */}
                      <td className="table-td">
                        <p className="font-medium text-gray-800 leading-tight">{lead.name}</p>
                        {lead.email && <p className="text-xs text-gray-400 mt-0.5">{lead.email}</p>}
                      </td>

                      {/* Phone */}
                      <td className="table-td whitespace-nowrap text-gray-600">
                        <a
                          href={`tel:${lead.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-blue-600 transition-colors"
                        >
                          {lead.phone}
                        </a>
                      </td>

                      {/* Source */}
                      <td className="table-td hidden md:table-cell text-gray-500">{lead.source}</td>

                      {/* Status — inline editor, stop row click propagation */}
                      <td className="table-td" onClick={(e) => e.stopPropagation()}>
                        <StatusEditor lead={lead} onSave={handleStatusSave} compact />
                      </td>

                      {/* Director */}
                      <td className="table-td hidden lg:table-cell text-xs">
                        {lead.assignedDirector
                          ? <span className="text-gray-700">{lead.assignedDirector.name}</span>
                          : <span className="text-orange-400 font-medium">Unassigned</span>}
                      </td>

                      {/* Telecaller */}
                      <td className="table-td hidden lg:table-cell text-xs">
                        {lead.assignedTelecaller
                          ? <span className="text-gray-700">{lead.assignedTelecaller.name}</span>
                          : <span className="text-orange-400 font-medium">Unassigned</span>}
                      </td>

                      {/* Date */}
                      <td className="table-td hidden xl:table-cell text-gray-400 text-xs whitespace-nowrap">
                        {new Date(lead.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>

                      {/* Actions */}
                      <td className="table-td" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setDrawerLead(lead)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="View details"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          {user.role === 'admin' && (
                            <button
                              onClick={() => handleDelete(lead._id, lead.name)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete lead"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
          )}
        </div>

        {/* ── Pagination ───────────────────────────── */}
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

      {/* ── Detail Drawer ──────────────────────────── */}
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
