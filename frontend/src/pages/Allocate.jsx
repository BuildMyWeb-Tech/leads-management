import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';
import toast from 'react-hot-toast';

export default function Allocate() {
  const { user } = useAuth();

  const [leads, setLeads] = useState([]);
  const [directors, setDirectors] = useState([]);
  const [telecallers, setTelecallers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState(new Set());
  const [assignDirector, setAssignDirector] = useState('');
  const [assignTelecaller, setAssignTelecaller] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAll, setShowAll] = useState(false);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/leads', { params: { limit: 200 } });
      setLeads(data.leads);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    if (user.role === 'admin') {
      api.get('/users?role=director').then((r) => setDirectors(r.data));
    }
    api.get('/users?role=telecaller').then((r) => setTelecallers(r.data));
  }, [user.role]);

  const displayLeads = showAll
    ? leads
    : leads.filter((l) =>
        user.role === 'admin' ? !l.assignedDirector : !l.assignedTelecaller
      );

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === displayLeads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayLeads.map((l) => l._id)));
    }
  };

  const handleAssign = async () => {
    if (selected.size === 0) return toast.error('Select at least one lead');
    if (!assignDirector && !assignTelecaller)
      return toast.error('Choose a director or telecaller to assign to');

    setSaving(true);
    try {
      const body = { leadIds: [...selected] };
      if (user.role === 'admin' && assignDirector) body.assignedDirector = assignDirector;
      if (assignTelecaller) body.assignedTelecaller = assignTelecaller;

      const { data } = await api.post('/leads/bulk-assign', body);
      toast.success(data.message);
      setSelected(new Set());
      setAssignDirector('');
      setAssignTelecaller('');
      await fetchLeads();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Assignment failed');
    } finally {
      setSaving(false);
    }
  };

  const allChecked = selected.size > 0 && selected.size === displayLeads.length;
  const someChecked = selected.size > 0 && selected.size < displayLeads.length;

  return (
    <div>
      <div className="mb-5">
        <h2 className="page-title">Allocate Leads</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          {user.role === 'admin'
            ? 'Assign leads to directors and telecallers'
            : 'Assign your leads to telecallers'}
        </p>
      </div>

      {/* Assignment Panel */}
      <div className="card mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Assignment Controls</h3>
        <div className="flex flex-wrap items-end gap-4">

          {/* Assign to Director — Admin only */}
          {user.role === 'admin' && (
            <div>
              <label className="label">Assign to Director</label>
              <select
                className="input w-52"
                value={assignDirector}
                onChange={(e) => setAssignDirector(e.target.value)}
              >
                <option value="">— Select Director —</option>
                {directors.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Assign to Telecaller */}
          <div>
            <label className="label">Assign to Telecaller</label>
            <select
              className="input w-52"
              value={assignTelecaller}
              onChange={(e) => setAssignTelecaller(e.target.value)}
            >
              <option value="">— Select Telecaller —</option>
              {telecallers.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleAssign}
            disabled={saving || selected.size === 0}
            className="btn-primary"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Assigning...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Assign {selected.size > 0 ? `(${selected.size} selected)` : 'Selected'}
              </>
            )}
          </button>

          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="btn-ghost text-xs">
              Clear selection
            </button>
          )}
        </div>
      </div>

      {/* Filter toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            Showing{' '}
            <span className="font-medium text-gray-900">{displayLeads.length}</span>{' '}
            {showAll
              ? 'total'
              : user.role === 'admin'
              ? 'unassigned (no director)'
              : 'unassigned (no telecaller)'}{' '}
            leads
          </span>
          <button
            onClick={() => { setShowAll((v) => !v); setSelected(new Set()); }}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {showAll ? 'Show unassigned only' : 'Show all leads'}
          </button>
        </div>
        <span className="text-xs text-gray-400">{leads.length} total leads loaded</span>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading leads...</div>
        ) : displayLeads.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {showAll ? 'No leads found.' : 'All leads are already assigned! 🎉'}
            {!showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="ml-2 text-blue-600 hover:underline"
              >
                View all leads
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="table-th w-12">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked; }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="table-th">Name</th>
                  <th className="table-th hidden sm:table-cell">Phone</th>
                  <th className="table-th hidden md:table-cell">Source</th>
                  <th className="table-th">Status</th>
                  <th className="table-th hidden lg:table-cell">Director</th>
                  <th className="table-th hidden lg:table-cell">Telecaller</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayLeads.map((lead) => {
                  const isSelected = selected.has(lead._id);
                  return (
                    <tr
                      key={lead._id}
                      onClick={() => toggleSelect(lead._id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="table-td">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="table-td">
                        <p className="font-medium text-gray-800">{lead.name}</p>
                        <p className="text-xs text-gray-400">{lead.email || '—'}</p>
                      </td>
                      <td className="table-td hidden sm:table-cell text-gray-500">
                        {lead.phone}
                      </td>
                      <td className="table-td hidden md:table-cell text-gray-500">
                        {lead.source}
                      </td>
                      <td className="table-td">
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="table-td hidden lg:table-cell text-xs">
                        {lead.assignedDirector ? (
                          <span className="text-gray-700">{lead.assignedDirector.name}</span>
                        ) : (
                          <span className="text-orange-400 font-medium">Unassigned</span>
                        )}
                      </td>
                      <td className="table-td hidden lg:table-cell text-xs">
                        {lead.assignedTelecaller ? (
                          <span className="text-gray-700">{lead.assignedTelecaller.name}</span>
                        ) : (
                          <span className="text-orange-400 font-medium">Unassigned</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
