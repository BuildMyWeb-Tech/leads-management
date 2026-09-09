/**
 * leadUpdateHelpers.js — Shared mutation helpers for Lead updates.
 *
 * Used by both leadsController.js (director/admin/tl/telecaller path
 * via PUT /api/leads/:id) and telecallerController.js (PUT
 * /api/telecaller/leads/:id) so the call-history / site-visit append
 * behaviour is defined exactly once.
 */

// Pushes a new callHistory entry AND refreshes lastCallDetails to
// reflect it. callHistory is always appended to, never overwritten —
// lastCallDetails is just "the latest one" for quick display.
const recordCallHistoryEntry = (lead, { status, notes, updatedBy }) => {
  if (!lead.callHistory) lead.callHistory = [];
  const entry = { status, notes: notes || '', updatedBy, updatedAt: new Date() };
  lead.callHistory.push(entry);
  lead.lastCallDetails = { dateTime: entry.updatedAt, discussion: entry.notes };
  return entry;
};

const VALID_SITE_VISIT_STATUSES = ['planned', 'completed', 'cancelled'];

// Appends a new site visit entry — never overwrites/erases prior
// entries, so rescheduling preserves history (Lead.js's siteVisits
// array, Phase B).
//
// PHASE E: minimal validation added. Throws a descriptive Error on
// malformed input (invalid status, missing/invalid required date, or
// an exact duplicate of the most recent entry) — callers' existing
// try/catch around lead.save() already turns this into a 400 response
// with the error message, so nothing new is needed at the call sites.
// Throwing happens BEFORE anything is pushed, so history is never
// corrupted by a rejected attempt.
const appendSiteVisit = (lead, siteVisit) => {
  if (!siteVisit || typeof siteVisit !== 'object') return null; // not provided — unchanged no-op behavior

  const status = siteVisit.status || 'planned';
  if (!VALID_SITE_VISIT_STATUSES.includes(status)) {
    throw new Error(`Invalid site visit status "${status}"`);
  }

  const toValidDate = (value, label) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) throw new Error(`Invalid ${label}`);
    return d;
  };
  const plannedDate   = toValidDate(siteVisit.plannedDate, 'planned date');
  const completedDate = toValidDate(siteVisit.completedDate, 'completed date');

  if (status === 'planned' && !plannedDate) {
    throw new Error('A planned site visit requires a planned date');
  }
  if (status === 'completed' && !completedDate) {
    throw new Error('A completed site visit requires a completed date');
  }

  // Prevent an accidental duplicate consecutive entry (e.g. a
  // double-submit) — not complicated scheduling logic, just "is this
  // identical to the very last entry".
  const last = lead.siteVisits[lead.siteVisits.length - 1];
  if (
    last &&
    last.status === status &&
    (last.plannedDate?.getTime()   || null) === (plannedDate?.getTime()   || null) &&
    (last.completedDate?.getTime() || null) === (completedDate?.getTime() || null)
  ) {
    throw new Error('This site visit entry duplicates the most recent one');
  }

  const entry = {
    status,
    plannedDate,
    completedDate,
    assignedAgent: siteVisit.assignedAgent || '',
    notes:         siteVisit.notes || '',
  };
  lead.siteVisits.push(entry);
  return entry;
};

// PHASE E — audit before/after capture ──────────────────────────
// Fields tracked by the generic 'lead_updated' audit event. status
// and priority are deliberately excluded here — they already get
// their own dedicated, precise audit events (leadStatusChanged,
// leadPriorityChanged) whenever they actually change.
const AUDIT_TRACKED_FIELDS = [
  'name', 'phone', 'email', 'source',
  'propertyType', 'plotSquareFeet', 'targetLocation', 'budget', 'purpose',
  'followUpDate', 'remarks', 'notes',
];

// Captures a { field: value } snapshot of `lead` for exactly the
// fields present in `body` — used to record accurate before/after
// pairs in the audit log. Call this once on the ORIGINAL document
// (before any mutation) to get "before", and again on the
// saved/reloaded document to get "after" — see auditService.js's
// leadUpdated() and its call sites in leadsController.js /
// telecallerController.js.
const snapshotTrackedFields = (lead, body) => {
  const snapshot = {};
  for (const field of AUDIT_TRACKED_FIELDS) {
    if (body[field] !== undefined) snapshot[field] = lead[field];
  }
  return snapshot;
};

module.exports = {
  recordCallHistoryEntry, appendSiteVisit, snapshotTrackedFields,
  AUDIT_TRACKED_FIELDS, VALID_SITE_VISIT_STATUSES,
};
