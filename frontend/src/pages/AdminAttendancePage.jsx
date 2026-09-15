import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import AttendanceHistoryDrawer from '../components/attendance/AttendanceHistoryDrawer';

const todayISO = () => {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
};

const fmtTime = (d) => d
  ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  : '—';

export default function AdminAttendancePage() {
  const { user } = useAuth();
  const [date,    setDate]    = useState(todayISO);
  const [report,  setReport]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [drawer,  setDrawer]  = useState(null); // employee object | null

  const loadReport = useCallback(async (d) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/attendance/report', { params: { date: d } });
      setReport(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load attendance report');
      toast.error('Failed to load attendance report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReport(date); }, [loadReport, date]);

  const presentCount = report.filter((r) => r.present).length;
  const absentCount  = report.length - presentCount;

  const title = user?.role === 'tl' ? 'Team Attendance' : 'Attendance Report';

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h2 className="page-title">{title}</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">Date</label>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="input text-sm py-1.5 max-w-[160px]"
          />
        </div>
      </div>

      {/* Summary chips */}
      {!loading && !error && report.length > 0 && (
        <div className="flex gap-3 mb-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-lg border border-green-200">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-medium text-green-700">{presentCount} Present</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-lg border border-red-200">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-xs font-medium text-red-600">{absentCount} Absent</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-xs font-medium text-gray-600">{report.length} Total</span>
          </div>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button onClick={() => loadReport(date)} className="btn-ghost text-sm">Retry</button>
          </div>
        ) : report.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-10 h-10 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm">No employees found</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Marked At</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.map((row) => (
                    <tr key={row.employee._id}
                      className={`hover:bg-gray-50 transition-colors ${!row.employee.isActive ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{row.employee.name}</p>
                        <p className="text-xs text-gray-400">{row.employee.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          row.present
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-600'
                        }`}>
                          {row.present ? 'Present' : 'Absent'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {fmtTime(row.markedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDrawer(row.employee)}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-gray-100">
              {report.map((row) => (
                <div key={row.employee._id}
                  className={`px-4 py-3 ${!row.employee.isActive ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{row.employee.name}</p>
                      <p className="text-xs text-gray-400 truncate">{row.employee.email}</p>
                      {row.present && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          at {fmtTime(row.markedAt)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        row.present ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {row.present ? 'Present' : 'Absent'}
                      </span>
                      <button
                        onClick={() => setDrawer(row.employee)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        History
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {drawer && (
        <AttendanceHistoryDrawer
          employee={drawer}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}
