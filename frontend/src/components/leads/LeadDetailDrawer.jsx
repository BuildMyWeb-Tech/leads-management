import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getWhatsAppUrl } from '../../utils/phoneUtils';
import api from '../../utils/api';
import StatusEditor from './StatusEditor';
import PipelineStrip from './PipelineStrip';
import PriorityBadge from './PriorityBadge';
import FollowUpBadge from './FollowUpBadge';
import CallHistoryList from './CallHistoryList';
import SiteVisitHistory from './SiteVisitHistory';
import { LeadFieldSection, FieldRow } from './LeadFieldSection';
import {
  PROPERTY_TYPES, PURPOSE_OPTIONS, PRIORITY_LEVELS,
} from '../../constants/leadConstants';
import toast from 'react-hot-toast';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

/**
 * LeadDetailDrawer — full lead profile view/edit.
 *
 * PERMISSION NOTE (Phase D sign-off): admin, director, and tl are one
 * equivalent permission tier for lead management — all three can edit
 * propertyType/plotSquareFeet/targetLocation/purpose/budget/
 * propertyInterest/email through the update API (see
 * backend/controllers/leadsController.js updateLead). telecaller
 * remains the separate, restricted tier from Phase C.
 */
export default function LeadDetailDrawer({ lead, onClose, onStatusSave }) {
  const { user } = useAuth();
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [remarks, setRemarks] = useState(lead.remarks || '');
  const [savingRemarks, setSavingRemarks] = useState(false);
  // K2: priority editing state
  const [priorityValue, setPriorityValue] = useState(lead.priority || 'Cold');
  const [savingPriority, setSavingPriority] = useState(false);
  // Req 8: quick employee assignment state
  const [presentEmployees, setPresentEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [assigningEmployee, setAssigningEmployee] = useState(false);
  const canAssignEmployee = ['admin', 'director', 'tl'].includes(user.role);

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
    setPriorityValue(lead.priority || 'Cold');
    setSelectedEmployee('');
  }, [lead._id]);

  useEffect(() => {
    if (!canAssignEmployee) return;
    api.get('/attendance/employees/present')
      .then((r) => setPresentEmployees(r.data || []))
      .catch(() => {});
  }, [lead._id, canAssignEmployee]);

  const handleAssignEmployee = async () => {
    if (!selectedEmployee) return;
    setAssigningEmployee(true);
    try {
      await api.put(`/leads/${lead._id}/assign-employee`, { employeeId: selectedEmployee });
      toast.success('Employee assigned successfully');
      onStatusSave(lead._id, {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign employee');
    } finally {
      setAssigningEmployee(false);
    }
  };

  if (!lead) return null;

  const canEditProfile = ['admin', 'director', 'tl'].includes(user.role);
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

  // PHASE E: AddLead treats propertyType/targetLocation/budget/purpose
  // as required — this edit form previously had no validation at all,
  // letting an edit silently blank out fields AddLead enforces as
  // mandatory. Mirrors AddLead's own validation exactly.
  const validateProfileForm = (form) => {
    if (!form.propertyType) return 'Property Type is required';
    if (!['Plot', 'House'].includes(form.propertyType)) return 'Invalid Property Type';
    // K2: plotSquareFeet is free-text — no enum validation
    if (!form.targetLocation.trim()) return 'Target Location is required';
    if (!form.budget.trim()) return 'Budget is required';
    if (!form.purpose) return 'Purpose is required';
    if (!PURPOSE_OPTIONS.includes(form.purpose)) return 'Invalid Purpose';
    return null;
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    const validationError = validateProfileForm(profileForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }
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

  // K2: privileged priority update
  const savePriority = async (newPriority) => {
    if (newPriority === lead.priority) return;
    setSavingPriority(true);
    try {
      await onStatusSave(lead._id, { priority: newPriority });
      setPriorityValue(newPriority);
      toast.success(`Priority set to ${newPriority}`);
    } catch {
      setPriorityValue(lead.priority || 'Cold');
      toast.error('Failed to update priority');
    } finally {
      setSavingPriority(false);
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
            <div className="flex items-center gap-2 mt-0.5">
              <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  className="text-green-500 hover:text-green-700"
                  title="Open WhatsApp"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </a>
              )}
            </div>
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
            {/* Priority: editable for admin/director/tl and telecaller (own leads only — backend enforces ownership) */}
            {(canEditProfile || user.role === 'telecaller') ? (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 font-medium">Priority:</label>
                <select
                  value={priorityValue}
                  onChange={(e) => savePriority(e.target.value)}
                  disabled={savingPriority}
                  className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white
                             focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                >
                  {PRIORITY_LEVELS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {savingPriority && (
                  <span className="text-xs text-gray-400">Saving...</span>
                )}
              </div>
            ) : (
              <PriorityBadge priority={lead.priority} />
            )}
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
                    <label className="label text-xs">Property Type <span className="text-red-400">*</span></label>
                    <select className="input-sm" value={profileForm.propertyType} required
                      onChange={(e) => setProfileForm({ ...profileForm, propertyType: e.target.value })}>
                      <option value="">— Select —</option>
                      {PROPERTY_TYPES.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  {profileForm.propertyType === 'Plot' && (
                    <div>
                      {/* K2: free-text input replaces fixed dropdown */}
                      <label className="label text-xs">Plot Area</label>
                      <input
                        className="input-sm"
                        placeholder="e.g. 1500 sq ft"
                        value={profileForm.plotSquareFeet}
                        maxLength={50}
                        onChange={(e) => setProfileForm({ ...profileForm, plotSquareFeet: e.target.value })}
                      />
                    </div>
                  )}
                  <div>
                    <label className="label text-xs">Target Location <span className="text-red-400">*</span></label>
                    <input className="input-sm" value={profileForm.targetLocation} required
                      onChange={(e) => setProfileForm({ ...profileForm, targetLocation: e.target.value })} />
                  </div>
                  <div>
                    <label className="label text-xs">Budget <span className="text-red-400">*</span></label>
                    <input className="input-sm" value={profileForm.budget} required
                      onChange={(e) => setProfileForm({ ...profileForm, budget: e.target.value })} />
                  </div>
                  <div>
                    <label className="label text-xs">Purpose <span className="text-red-400">*</span></label>
                    <select className="input-sm" value={profileForm.purpose} required
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
            <div className="space-y-3">
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
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Team Lead</span>
                  {lead.assignedTelecaller?.managedBy ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center text-xs font-semibold text-teal-700 flex-shrink-0">
                        {(lead.assignedTelecaller.managedBy.name || '?').charAt(0)}
                      </div>
                      <span className="text-sm text-gray-800 truncate">{lead.assignedTelecaller.managedBy.name}</span>
                    </div>
                  ) : <span className="text-sm text-gray-400">—</span>}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Employee</span>
                {lead.assignedTelecaller ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-xs font-semibold text-green-700 flex-shrink-0">
                      {lead.assignedTelecaller.name.charAt(0)}
                    </div>
                    <span className="text-sm text-gray-800 truncate">{lead.assignedTelecaller.name}</span>
                  </div>
                ) : <span className="text-sm text-orange-400 font-medium">Unassigned</span>}
              </div>

              {/* Quick employee assign — admin/director/tl only */}
              {canAssignEmployee && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Assign Employee (present today)</p>
                  <div className="flex gap-2">
                    <select
                      className="input text-xs flex-1"
                      value={selectedEmployee}
                      onChange={(e) => setSelectedEmployee(e.target.value)}
                    >
                      <option value="">— Select employee —</option>
                      {presentEmployees.map((emp) => (
                        <option key={emp._id} value={emp._id}>{emp.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssignEmployee}
                      disabled={!selectedEmployee || assigningEmployee}
                      className="btn-primary text-xs px-3 py-1.5 min-h-0 disabled:opacity-40"
                    >
                      {assigningEmployee ? 'Assigning...' : 'Assign'}
                    </button>
                  </div>
                  {presentEmployees.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">No employees present today</p>
                  )}
                </div>
              )}
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
