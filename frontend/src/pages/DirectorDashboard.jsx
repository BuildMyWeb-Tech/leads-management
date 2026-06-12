import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { STATUS_BADGE_CLASSES } from '../constants/leadConstants';
import KpiCard from '../components/director/KpiCard';
import WeeklyTrendChart from '../components/director/WeeklyTrendChart';
import TelecallerRow from '../components/director/TelecallerRow';
import PipelineDonut from '../components/director/PipelineDonut';
import StatusEditor from '../components/leads/StatusEditor';
import toast from 'react-hot-toast';

function Section({ title, action, children }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function FollowUpItem({ lead, onStatusSave }) {
  const age = Math.floor((Date.now() - new Date(lead.updatedAt)) / (1000 * 60 * 60 * 24));
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{lead.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {lead.phone}
          {lead.assignedTelecaller && (
            <span className="ml-2 text-blue-500">→ {lead.assignedTelecaller.name}</span>
          )}
        </p>
        {lead.notes && (
          <p className="text-xs text-gray-500 mt-0.5 truncate italic">"{lead.notes}"</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-xs font-medium
          ${age >= 3 ? 'text-red-500' : age >= 1 ? 'text-orange-400' : 'text-gray-400'}`}>
          {age === 0 ? 'today' : `${age}d ago`}
        </span>
        <StatusEditor lead={lead} onSave={onStatusSave} compact />
      </div>
    </div>
  );
}

export default function DirectorDashboard() {
  const { user } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [directors, setDirectors]     = useState([]);
  const [selectedDir, setSelectedDir] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (user.role === 'admin' && selectedDir) params.directorId = selectedDir;
      const [dashRes] = await Promise.all([api.get('/director/dashboard', { params })]);
      setData(dashRes.data);
    } catch {
      toast.error('Failed to load director dashboard');
    } finally {
      setLoading(false);
    }
  }, [user.role, selectedDir]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (user.role === 'admin') {
      api.get('/users?role=director').then((r) => setDirectors(r.data));
    }
  }, [user.role]);

  const handleStatusSave = async (leadId, { status, notes }) => {
    try {
      await api.put(`/leads/${leadId}`, { status, notes });
      toast.success('Status updated');
      fetchData();
    } catch {
      toast.error('Update failed');
    }
  };

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

  const k = data?.kpis || {};

  return (
    <div>
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="page-title">Director Dashboard</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {user.role === 'director' ? 'Your leads and team performance' : 'Director performance overview'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {user.role === 'admin' && (
            <select
              className="input w-44 text-sm"
              value={selectedDir}
              onChange={(e) => setSelectedDir(e.target.value)}
            >
              <option value="">All directors</option>
              {directors.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          )}
          <button onClick={fetchData} className="btn-ghost text-xs">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {/* Refresh */}
          </button>
          <Link to="/leads" className="btn-primary text-sm">View leads →</Link>
        </div>
      </div>

      {/* ── KPI grid — 2 cols mobile, 3 tablet, 6 desktop ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <KpiCard label="Total leads"  value={k.totalLeads}  color="text-gray-900"
          icon={<svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>}
        />
        <KpiCard label="Today"        value={k.todayLeads}  color="text-blue-600"  sub="new leads"
          icon={<svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>}
        />
        <KpiCard label="This week"    value={k.weekLeads}   color="text-indigo-600" sub="last 7 days"
          icon={<svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>}
        />
        <KpiCard label="Site visits"
          value={(k.siteVisitPlanned || 0) + (k.siteVisitDone || 0)}
          color="text-purple-600" sub={`${k.siteVisitDone || 0} done`}
          icon={<svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>}
        />
        <KpiCard label="Booked"       value={k.booked}      color="text-emerald-600"
          sub={`${k.conversionRate}% rate`} highlight
          icon={<svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>}
        />
        <KpiCard label="Interested"   value={k.interested}  color="text-green-600"
          sub={`${k.qualifiedRate}% qualified`}
          icon={<svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M14 10h4.764a2 2 0 011.789 2.096l-.323 2.253A2 2 0 0118.44 16H7m-4 0h.01M7 16l-1-6h12l-1 6H7z" />
          </svg>}
        />
      </div>

      {/* ── Tabs — scrollable on mobile ──────────────────── */}
      <div className="status-tabs mb-5">
        {[
          { id: 'overview',    label: 'Overview' },
          { id: 'telecallers', label: `Telecallers (${(data?.telecallerBreakdown || []).length})` },
          { id: 'followups',   label: `Follow Ups (${(data?.followUps || []).length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2
              transition-colors -mb-px touch-manipulation
              ${activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title="Pipeline distribution">
            <PipelineDonut statusBreakdown={data?.statusBreakdown || []} />
          </Section>
          <Section title="Weekly lead trend"
            action={<span className="text-xs text-gray-400">Last 7 days</span>}>
            <WeeklyTrendChart data={data?.weeklyTrend || []} />
          </Section>
          <Section title="By source">
            <div className="space-y-2">
              {(data?.sourceBreakdown || []).slice(0, 6).map((s) => {
                const pct = k.totalLeads > 0 ? Math.round((s.count / k.totalLeads) * 100) : 0;
                return (
                  <div key={s._id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-24 truncate">{s._id}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-600 w-8 text-right">{s.count}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          <div className="lg:col-span-3">
            <Section title="Recent leads"
              action={<Link to="/leads" className="text-xs text-blue-600 hover:underline">View all →</Link>}>
              {(data?.recentLeads || []).length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No leads assigned yet</p>
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="table-th">Name</th>
                        <th className="table-th">Phone</th>
                        <th className="table-th hidden md:table-cell">Source</th>
                        <th className="table-th">Status</th>
                        <th className="table-th hidden lg:table-cell">Telecaller</th>
                        <th className="table-th hidden xl:table-cell">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.recentLeads.map((lead) => (
                        <tr key={lead._id} className="hover:bg-gray-50">
                          <td className="table-td font-medium text-gray-800">{lead.name}</td>
                          <td className="table-td text-gray-500">
                            <a href={`tel:${lead.phone}`} className="hover:text-blue-600">
                              {lead.phone}
                            </a>
                          </td>
                          <td className="table-td hidden md:table-cell text-gray-500">{lead.source}</td>
                          <td className="table-td">
                            <StatusEditor lead={lead} onSave={handleStatusSave} compact />
                          </td>
                          <td className="table-td hidden lg:table-cell text-xs text-gray-500">
                            {lead.assignedTelecaller?.name || (
                              <span className="text-orange-400">Unassigned</span>
                            )}
                          </td>
                          <td className="table-td hidden xl:table-cell text-xs text-gray-400">
                            {new Date(lead.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        </div>
      )}

      {/* ── Tab: Telecallers ─────────────────────────────── */}
      {activeTab === 'telecallers' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Team size"
              value={(data?.telecallerBreakdown || []).length} color="text-gray-900" />
            <KpiCard label="Unassigned"
              value={k.unassignedTC}
              color={k.unassignedTC > 0 ? 'text-orange-500' : 'text-green-600'}
              sub="no telecaller" />
            <KpiCard label="Total booked" value={k.booked}      color="text-emerald-600" />
            <KpiCard label="Follow-ups"   value={(data?.followUps || []).length} color="text-orange-500" />
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Telecaller activity</h3>
            {(data?.telecallerBreakdown || []).length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400 mb-2">No telecallers assigned yet</p>
                <Link to="/allocate" className="text-xs text-blue-600 hover:underline">
                  Go to Allocate Leads →
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="table-th w-8">#</th>
                      <th className="table-th">Telecaller</th>
                      <th className="table-th text-center">Total</th>
                      <th className="table-th text-center hidden sm:table-cell">Called</th>
                      <th className="table-th text-center hidden md:table-cell">Follow Up</th>
                      <th className="table-th text-center hidden lg:table-cell">Interested</th>
                      <th className="table-th text-center hidden lg:table-cell">Booked</th>
                      <th className="table-th text-center">Conv%</th>
                      <th className="table-th hidden xl:table-cell">Last active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.telecallerBreakdown.map((tc, i) => (
                      <TelecallerRow key={tc._id} tc={tc} rank={i + 1} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Follow Ups ──────────────────────────────── */}
      {activeTab === 'followups' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Pending follow-ups</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Leads in "Follow Up" status, oldest first
              </p>
            </div>
            <Link to="/leads?status=Follow+Up"
              className="text-xs text-blue-600 hover:underline">
              View all →
            </Link>
          </div>

          {(data?.followUps || []).length === 0 ? (
            <div className="py-12 text-center">
              <svg className="w-10 h-10 text-green-300 mx-auto mb-2" fill="none"
                viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-400">No pending follow-ups! 🎉</p>
            </div>
          ) : (
            <>
              {(data.followUps || []).some((l) => {
                const age = Math.floor((Date.now() - new Date(l.updatedAt)) / (1000*60*60*24));
                return age >= 3;
              }) && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4
                                flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-xs text-red-600 font-medium">
                    Some leads have been in Follow Up for 3+ days — action needed
                  </p>
                </div>
              )}
              {data.followUps.map((lead) => (
                <FollowUpItem key={lead._id} lead={lead} onStatusSave={handleStatusSave} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}