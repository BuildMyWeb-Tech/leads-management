import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import AttendanceWidget from '../components/attendance/AttendanceWidget';

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
const fmtTime = (d) => d
  ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  : '—';

export default function AttendancePage() {
  const [records,  setRecords]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const LIMIT = 30;

  const loadHistory = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/attendance/history', {
        params: { page: p, limit: LIMIT },
      });
      setRecords(data.records);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load attendance history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(1); }, [loadHistory]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="max-w-2xl">
      <h2 className="page-title mb-5">My Attendance</h2>

      <AttendanceWidget />

      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Attendance History</h3>
          {total > 0 && <span className="text-xs text-gray-400">{total} records</span>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button onClick={() => loadHistory(page)} className="btn-ghost text-sm">Retry</button>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-400">
            <svg className="w-10 h-10 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">No attendance records yet</p>
            <p className="text-xs mt-1">Mark yourself present using the button above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-50">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Time Marked</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r._id || r.businessDate} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800">{fmtDate(r.businessDate)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmtTime(r.markedAt)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded font-medium bg-green-100 text-green-700">
                        Present
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <button
              onClick={() => loadHistory(page - 1)}
              disabled={page <= 1 || loading}
              className="text-sm text-gray-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
            <button
              onClick={() => loadHistory(page + 1)}
              disabled={page >= totalPages || loading}
              className="text-sm text-gray-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
