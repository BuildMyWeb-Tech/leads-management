import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { ALLOWED_STATUS_TRANSITIONS, STATUS_BADGE_CLASSES } from '../../constants/leadConstants';

/**
 * StatusEditor — portal dropdown, fully visible in every position.
 *
 * FIX vs previous version:
 *   The "close on scroll" listener used { capture: true } on window,
 *   which catches scroll events bubbling from ANY element — including
 *   the internal status-list scroll container. Clicking a status near
 *   the top/bottom edge of that scrollable list sometimes triggers a
 *   tiny native scroll (focus-into-view), which bubbled up and closed
 *   the dropdown before the click's onClick handler ran.
 *
 *   Fix: the scroll handler now checks event.target — if the scroll
 *   originated from inside dropRef (our own dropdown), it's ignored.
 *   Only scrolls of the PAGE itself (or other ancestors) close the
 *   dropdown.
 */
export default function StatusEditor({ lead, onSave, compact = false }) {
  const { user } = useAuth();

  const [open, setOpen]               = useState(false);
  const [status, setStatus]           = useState(lead.status);
  const [notes, setNotes]             = useState(lead.notes || '');
  const [followUpDate, setFollowUpDate] = useState(
    lead.followUpDate ? new Date(lead.followUpDate).toISOString().slice(0, 10) : ''
  );
  const [saving, setSaving]           = useState(false);
  const [style, setStyle]             = useState({});

  const badgeRef = useRef(null);
  const dropRef  = useRef(null);

  const allowed      = ALLOWED_STATUS_TRANSITIONS[user.role] || [];
  const showFollowUp = status === 'Follow Up' || status === 'Called';

  // Sync when lead prop changes
  useEffect(() => {
    setStatus(lead.status);
    setNotes(lead.notes || '');
    setFollowUpDate(lead.followUpDate
      ? new Date(lead.followUpDate).toISOString().slice(0, 10) : '');
  }, [lead.status, lead.notes, lead.followUpDate]);

  // ── Calculate position every time we open ──────────────────
  const calcStyle = () => {
    if (!badgeRef.current) return {};

    const r   = badgeRef.current.getBoundingClientRect();
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const W   = 272;
    const GAP = 6;

    let left = r.left;
    if (left + W > vw - 8) left = r.right - W;
    left = Math.max(8, left);

    const spaceBelow = vh - r.bottom - GAP - 8;
    const spaceAbove = r.top - GAP - 8;
    const MIN_USABLE = 260;

    const openBelow = spaceBelow >= MIN_USABLE || spaceBelow >= spaceAbove;
    const maxH      = openBelow
      ? Math.max(MIN_USABLE, Math.min(460, spaceBelow))
      : Math.max(MIN_USABLE, Math.min(460, spaceAbove));

    return {
      position: 'fixed',
      zIndex:   99999,
      width:    W,
      maxHeight: maxH,
      left,
      ...(openBelow
        ? { top:    r.bottom + GAP }
        : { bottom: vh - r.top + GAP }
      ),
    };
  };

  const openDropdown = () => {
    setStyle(calcStyle());
    setOpen(true);
  };

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        badgeRef.current && !badgeRef.current.contains(e.target) &&
        dropRef.current  && !dropRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on PAGE scroll only — ignore scrolls originating inside the dropdown
  // (e.g. scrolling the status list itself shouldn't close the panel)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropRef.current && dropRef.current.contains(e.target)) {
        return; // scroll happened inside our dropdown — ignore
      }
      setOpen(false);
    };
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(lead._id, { status, notes, followUpDate: followUpDate || null });
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

  // Status button click — stop propagation so the mousedown "outside click"
  // handler never sees this as an outside click in any edge case
  const handleStatusClick = (e, s) => {
    e.preventDefault();
    e.stopPropagation();
    setStatus(s);
  };

  const badgeCls = STATUS_BADGE_CLASSES[status] || 'bg-gray-100 text-gray-500 ring-gray-200';

  const dropdown = open && createPortal(
    <div
      ref={dropRef}
      style={style}
      className="bg-white rounded-xl border border-gray-200 shadow-2xl
                 flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >

      {/* ── 1. Status list — scrolls within its own area ── */}
      <div className="flex flex-col flex-1 min-h-0 border-b border-gray-100">
        <p className="px-3 pt-3 pb-1.5 text-xs font-semibold text-gray-400
                      uppercase tracking-wide flex-shrink-0">
          Update status
        </p>
        <div className="overflow-y-auto flex-1 px-2 pb-2">
          {allowed.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => handleStatusClick(e, s)}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium
                transition-colors mb-0.5
                ${status === s
                  ? `ring-1 ring-inset ${STATUS_BADGE_CLASSES[s]}`
                  : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {status === s ? (
                <span className="inline-block w-3.5 mr-1 text-center">✓</span>
              ) : (
                <span className="inline-block w-3.5 mr-1" />
              )}
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Follow-up date (only when relevant) ─────── */}
      {showFollowUp && (
        <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Follow-up date
          </label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs
              text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={followUpDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </div>
      )}

      {/* ── 3. Notes + actions — always at bottom ──────── */}
      <div className="p-3 flex-shrink-0">
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
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 text-white text-xs font-semibold
              py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 bg-gray-100 text-gray-600 text-xs font-medium
              py-2 rounded-lg hover:bg-gray-200 transition-colors"
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
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open ? setOpen(false) : openDropdown();
        }}
        className={`inline-flex items-center gap-1 rounded-full font-medium
          ring-1 ring-inset transition-opacity hover:opacity-80
          cursor-pointer select-none
          ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs'}
          ${badgeCls}`}
        title="Click to update status"
      >
        {status}
        <svg
          className={`w-3 h-3 opacity-60 transition-transform duration-150
            ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {dropdown}
    </>
  );
}