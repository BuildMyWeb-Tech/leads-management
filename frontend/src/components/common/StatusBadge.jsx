import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { ALLOWED_STATUS_TRANSITIONS, STATUS_BADGE_CLASSES } from '../../constants/leadConstants';

/**
 * StatusEditor — click badge → dropdown with status list, notes, follow-up date.
 *
 * FIX: Uses position:fixed dropdown rendered via ReactDOM.createPortal().
 * This escapes overflow:hidden on table parents so the dropdown
 * never gets clipped — works correctly in All Leads table,
 * Director Dashboard table, and anywhere else.
 *
 * Role-aware: telecaller sees restricted list.
 */
export default function StatusEditor({ lead, onSave, compact = false }) {
  const { user }   = useAuth();
  const [open, setOpen]           = useState(false);
  const [status, setStatus]       = useState(lead.status);
  const [notes, setNotes]         = useState(lead.notes || '');
  const [followUpDate, setFollowUpDate] = useState(
    lead.followUpDate ? new Date(lead.followUpDate).toISOString().slice(0, 10) : ''
  );
  const [saving, setSaving]       = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const badgeRef   = useRef(null);
  const dropRef    = useRef(null);

  const allowed      = ALLOWED_STATUS_TRANSITIONS[user.role] || [];
  const showFollowUp = status === 'Follow Up' || status === 'Called';

  // Sync when lead prop changes
  useEffect(() => {
    setStatus(lead.status);
    setNotes(lead.notes || '');
    setFollowUpDate(lead.followUpDate
      ? new Date(lead.followUpDate).toISOString().slice(0, 10) : '');
  }, [lead.status, lead.notes, lead.followUpDate]);

  // Position the fixed dropdown below the badge
  const openDropdown = useCallback(() => {
    if (!badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    const dropW = 264; // min-width of dropdown

    // Default: align left edge of dropdown with left edge of badge
    let left = rect.left;
    // If it would overflow the right edge of the viewport, flip left
    if (left + dropW > window.innerWidth - 8) {
      left = rect.right - dropW;
    }
    // Clamp to viewport
    left = Math.max(8, left);

    setDropdownPos({ top: rect.bottom + 4, left });
    setOpen(true);
  }, []);

  // Close on click outside (both badge and dropdown)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        badgeRef.current && !badgeRef.current.contains(e.target) &&
        dropRef.current  && !dropRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on scroll (keeps dropdown from floating away from badge)
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleToggle = () => {
    if (open) setOpen(false);
    else openDropdown();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(lead._id, {
        status,
        notes,
        followUpDate: followUpDate || null,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    setStatus(lead.status);
    setNotes(lead.notes || '');
    setFollowUpDate(lead.followUpDate
      ? new Date(lead.followUpDate).toISOString().slice(0, 10) : '');
  };

  const badgeCls = STATUS_BADGE_CLASSES[status] || 'bg-gray-100 text-gray-500 ring-gray-200';

  // The dropdown panel — rendered via portal to escape overflow:hidden parents
  const dropdown = open && createPortal(
    <div
      ref={dropRef}
      className="bg-white rounded-xl border border-gray-200 shadow-2xl"
      style={{
        position:  'fixed',
        top:       dropdownPos.top,
        left:      dropdownPos.left,
        zIndex:    9999,
        minWidth:  '264px',
        maxWidth:  '300px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Status list */}
      <div className="p-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Update status
        </p>
        <div className="grid grid-cols-1 gap-0.5 max-h-48 overflow-y-auto pr-0.5">
          {allowed.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`text-left px-2.5 py-2 rounded-lg text-xs font-medium transition-colors
                ${status === s
                  ? `ring-1 ring-inset ${STATUS_BADGE_CLASSES[s]}`
                  : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {status === s && <span className="mr-1.5 text-green-600">✓</span>}
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Follow-up date */}
      {showFollowUp && (
        <div className="px-3 pt-3 pb-0 border-b border-gray-100">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Follow-up date
          </label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs
              text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            value={followUpDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </div>
      )}

      {/* Notes + actions */}
      <div className="p-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
        <textarea
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs
            text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a note..."
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 text-white text-xs font-medium py-1.5 rounded-lg
              hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            className="px-3 bg-gray-100 text-gray-600 text-xs font-medium py-1.5
              rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <button
        ref={badgeRef}
        onClick={handleToggle}
        className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset
          transition-opacity hover:opacity-80 cursor-pointer
          ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs'} ${badgeCls}`}
        title="Click to update status"
      >
        {status}
        <svg className={`w-3 h-3 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {dropdown}
    </>
  );
}