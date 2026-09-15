import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
const fmtTime = (d) => d
  ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  : '—';

/**
 * AttendanceHistoryDrawer — shows one employee's complete attendance history.
 *
 * Props:
 *   employee  — { _id, name, email }
 *   onClose   — callback to close
 */
export default function AttendanceHistoryDrawer({ employee, onClose }) {
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
      const { data } = await api.get(`/attendance/employee/${employee._id}/history`, {
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
  }, [employee._id]);

  useEffect(() => { loadHistory(1); }, [loadHistory]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed z-50 inset-y-0 right-0 w-full sm:w-96 bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{employee.name}</h3>
            <p className="text-xs text-gray-400">{employee.email}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Total badge */}
        <div className="px-5 py-3 border-b border-gray-50 flex-shrink-0">
          <span className="text-xs text-gray-500">{total} attendance record{total !== 1 ? 's' : ''} total</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <button onClick={() => loadHistory(page)} className="btn-ghost text-sm">Retry</button>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-10 h-10 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">No attendance records found</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-50">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r._id || r.businessDate} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm text-gray-800">{fmtDate(r.businessDate)}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{fmtTime(r.markedAt)}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded font-medium bg-green-100 text-green-700">
                        Present
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
            <button
              onClick={() => loadHistory(page - 1)}
              disabled={page <= 1 || loading}
              className="text-xs text-gray-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-400">{page} / {totalPages}</span>
            <button
              onClick={() => loadHistory(page + 1)}
              disabled={page >= totalPages || loading}
              className="text-xs text-gray-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
