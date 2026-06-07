import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ALLOWED_STATUS_TRANSITIONS, STATUS_BADGE_CLASSES } from '../../constants/leadConstants';
import StatusBadge from '../common/StatusBadge';

/**
 * StatusEditor — click a badge → dropdown of allowed statuses.
 * Role-aware: telecaller sees restricted list only.
 * Calls onSave(newStatus) and onNotesChange(notes) as needed.
 */
export default function StatusEditor({ lead, onSave, compact = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes || '');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  const allowed = ALLOWED_STATUS_TRANSITIONS[user.role] || [];

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset local state when lead prop changes
  useEffect(() => {
    setStatus(lead.status);
    setNotes(lead.notes || '');
  }, [lead.status, lead.notes]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(lead._id, { status, notes });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const badgeCls = STATUS_BADGE_CLASSES[status] || 'bg-gray-100 text-gray-500 ring-gray-200';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset transition-opacity hover:opacity-80
          ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs'} ${badgeCls}`}
        title="Click to update status"
      >
        {status}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-8 w-64 bg-white rounded-lg border border-gray-200 shadow-lg">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Update status</p>
            <div className="grid grid-cols-1 gap-1 max-h-52 overflow-y-auto pr-0.5">
              {allowed.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
                    ${status === s
                      ? `ring-1 ring-inset ${STATUS_BADGE_CLASSES[s]}`
                      : 'text-gray-600 hover:bg-gray-50'
                    }`}
                >
                  {status === s && <span className="mr-1">✓</span>}
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note..."
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white text-xs font-medium py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setOpen(false); setStatus(lead.status); setNotes(lead.notes || ''); }}
                className="px-3 bg-gray-100 text-gray-600 text-xs font-medium py-1.5 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
