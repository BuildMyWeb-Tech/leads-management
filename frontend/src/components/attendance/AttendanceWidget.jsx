import { useState, useEffect } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function AttendanceWidget() {
  const [status,  setStatus]  = useState('loading'); // loading | absent | marking | present | error
  const [markedAt, setMarkedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const { data } = await api.get('/attendance/today');
        if (cancelled) return;
        if (data.present) {
          setStatus('present');
          setMarkedAt(data.markedAt);
        } else {
          setStatus('absent');
        }
      } catch {
        if (!cancelled) setStatus('absent');
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  const handleMarkPresent = async () => {
    if (status === 'marking' || status === 'present') return;
    setStatus('marking');
    try {
      const { data } = await api.post('/attendance/mark-present');
      setStatus('present');
      setMarkedAt(data.attendance?.markedAt);
      if (!data.alreadyMarked) toast.success('Attendance marked — Present Today!');
    } catch (err) {
      setStatus('absent');
      toast.error(err.response?.data?.message || 'Failed to mark attendance');
    }
  };

  if (status === 'loading') {
    return (
      <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-400">Checking attendance...</span>
      </div>
    );
  }

  if (status === 'present') {
    return (
      <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-green-50 rounded-xl border border-green-200">
        <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-sm font-medium text-green-700">
          Present Today
          {markedAt && (
            <span className="ml-1 font-normal text-green-500 text-xs">
              ({new Date(markedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center justify-between px-4 py-2.5 bg-blue-50 rounded-xl border border-blue-100">
      <span className="text-sm text-blue-700 font-medium">
        Mark your attendance for today
      </span>
      <button
        onClick={handleMarkPresent}
        disabled={status === 'marking'}
        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-60"
      >
        {status === 'marking' ? 'Marking...' : 'Mark Present'}
      </button>
    </div>
  );
}
