import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ALLOWED_STATUS_TRANSITIONS, STATUS_BADGE_CLASSES } from '../../constants/leadConstants';

export default function StatusEditor({ lead, onSave, compact = false }) {
  const { user }  = useAuth();
  const [open, setOpen]           = useState(false);
  const [status, setStatus]       = useState(lead.status);
  const [notes, setNotes]         = useState(lead.notes || '');
  const [followUpDate, setFollowUpDate] = useState(
    lead.followUpDate ? new Date(lead.followUpDate).toISOString().slice(0, 10) : ''
  );
  const [saving, setSaving]       = useState(false);
  const [dropUp, setDropUp]       = useState(false);
  const ref    = useRef(null);
  const btnRef = useRef(null);

  const allowed     = ALLOWED_STATUS_TRANSITIONS[user.role] || [];
  const showFollowUp = status === 'Follow Up' || status === 'Called';

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  // Decide whether to drop up or down based on viewport position
  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 320);
    }
  }, [open]);

  useEffect(() => {
    setStatus(lead.status);
    setNotes(lead.notes || '');
    setFollowUpDate(
      lead.followUpDate ? new Date(lead.followUpDate).toISOString().slice(0, 10) : ''
    );
  }, [lead.status, lead.notes, lead.followUpDate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(lead._id, { status, notes, followUpDate: followUpDate || null });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const badgeCls = STATUS_BADGE_CLASSES[status] || 'bg-gray-100 text-gray-500 ring-gray-200';

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset
          transition-opacity hover:opacity-80 touch-manipulation
          ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs'} ${badgeCls}`}
        title="Click to update status"
      >
        {status}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute z-50 left-0 bg-white rounded-lg border border-gray-200 shadow-xl
            w-72 sm:w-72
            ${dropUp ? 'bottom-full mb-1' : 'top-8'}`}
        >
          {/* Status list */}
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Update status
            </p>
            <div className="grid grid-cols-1 gap-0.5 max-h-44 overflow-y-auto scrollbar-thin">
              {allowed.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`text-left px-2.5 py-2 rounded-md text-xs font-medium transition-colors
                    touch-manipulation min-h-[36px]
                    ${status === s
                      ? `ring-1 ring-inset ${STATUS_BADGE_CLASSES[s]}`
                      : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {status === s && <span className="mr-1.5">✓</span>}
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Follow-up date */}
          {showFollowUp && (
            <div className="px-3 pt-3 border-b border-gray-100">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Follow-up date
              </label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-md px-2.5 py-2 text-xs text-gray-700
                  focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 min-h-[40px]"
                value={followUpDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
            </div>
          )}

          {/* Notes */}
          <div className="p-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-700
                focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note..."
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white text-xs font-medium py-2 rounded-md
                  hover:bg-blue-700 disabled:opacity-50 transition-colors min-h-[36px] touch-manipulation"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setStatus(lead.status);
                  setNotes(lead.notes || '');
                  setFollowUpDate(
                    lead.followUpDate
                      ? new Date(lead.followUpDate).toISOString().slice(0, 10)
                      : ''
                  );
                }}
                className="px-3 bg-gray-100 text-gray-600 text-xs font-medium py-2 rounded-md
                  hover:bg-gray-200 transition-colors touch-manipulation"
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