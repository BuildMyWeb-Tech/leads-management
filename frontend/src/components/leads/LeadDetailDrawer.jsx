import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import StatusEditor from './StatusEditor';
import PipelineStrip from './PipelineStrip';
import PriorityBadge from './PriorityBadge';
import FollowUpBadge from './FollowUpBadge';
import CallHistoryList from './CallHistoryList';
import SiteVisitHistory from './SiteVisitHistory';
import { LeadFieldSection, FieldRow } from './LeadFieldSection';
import {
  PROPERTY_TYPES, PLOT_SQFT_OPTIONS, PURPOSE_OPTIONS,
} from '../../constants/leadConstants';
import toast from 'react-hot-toast';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

/**
 * LeadDetailDrawer — full lead profile view/edit.
 *
 * PERMISSION NOTE (Phase D, matching actual backend behavior — see
 * backend/controllers/leadsController.js updateLead): only the admin
 * role can currently edit propertyType/plotSquareFeet/targetLocation/
 * purpose/budget/propertyInterest/email through the update API —
 * director/tl/telecaller branches only accept status/notes/remarks/
 * followUpDate/assignedTelecaller/siteVisit. The "Edit profile" form
 * below is therefore admin-only, matching that reality rather than
 * offering controls that would silently fail for other roles. This
 * is flagged in the Phase D report as a discovered gap, not silently
 * worked around.
 */
