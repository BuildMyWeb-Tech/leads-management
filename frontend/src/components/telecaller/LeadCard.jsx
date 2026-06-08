import { useState } from 'react';
import { STATUS_BADGE_CLASSES, ALLOWED_STATUS_TRANSITIONS } from '../../constants/leadConstants';
import { useAuth } from '../../context/AuthContext';

/**
 * LeadCard — mobile-first card for telecaller's lead list.
 * Tap to expand → inline status + notes + follow-up date editor.
 */
export default function LeadCard({ lead, onSave }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [status,   setStatus]   = useState(lead.status);
  const [notes,    setNotes]    = useState(lead.notes || '');
  const [followUp, setFollowUp] = useState(
    lead.followUpDate ? new Date(lead.followUpDate).toISOString().slice(0, 10) : ''
  );
  const [saving, setSaving] = useState(false);

  const allowed = ALLOWED_STATUS_TRANSITIONS[user.role] || [];
  const badgeCls = STATUS_BADGE_CLASSES[lead.status] || 'bg-gray-100 text-gray-500 ring-gray-200';

  // Days since last update
  const daysSince = Math.floor((Date.now() - new Date(lead.updatedAt)) / (1000 * 60 * 60 * 24));

  // Follow-up urgency
  const fuDate = lead.followUpDate ? new Date(lead.followUpDate) : null;
  const fuToday   = fuDate && fuDate.toDateString() === new Date().toDateString();
  const fuOverdue = fuDate && fuDate < new Date() && !fuToday;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(lead._id, { status, notes, followUpDate: followUp || null });
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setStatus(lead.status);
    setNotes(lead.notes || '');
    setFollowUp(lead.followUpDate ? new Date(lead.followUpDate).toISOString().slice(0, 10) : '');
    setExpanded(false);
  };

  return (
    <div className={`bg-white rounded-xl border transition-shadow ${expanded ? 'border-blue-200 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}>

      {/* ── Card header (always visible) ────── */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {lead.name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-gray-900 truncate">{lead.name}</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset flex-shrink-0 ${badgeCls}`}>
              {lead.status}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <a
              href={`tel:${lead.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {lead.phone}
            </a>
            <span className="text-xs text-gray-400">{lead.source}</span>
          </div>

          {/* Follow-up badge */}
          {fuDate && (
            <div className="mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className={`text-xs font-medium ${fuOverdue ? 'text-red-500' : fuToday ? 'text-orange-500' : 'text-gray-500'}`}>
                {fuOverdue ? 'Overdue: ' : fuToday ? 'Today: ' : 'Follow up: '}
                {fuDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </span>
            </div>
          )}

          {/* Notes preview */}
          {lead.notes && !expanded && (
            <p className="text-xs text-gray-400 mt-1 truncate italic">"{lead.notes}"</p>
          )}
        </div>

        {/* Expand arrow */}
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* ── Expanded: edit panel ─────────────── */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">

          {/* Budget + Property */}
          {(lead.budget || lead.propertyInterest) && (
            <div className="flex gap-3 text-xs">
              {lead.budget && (
                <span className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 text-gray-600">
                  💰 {lead.budget}
                </span>
              )}
              {lead.propertyInterest && (
                <span className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1 text-gray-600">
                  🏠 {lead.propertyInterest}
                </span>
              )}
            </div>
          )}

          {/* Director info */}
          {lead.assignedDirector && (
            <p className="text-xs text-gray-500">
              Director: <span className="font-medium text-gray-700">{lead.assignedDirector.name}</span>
            </p>
          )}

          {/* Status selector */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Update status
            </label>
            <div className="flex flex-wrap gap-1.5">
              {allowed.map((s) => {
                const cls = STATUS_BADGE_CLASSES[s] || 'bg-gray-100 text-gray-500 ring-gray-200';
                const isSelected = status === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      isSelected
                        ? `ring-2 ring-offset-1 ${cls} ring-blue-400 scale-105`
                        : `${cls} ring-1 ring-inset opacity-60 hover:opacity-100`
                    }`}
                  >
                    {isSelected && <span className="mr-0.5">✓</span>}
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Follow-up date */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
              Follow-up date
            </label>
            <input
              type="date"
              className="input text-sm"
              value={followUp}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
              Notes
            </label>
            <textarea
              className="input text-sm"
              rows={2}
              placeholder="Add call notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save update
                </>
              )}
            </button>
            <button onClick={handleCancel} className="btn-ghost px-4">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
