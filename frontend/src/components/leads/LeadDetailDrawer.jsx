import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import StatusEditor from './StatusEditor';
import PipelineStrip from './PipelineStrip';

/**
 * Slide-in drawer for viewing full lead details + quick status update.
 * Opened from the leads table by clicking a lead row.
 */
export default function LeadDetailDrawer({ lead, onClose, onStatusSave }) {
  const { user } = useAuth();

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!lead) return null;

  const Row = ({ label, value }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-800">{value || <span className="text-gray-300">—</span>}</span>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{lead.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{lead.phone}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Status update */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current status</p>
            <StatusEditor lead={lead} onSave={onStatusSave} />
          </div>

          {/* Lead details grid */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Lead details</p>
            <div className="grid grid-cols-2 gap-4">
              <Row label="Source" value={lead.source} />
              <Row label="Budget" value={lead.budget} />
              <Row label="Property interest" value={lead.propertyInterest} />
              <Row label="Email" value={lead.email} />
              <Row label="Created" value={new Date(lead.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
              <Row label="Updated" value={new Date(lead.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
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
                ) : (
                  <span className="text-sm text-orange-400 font-medium">Unassigned</span>
                )}
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
                ) : (
                  <span className="text-sm text-orange-400 font-medium">Unassigned</span>
                )}
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
