import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';
import toast from 'react-hot-toast';

const STATUSES = ['New', 'Contacted', 'Interested', 'Not Interested', 'Closed'];

export default function Leads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: '', search: '' });
  const [editRow, setEditRow] = useState(null); // { id, status, notes }

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const { data } = await api.get('/leads', { params });
      setLeads(data.leads);
      setTotal(data.total);
    } catch {
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(fetchLeads, 300);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  const handleStatusSave = async () => {
    try {
      await api.put(`/leads/${editRow.id}`, {
        status: editRow.status,
        notes: editRow.notes,
      });
      toast.success('Lead updated');
      setEditRow(null);
      fetchLeads();
    } catch {
      toast.error('Update failed');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete lead "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/leads/${id}`);
      toast.success('Lead deleted');
      fetchLeads();
    } catch {
      toast.error('Delete failed');
    }
  };

  const clearFilters = () => setFilters({ status: '', search: '' });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="page-title">Leads</h2>
          <p className="text-sm text-gray-400 mt-0.5">{total} total records</p>
        </div>
        {(user.role === 'admin' || user.role === 'manager') && (
          <Link to="/leads/add" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Lead
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          className="input w-64"
          placeholder="Search name, phone, email..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <select
          className="input w-44"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        {(filters.search || filters.status) && (
          <button onClick={clearFilters} className="btn-ghost text-xs">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading leads...</div>
        ) : leads.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            No leads found.{' '}
            {(user.role === 'admin' || user.role === 'manager') && (
              <Link to="/leads/add" className="text-blue-600 hover:underline">Add one?</Link>
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
                  <th className="table-th hidden lg:table-cell">Manager</th>
                  <th className="table-th hidden lg:table-cell">Employee</th>
                  <th className="table-th hidden xl:table-cell">Date</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr key={lead._id} className="hover:bg-gray-50 transition-colors">
                    {/* Name */}
                    <td className="table-td">
                      <p className="font-medium text-gray-800">{lead.name}</p>
                      {lead.email && <p className="text-xs text-gray-400">{lead.email}</p>}
                    </td>

                    {/* Phone */}
                    <td className="table-td whitespace-nowrap">{lead.phone}</td>

                    {/* Source */}
                    <td className="table-td hidden md:table-cell text-gray-500">{lead.source}</td>

                    {/* Status — inline edit */}
                    <td className="table-td">
                      {editRow?.id === lead._id ? (
                        <select
                          className="input-sm w-36"
                          value={editRow.status}
                          onChange={(e) => setEditRow({ ...editRow, status: e.target.value })}
                        >
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() =>
                            setEditRow({ id: lead._id, status: lead.status, notes: lead.notes || '' })
                          }
                          title="Click to edit status"
                        >
                          <StatusBadge status={lead.status} />
                        </button>
                      )}
                    </td>

                    {/* Manager */}
                    <td className="table-td hidden lg:table-cell text-gray-500 text-xs">
                      {lead.assignedManager?.name || <span className="text-gray-300">—</span>}
                    </td>

                    {/* Employee */}
                    <td className="table-td hidden lg:table-cell text-gray-500 text-xs">
                      {lead.assignedEmployee?.name || <span className="text-gray-300">—</span>}
                    </td>

                    {/* Date */}
                    <td className="table-td hidden xl:table-cell text-gray-400 text-xs whitespace-nowrap">
                      {new Date(lead.createdAt).toLocaleDateString('en-IN')}
                    </td>

                    {/* Actions */}
                    <td className="table-td">
                      {editRow?.id === lead._id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={handleStatusSave}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditRow(null)}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setEditRow({ id: lead._id, status: lead.status, notes: lead.notes || '' })
                            }
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                          {user.role === 'admin' && (
                            <button
                              onClick={() => handleDelete(lead._id, lead.name)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes edit (shown below table when editing) */}
      {editRow && (
        <div className="mt-3 card flex items-start gap-3">
          <div className="flex-1">
            <label className="label text-xs">Notes for this lead</label>
            <textarea
              className="input text-sm"
              rows={2}
              value={editRow.notes}
              onChange={(e) => setEditRow({ ...editRow, notes: e.target.value })}
              placeholder="Add notes..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
