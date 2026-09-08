/**
 * leadBusinessRules.js — Reusable, model-level Lead business rules.
 *
 * Deliberately lives in ONE place and is invoked from Lead.js's
 * pre('save') hook so every save path (manual create, telecaller
 * update, director update, admin update) gets the same behaviour
 * automatically, without duplicating rules across controllers.
 *
 * KNOWN LIMITATION (documented, not fixed in Phase C): Mongoose
 * `insertMany()` (used by CSV import and OCR bulk import) does NOT
 * run `pre('save')` hooks, so these rules do not apply to bulk-
 * imported rows. Bulk imports always start at status 'New'/'Allocated'
 * and priority 'Cold' (schema default), so this is low-risk — no
 * bulk-imported lead is created already Hot-eligible. Flagged here
 * for anyone extending bulk import later.
 */

// Pipeline statuses that represent high-intent progress. Reaching any
// of these is treated as evidence the lead deserves top-of-list
// attention, regardless of how it currently reads (Cold/Warm).
const HOT_TRIGGER_STATUSES = ['Site Visit Planned', 'Site Visit Done', 'Booked'];

// ── Priority escalation ─────────────────────────────────────────
// One-way only: this NEVER downgrades an existing Hot lead. It only
// promotes Cold/Warm -> Hot when a high-intent signal appears, either
// via the status field or via a siteVisits entry being added.
const applyPriorityEscalation = (lead) => {
  if (lead.priority === 'Hot') return; // already at the top — nothing to do

  const statusTriggered =
    lead.isModified('status') && HOT_TRIGGER_STATUSES.includes(lead.status);

  const siteVisitTriggered =
    lead.isModified('siteVisits') &&
    Array.isArray(lead.siteVisits) &&
    lead.siteVisits.some((v) => v.status === 'planned' || v.status === 'completed');

  if (statusTriggered || siteVisitTriggered) {
    lead.priority = 'Hot';
  }
};

// ── Plot / property-type cross-field cleanup ────────────────────
// plotSquareFeet is only meaningful when propertyType === 'Plot'.
// Rather than rejecting the whole update when it's set alongside
// 'House' (or no propertyType), we quietly clear it — keeps the API
// forgiving for partial updates and matches "should normally be
// empty/null" from the requirement, without a DB-layer validator
// that could reject unrelated legacy documents.
const clearPlotSquareFeetIfNotPlot = (lead) => {
  if (lead.propertyType !== 'Plot' && lead.plotSquareFeet) {
    lead.plotSquareFeet = null;
  }
};

const applyLeadBusinessRules = (lead) => {
  clearPlotSquareFeetIfNotPlot(lead);
  applyPriorityEscalation(lead);
};

module.exports = {
  applyLeadBusinessRules,
  applyPriorityEscalation,
  clearPlotSquareFeetIfNotPlot,
  HOT_TRIGGER_STATUSES,
};