export default function LeadDetailDrawer({ lead, onClose, onStatusSave }) {
  const { user } = useAuth();
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [remarks, setRemarks] = useState(lead.remarks || '');
  const [savingRemarks, setSavingRemarks] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    setRemarks(lead.remarks || '');
    setEditingProfile(false);
  }, [lead._id]);

  if (!lead) return null;

  const canEditProfile = user.role === 'admin';
  // status/notes/remarks/followUpDate/siteVisit are all accepted for
  // admin/director/tl/telecaller by the backend (see updateLead) —
  // safe for any authenticated role that can reach this drawer.
  const canEditOperational = true;

  const startEditProfile = () => {
    setProfileForm({
      propertyType:   lead.propertyType   || '',
      plotSquareFeet: lead.plotSquareFeet || '',
      targetLocation: lead.targetLocation || '',
      purpose:        lead.purpose        || '',
      budget:         lead.budget         || '',
      propertyInterest: lead.propertyInterest || '',
      email:          lead.email          || '',
    });
    setEditingProfile(true);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const payload = { ...profileForm };
      // Frontend-side cleanup mirrors backend's own rule (clearPlotSquareFeetIfNotPlot)
      // — defense in depth only, backend remains authoritative.
      if (payload.propertyType !== 'Plot') payload.plotSquareFeet = '';
      await onStatusSave(lead._id, payload);
      setEditingProfile(false);
    } catch {
      // onStatusSave's own toast already surfaces errors
    } finally {
      setSavingProfile(false);
    }
  };

  const saveRemarks = async () => {
    setSavingRemarks(true);
    try {
      await onStatusSave(lead._id, { remarks });
      toast.success('Remarks saved');
    } finally {
      setSavingRemarks(false);
    }
  };

  const isOverdue = lead.status === 'Follow Up' && lead.followUpDate && new Date(lead.followUpDate) < new Date();

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[1px]" onClick={onClose} />

      <div className="fixed z-50 flex flex-col bg-white shadow-xl overflow-hidden
                      inset-x-0 bottom-0 rounded-t-2xl max-h-[92dvh]
                      sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto
                      sm:rounded-none sm:w-full sm:max-w-md sm:max-h-full">

        <div className="sheet-handle" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 truncate">{lead.name}</h3>
              {lead.leadId && (
                <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded flex-shrink-0">
                  {lead.leadId}
                </span>
              )}
            </div>
            <a href={`tel:${lead.phone}`} className="text-xs text-blue-500 hover:underline mt-0.5 block">
              {lead.phone}
            </a>
          </div>
          <button
            onClick={onClose}
            aria-label="Close lead details"
            className="w-9 h-9 flex items-center justify-center rounded-full
                       hover:bg-gray-100 text-gray-400 hover:text-gray-700
                       transition-colors flex-shrink-0 ml-2 touch-manipulation"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Priority + pipeline strip */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={lead.priority} />
            {lead.captureDate && (
              <span className="text-xs text-gray-400">Captured {fmtDate(lead.captureDate)}</span>
            )}
          </div>
          <PipelineStrip currentStatus={lead.status} />
        </div>

        {/* Follow-up banner — prominent, computed live from followUpDate */}
        {lead.followUpDate && (
          <div className={`px-5 py-2.5 border-b flex items-center gap-2 flex-shrink-0
            ${isOverdue ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}>
            <FollowUpBadge followUpDate={lead.followUpDate} status={lead.status} />
          </div>
        )}

        {/* Body — scrollable, sectioned per Phase D spec */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 scrollbar-thin">

          {/* 4. Priority & Status */}
          <LeadFieldSection title="Priority & Status">
            <StatusEditor lead={lead} onSave={onStatusSave} />
          </LeadFieldSection>

          {/* 1. Lead Information */}
          <LeadFieldSection title="Lead Information">
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="Client Name" value={lead.name} />
              <FieldRow label="Mobile Number" value={lead.phone} />
              <FieldRow label="Email" value={lead.email} />
              <FieldRow label="Source" value={lead.source} />
              <FieldRow label="Lead ID" value={lead.leadId} />
              <FieldRow label="Capture Date" value={fmtDate(lead.captureDate)} />
            </div>
          </LeadFieldSection>

          {/* 2. Property Requirement */}
          <LeadFieldSection
            title="Property Requirement"
            action={canEditProfile && !editingProfile && (
              <button onClick={startEditProfile} className="text-xs text-blue-600 hover:underline">Edit</button>
            )}
          >
            {editingProfile ? (
              <form onSubmit={saveProfile} className="space-y-3 bg-gray-50 rounded-lg p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Property Type</label>
                    <select className="input-sm" value={profileForm.propertyType}
                      onChange={(e) => setProfileForm({ ...profileForm, propertyType: e.target.value })}>
                      <option value="">— Select —</option>
                      {PROPERTY_TYPES.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  {profileForm.propertyType === 'Plot' && (
                    <div>
                      <label className="label text-xs">Plot Sq. Ft.</label>
                      <select className="input-sm" value={profileForm.plotSquareFeet}
                        onChange={(e) => setProfileForm({ ...profileForm, plotSquareFeet: e.target.value })}>
                        <option value="">— Select —</option>
                        {PLOT_SQFT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="label text-xs">Target Location</label>
                    <input className="input-sm" value={profileForm.targetLocation}
                      onChange={(e) => setProfileForm({ ...profileForm, targetLocation: e.target.value })} />
                  </div>
                  <div>
                    <label className="label text-xs">Budget</label>
                    <input className="input-sm" value={profileForm.budget}
                      onChange={(e) => setProfileForm({ ...profileForm, budget: e.target.value })} />
                  </div>
                  <div>
                    <label className="label text-xs">Purpose</label>
                    <select className="input-sm" value={profileForm.purpose}
                      onChange={(e) => setProfileForm({ ...profileForm, purpose: e.target.value })}>
                      <option value="">— Select —</option>
                      {PURPOSE_OPTIONS.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Email</label>
                    <input className="input-sm" type="email" value={profileForm.email}
                      onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <label className="label text-xs">Property Interest (legacy/details)</label>
                    <input className="input-sm" value={profileForm.propertyInterest}
                      onChange={(e) => setProfileForm({ ...profileForm, propertyInterest: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingProfile}
                    className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {savingProfile ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditingProfile(false)}
                    className="px-3 bg-gray-100 text-gray-600 text-xs font-medium py-2 rounded-lg hover:bg-gray-200 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Property Type" value={lead.propertyType} />
                {lead.propertyType === 'Plot' && (
                  <FieldRow label="Plot Sq. Ft." value={lead.plotSquareFeet} />
                )}
                <FieldRow label="Target Location" value={lead.targetLocation} />
                <FieldRow label="Budget" value={lead.budget} />
                <FieldRow label="Purpose" value={lead.purpose} />
                {lead.propertyInterest && (
                  <FieldRow label="Property Interest (legacy)" value={lead.propertyInterest} />
                )}
              </div>
            )}
          </LeadFieldSection>

          {/* 3. Follow-Up */}
          <LeadFieldSection title="Follow-Up">
            {lead.followUpDate ? (
              <FollowUpBadge followUpDate={lead.followUpDate} status={lead.status} />
            ) : (
              <p className="text-sm text-gray-300">No follow-up scheduled.</p>
            )}
            <p className="text-xs text-gray-400 mt-1.5">
              Set or change via the status editor above (date/time is stored exactly as entered).
            </p>
          </LeadFieldSection>

          {/* 5. Last Call */}
          <LeadFieldSection title="Last Call">
            {lead.lastCallDetails?.dateTime ? (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                <p className="text-xs font-medium text-blue-700">
                  {fmtDateTime(lead.lastCallDetails.dateTime)}
                </p>
                {lead.lastCallDetails.discussion && (
                  <p className="text-sm text-gray-700 mt-1 break-words">{lead.lastCallDetails.discussion}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-300">No calls recorded yet.</p>
            )}
          </LeadFieldSection>

          {/* 6. Call History */}
          <LeadFieldSection title="Call History">
            <CallHistoryList callHistory={lead.callHistory} />
          </LeadFieldSection>

          {/* 7. Site Visits */}
          <LeadFieldSection title="Site Visits">
            <SiteVisitHistory lead={lead} onSave={onStatusSave} canEdit={canEditOperational} />
          </LeadFieldSection>

          {/* 8. Remarks / Objection (kept distinct from legacy Notes) */}
          <LeadFieldSection title="Remarks / Objection">
            <textarea
              className="input"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Client objections or remarks..."
            />
            <button
              onClick={saveRemarks}
              disabled={savingRemarks || remarks === (lead.remarks || '')}
              className="mt-2 btn-ghost text-xs px-3 py-1.5 min-h-0 disabled:opacity-40"
            >
              {savingRemarks ? 'Saving...' : 'Save remarks'}
            </button>

            {lead.notes && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Notes (legacy)
                </p>
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2.5
                                text-sm text-gray-700 whitespace-pre-line break-words">
                  {lead.notes}
                </div>
              </div>
            )}
          </LeadFieldSection>

          {/* 9. Assignment */}
          <LeadFieldSection title="Assignment">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Director</span>
                {lead.assignedDirector ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 flex-shrink-0">
                      {lead.assignedDirector.name.charAt(0)}
                    </div>
                    <span className="text-sm text-gray-800 truncate">{lead.assignedDirector.name}</span>
                  </div>
                ) : <span className="text-sm text-orange-400 font-medium">Unassigned</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Telecaller</span>
                {lead.assignedTelecaller ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-xs font-semibold text-green-700 flex-shrink-0">
                      {lead.assignedTelecaller.name.charAt(0)}
                    </div>
                    <span className="text-sm text-gray-800 truncate">{lead.assignedTelecaller.name}</span>
                  </div>
                ) : <span className="text-sm text-orange-400 font-medium">Unassigned</span>}
              </div>
            </div>
          </LeadFieldSection>

          {/* 10. Audit/activity — createdAt/updatedAt only; full audit log
              UI is out of scope for Phase D (AuditLogs.jsx is a separate,
              existing admin-only page). */}
          <LeadFieldSection title="Activity">
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="Created" value={fmtDate(lead.createdAt)} />
              <FieldRow label="Last Updated" value={fmtDate(lead.updatedAt)} />
            </div>
          </LeadFieldSection>

          <div className="pb-safe" />
        </div>
      </div>
    </>
  );
}
