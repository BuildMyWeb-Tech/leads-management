import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { ALLOWED_STATUS_TRANSITIONS, STATUS_BADGE_CLASSES } from '../../constants/leadConstants';

/**
 * StatusEditor — portal dropdown, fully visible in every position.
 *
 * Architecture:
 *   createPortal → renders into document.body (escapes overflow:hidden tables)
 *   position:fixed + getBoundingClientRect → viewport-relative coordinates
 *
 * Layout (always shows all 3 sections):
 *   ┌─────────────────────────────┐
 *   │  Status list (scrolls)      │ ← flex-1, own overflow-y:auto
 *   ├─────────────────────────────┤
 *   │  Follow-up date (optional)  │ ← flex-shrink-0, never hidden
 *   ├─────────────────────────────┤
 *   │  Notes + Save/Cancel        │ ← flex-shrink-0, always visible
 *   └─────────────────────────────┘
 *
 * Smart flip:
 *   Opens below badge by default.
 *   If not enough space below → opens above badge.
 *   Total height is capped so it never escapes the viewport.
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
    const W   = 272;   // dropdown width
    const GAP = 6;     // gap between badge and dropdown

    // ── Horizontal ─────────────────────────────────────────
    let left = r.left;
    // Overflow right side → right-align with badge
    if (left + W > vw - 8) left = r.right - W;
    left = Math.max(8, left);

    // ── Vertical ───────────────────────────────────────────
    const spaceBelow = vh - r.bottom - GAP - 8;  // available px below badge
    const spaceAbove = r.top - GAP - 8;           // available px above badge

    // Minimum usable height for the panel
    // Status list needs at least 5 items visible (~140px), plus notes+save (~120px)
    const MIN_USABLE = 260;

    // Open below if there's enough room, otherwise open above
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
        : { bottom: vh - r.top + GAP }   // anchor to top of badge
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

  // Close on scroll (badge position may change)
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

  const badgeCls = STATUS_BADGE_CLASSES[status] || 'bg-gray-100 text-gray-500 ring-gray-200';

  // ── Dropdown panel ─────────────────────────────────────────
  // Key layout rule: outer div is a flex column.
  // The status list (flex-1 + overflow-y:auto) fills available space.
  // Follow-up + Notes/Save are flex-shrink-0 → always fully visible.
  const dropdown = open && createPortal(
    <div
      ref={dropRef}
      style={style}
      className="bg-white rounded-xl border border-gray-200 shadow-2xl
                 flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >

      {/* ── 1. Status list — scrolls within its own area ── */}
      <div className="flex flex-col flex-1 min-h-0 border-b border-gray-100">
        <p className="px-3 pt-3 pb-1.5 text-xs font-semibold text-gray-400
                      uppercase tracking-wide flex-shrink-0">
          Update status
        </p>
        {/* This div takes all remaining space and scrolls if needed */}
        <div className="overflow-y-auto flex-1 px-2 pb-2">
          {allowed.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium
                transition-colors mb-0.5
                ${status === s
                  ? `ring-1 ring-inset ${STATUS_BADGE_CLASSES[s]}`
                  : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {status === s && (
                <span className="inline-block w-3.5 mr-1 text-center">✓</span>
              )}
              {status !== s && (
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
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 text-white text-xs font-semibold
              py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
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
      {/* Badge trigger button */}
      <button
        ref={badgeRef}
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