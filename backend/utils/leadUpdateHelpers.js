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

// Appends a new site visit entry — never overwrites/erases prior
// entries, so rescheduling preserves history (Lead.js's siteVisits
// array, Phase B).
const appendSiteVisit = (lead, siteVisit) => {
  if (!siteVisit || typeof siteVisit !== 'object') return null;
  const entry = {
    status:        siteVisit.status || 'planned',
    plannedDate:   siteVisit.plannedDate   || null,
    completedDate: siteVisit.completedDate || null,
    assignedAgent: siteVisit.assignedAgent || '',
    notes:         siteVisit.notes || '',
  };
  lead.siteVisits.push(entry);
  return entry;
};

module.exports = { recordCallHistoryEntry, appendSiteVisit };
