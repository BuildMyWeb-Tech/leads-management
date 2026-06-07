import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import StatusEditor from './StatusEditor';
import PipelineStrip from './PipelineStrip';
import { STATUS_BADGE_CLASSES } from '../../constants/leadConstants';

export default function LeadDetailDrawer({ lead, onClose, onStatusSave }) {
  const { user } = useAuth();

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!lead) return null;

  const Row = ({ label, value, highlight }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-sm ${highlight ? 'text-orange-500 font-medium' : 'text-gray-800'}`}>
        {value || <span className="text-gray-300">—</span>}
      </span>
    </div>
  );

  const followUpFormatted = lead.followUpDate
    ? new Date(lead.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  const isOverdue = lead.followUpDate && new Date(lead.followUpDate) < new Date();

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{lead.name}</h3>
            <a href={`tel:${lead.phone}`} className="text-xs text-blue-500 hover:underline mt-0.5 block">
              {lead.phone}
            </a>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100
              text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Pipeline strip */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-medium text-gray-400 mb-2">Pipeline progress</p>
          <PipelineStrip currentStatus={lead.status} />
        </div>

        {/* Follow-up date banner */}
        {followUpFormatted && (
          <div className={`px-5 py-2.5 border-b flex items-center gap-2
            ${isOverdue ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}>
            <svg className={`w-4 h-4 flex-shrink-0 ${isOverdue ? 'text-red-500' : 'text-orange-400'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
              {isOverdue ? 'Overdue follow-up: ' : 'Follow-up scheduled: '}
              <span className="font-bold">{followUpFormatted}</span>
            </span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Status update */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current status</p>
            <StatusEditor lead={lead} onSave={onStatusSave} />
          </div>

          {/* Lead details */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Lead details</p>
            <div className="grid grid-cols-2 gap-4">
              <Row label="Source"            value={lead.source} />
              <Row label="Budget"            value={lead.budget} />
              <Row label="Property interest" value={lead.propertyInterest} />
              <Row label="Email"             value={lead.email} />
              <Row label="Created"           value={new Date(lead.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })} />
              <Row label="Last updated"      value={new Date(lead.updatedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })} />
              {followUpFormatted && (
                <Row label="Follow-up date" value={followUpFormatted} highlight={isOverdue} />
              )}
            </div>
          </div>

          {/* Assignment */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Assignment</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Director</span>
                {lead.assignedDirector ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                      {lead.assignedDirector.name.charAt(0)}
                    </div>
                    <span className="text-sm text-gray-800">{lead.assignedDirector.name}</span>
                  </div>
                ) : <span className="text-sm text-orange-400 font-medium">Unassigned</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Telecaller</span>
                {lead.assignedTelecaller ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-xs font-semibold text-green-700">
                      {lead.assignedTelecaller.name.charAt(0)}
                    </div>
                    <span className="text-sm text-gray-800">{lead.assignedTelecaller.name}</span>
                  </div>
                ) : <span className="text-sm text-orange-400 font-medium">Unassigned</span>}
              </div>
            </div>
          </div>

          {/* Notes */}
          {lead.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</p>
              <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2.5 text-sm text-gray-700 whitespace-pre-line">
                {lead.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
