import { useState } from 'react';
import { STATUS_BADGE_CLASSES, ALLOWED_STATUS_TRANSITIONS } from '../../constants/leadConstants';
import { useAuth } from '../../context/AuthContext';
import PriorityBadge from '../leads/PriorityBadge';
import { getWhatsAppUrl } from '../../utils/phoneUtils';

export default function LeadCard({ lead, onSave }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [status,   setStatus]   = useState(lead.status);
  const [notes,    setNotes]    = useState(lead.notes || '');
  const [followUp, setFollowUp] = useState(
    lead.followUpDate ? new Date(lead.followUpDate).toISOString().slice(0, 10) : ''
  );
  const [saving, setSaving] = useState(false);

  const allowed  = ALLOWED_STATUS_TRANSITIONS[user.role] || [];
  const badgeCls = STATUS_BADGE_CLASSES[lead.status] || 'bg-gray-100 text-gray-500 ring-gray-200';

  const fuDate    = lead.followUpDate ? new Date(lead.followUpDate) : null;
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
    setFollowUp(lead.followUpDate
      ? new Date(lead.followUpDate).toISOString().slice(0, 10) : '');
    setExpanded(false);
  };

  return (
    <div className={`bg-white rounded-xl border transition-shadow
      ${expanded ? 'border-blue-200 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}>

      {/* Card header */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer touch-manipulation"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600
                        flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {lead.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-gray-900 truncate">{lead.name}</p>
            <div className="flex items-center gap-1 flex-shrink-0">
              <PriorityBadge priority={lead.priority} size="sm" />
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs
                font-medium ring-1 ring-inset ${badgeCls}`}>
                {lead.status}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <a
              href={`tel:${lead.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {lead.phone}
            </a>
            {getWhatsAppUrl(lead.phone) && (
              <a
                href={getWhatsAppUrl(lead.phone)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-green-500 hover:text-green-700 flex-shrink-0"
                title="Open WhatsApp"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
            )}
            <span className="text-xs text-gray-400">{lead.source}</span>
          </div>
          {fuDate && (
            <div className="mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3 text-orange-400" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className={`text-xs font-medium
                ${fuOverdue ? 'text-red-500' : fuToday ? 'text-orange-500' : 'text-gray-500'}`}>
                {fuOverdue ? 'Overdue: ' : fuToday ? 'Today: ' : 'Follow up: '}
                {fuDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </span>
            </div>
          )}
          {lead.notes && !expanded && (
            <p className="text-xs text-gray-400 mt-1 truncate italic">"{lead.notes}"</p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform
            ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded edit panel */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
          {(lead.budget || lead.propertyInterest) && (
            <div className="flex gap-3 text-xs flex-wrap">
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

          {lead.assignedDirector && (
            <p className="text-xs text-gray-500">
              Director: <span className="font-medium text-gray-700">
                {lead.assignedDirector.name}
              </span>
            </p>
          )}

          {/* Status selector */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide
                              mb-1.5 block">
              Update status
            </label>
            <div className="flex flex-wrap gap-1.5">
              {allowed.map((s) => {
                const cls        = STATUS_BADGE_CLASSES[s] || 'bg-gray-100 text-gray-500 ring-gray-200';
                const isSelected = status === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-2.5 py-1.5 rounded-full text-xs font-medium border
                      transition-all touch-manipulation min-h-[34px]
                      ${isSelected
                        ? `ring-2 ring-offset-1 ${cls} ring-blue-400 scale-105`
                        : `${cls} ring-1 ring-inset opacity-60 hover:opacity-100`}`}
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
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide
                              mb-1 block">
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
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide
                              mb-1 block">
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
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 13l4 4L19 7" />
                  </svg>
                  Save update
                </>
              )}
            </button>
            <button onClick={handleCancel} className="btn-ghost px-4">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}