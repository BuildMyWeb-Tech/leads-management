import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';

const ALL_STATUSES = ['New', 'Contacted', 'Interested', 'Not Interested', 'Closed'];

function StatCard({ label, value, color = 'text-gray-900', sub }) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function ProgressBar({ value, total, color = 'bg-blue-500' }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-6 text-right">{value}</span>
    </div>
  );
}

const STATUS_COLORS = {
  'New':           'bg-blue-500',
  'Contacted':     'bg-yellow-500',
  'Interested':    'bg-green-500',
  'Not Interested':'bg-red-400',
  'Closed':        'bg-gray-400',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/leads/dashboard/stats')
      .then((r) => setStats(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Loading dashboard...
      </div>
    );
  }

  const statusMap = Object.fromEntries((stats?.statusStats || []).map((s) => [s._id, s.count]));
  const interested = statusMap['Interested'] || 0;
  const closed = statusMap['Closed'] || 0;

  return (
    <div>
      <div className="mb-6">
        <h2 className="page-title">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Welcome back, <span className="font-medium text-gray-700">{user?.name}</span>
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Leads" value={stats?.totalLeads} />
        <StatCard label="Unassigned" value={stats?.unassigned} color="text-orange-500" sub="needs allocation" />
        <StatCard label="Interested" value={interested} color="text-green-600" />
        <StatCard label="Closed" value={closed} color="text-gray-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Leads by Status */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Leads by Status</h3>
          <div className="space-y-3">
            {ALL_STATUSES.map((s) => (
              <div key={s} className="flex items-center gap-3">
                <div className="w-28 flex-shrink-0">
                  <StatusBadge status={s} />
                </div>
                <ProgressBar
                  value={statusMap[s] || 0}
                  total={stats?.totalLeads || 1}
                  color={STATUS_COLORS[s]}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Leads */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Recent Leads</h3>
          {stats?.recentLeads?.length === 0 ? (
            <p className="text-sm text-gray-400">No leads yet.</p>
          ) : (
            <div className="space-y-1">
              {stats?.recentLeads?.map((lead) => (
                <div
                  key={lead._id}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{lead.name}</p>
                    <p className="text-xs text-gray-400">{lead.phone} · {lead.source}</p>
                  </div>
                  <StatusBadge status={lead.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leads by Source */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Leads by Source</h3>
          <div className="space-y-2">
            {(stats?.sourceStats || []).map((s) => (
              <div key={s._id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{s._id || 'Other'}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-blue-400 h-1.5 rounded-full"
                      style={{ width: `${Math.round((s.count / (stats?.totalLeads || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-gray-500 text-xs w-4 text-right">{s.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Manager Performance — Admin only */}
        {user?.role === 'admin' && (stats?.managerStats || []).length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Leads per Manager</h3>
            <div className="space-y-2">
              {stats.managerStats.map((m) => (
                <div key={m._id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{m.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-purple-400 h-1.5 rounded-full"
                        style={{ width: `${Math.round((m.count / (stats?.totalLeads || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-600 w-4 text-right">{m.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
