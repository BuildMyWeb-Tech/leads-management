import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { ALLOWED_STATUS_TRANSITIONS, STATUS_BADGE_CLASSES } from '../../constants/leadConstants';

/**
 * StatusEditor — portal-based dropdown that escapes ALL overflow containers.
 *
 * Why portals:
 *   The table wrapper uses overflow:hidden + overflow-x:auto.
 *   A regular position:absolute dropdown is clipped by both.
 *   createPortal renders the dropdown directly into <body>, completely
 *   outside the table DOM tree, so nothing can clip it.
 *
 * Why position:fixed:
 *   After portaling to <body>, we use getBoundingClientRect() on the badge
 *   button to get its exact viewport position, then place the dropdown
 *   with position:fixed at those coordinates.
 *
 * Smart vertical flip:
 *   If the dropdown would go below the viewport, it opens ABOVE the badge.
 *   max-height clamps it so it never overflows in either direction.
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
  const [pos, setPos]                 = useState({ top: 0, left: 0, openUp: false, maxH: 400 });

  const badgeRef = useRef(null);
  const dropRef  = useRef(null);

  const allowed      = ALLOWED_STATUS_TRANSITIONS[user.role] || [];
  const showFollowUp = status === 'Follow Up' || status === 'Called';

  // Sync when lead changes externally
  useEffect(() => {
    setStatus(lead.status);
    setNotes(lead.notes || '');
    setFollowUpDate(lead.followUpDate
      ? new Date(lead.followUpDate).toISOString().slice(0, 10) : '');
  }, [lead.status, lead.notes, lead.followUpDate]);

  // Calculate fixed position, deciding open-up vs open-down
  const calcPos = () => {
    if (!badgeRef.current) return;
    const r          = badgeRef.current.getBoundingClientRect();
    const dropW      = 270;
    const dropH      = 380; // approximate height
    const vw         = window.innerWidth;
    const vh         = window.innerHeight;
    const gap        = 4;   // px gap between badge and dropdown

    // Horizontal: left-align with badge, clamp to viewport
    let left = r.left;
    if (left + dropW > vw - 8) left = r.right - dropW;
    left = Math.max(8, left);

    // Vertical: open down if enough room, otherwise open up
    const spaceBelow = vh - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const openUp     = spaceBelow < dropH && spaceAbove > spaceBelow;

    let top, maxH;
    if (openUp) {
      maxH = Math.min(dropH, spaceAbove - 8);
      top  = r.top - maxH - gap;
    } else {
      maxH = Math.min(dropH, spaceBelow - 8);
      top  = r.bottom + gap;
    }

    setPos({ top, left, openUp, maxH });
  };

  const openDropdown = () => {
    calcPos();
    setOpen(true);
  };

  // Close on outside click
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

  // Close + recalc on scroll (badge may have moved)
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

  // ── Dropdown rendered via portal ──────────────────────────
  const dropdown = open && createPortal(
    <div
      ref={dropRef}
      style={{
        position:  'fixed',
        top:       pos.top,
        left:      pos.left,
        zIndex:    99999,
        width:     270,
        maxHeight: pos.maxH,
        overflowY: 'auto',
      }}
      className="bg-white rounded-xl border border-gray-200 shadow-2xl flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Status list ────────────────────────────────── */}
      <div className="p-3 border-b border-gray-100 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Update status
        </p>
        {/* Fixed-height scrollable list so it never pushes notes/save out of view */}
        <div className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5">
          {allowed.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium
                transition-colors
                ${status === s
                  ? `ring-1 ring-inset ${STATUS_BADGE_CLASSES[s]}`
                  : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {status === s && <span className="mr-1 text-current">✓</span>}
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Follow-up date ─────────────────────────────── */}
      {showFollowUp && (
        <div className="px-3 pt-2.5 pb-0 border-b border-gray-100 flex-shrink-0">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Follow-up date
          </label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs
              text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2.5"
            value={followUpDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </div>
      )}

      {/* ── Notes + Save/Cancel ────────────────────────── */}
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
            className="flex-1 bg-blue-600 text-white text-xs font-semibold py-1.5
              rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
        onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openDropdown(); }}
        className={`inline-flex items-center gap-1 rounded-full font-medium ring-1
          ring-inset transition-opacity hover:opacity-80 cursor-pointer select-none
          ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs'} ${badgeCls}`}
        title="Click to update status"
      >
        {status}
        <svg
          className={`w-3 h-3 opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {dropdown}
    </>
  );
}