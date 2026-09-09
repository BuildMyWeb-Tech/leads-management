/**
 * leadBusinessRules.js — Reusable, model-level Lead business rules.
 *
 * Deliberately lives in ONE place and is invoked from Lead.js's
 * pre('save') hook so every save path (manual create, telecaller
 * update, director update, admin update) gets the same behaviour
 * automatically, without duplicating rules across controllers.
 *
 * PHASE C→E NOTE: Mongoose `insertMany()` (used by CSV import and OCR
 * bulk import) does NOT run `pre('save')` hooks, so the document-based
 * `applyLeadBusinessRules` above never ran for bulk-imported rows —
 * flagged as a known limitation in Phase C, and closed in Phase E via
 * `applyLeadBusinessRulesToPlainData` below, called explicitly by both
 * `leadsController.importCSV` and `ocrController.importOcrLeads`
 * before `insertMany()`.
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

// ── PHASE E — plain-object variant for bulk-insert paths ────────
// CSV import (leadsController.importCSV) and OCR import
// (ocrController.importOcrLeads) both use Lead.insertMany(), which
// does NOT run the pre('save') hook above (that's a Mongoose
// limitation, not a bug) — so those paths previously skipped these
// rules entirely (the gap documented above and now closed).
//
// This variant operates on a plain data object rather than a
// Mongoose document, so it can run BEFORE insertMany() is called.
// Semantics are identical to the document-based rules for a
// brand-new record: since nothing has been persisted yet, every
// field present on `data` is by definition "being newly set", so the
// same trigger conditions (status / siteVisits) apply directly — no
// isModified() check is needed or meaningful for a not-yet-created
// document. Reuses the exact same HOT_TRIGGER_STATUSES constant as
// the document-based rule — one source of truth for the trigger list.
const applyLeadBusinessRulesToPlainData = (data) => {
  if (data.propertyType !== 'Plot' && data.plotSquareFeet) {
    data.plotSquareFeet = null;
  }

  if (data.priority !== 'Hot') {
    const statusTriggered = HOT_TRIGGER_STATUSES.includes(data.status);
    const siteVisitTriggered =
      Array.isArray(data.siteVisits) &&
      data.siteVisits.some((v) => v.status === 'planned' || v.status === 'completed');

    if (statusTriggered || siteVisitTriggered) {
      data.priority = 'Hot';
    }
  }

  return data;
};

module.exports = {
  applyLeadBusinessRules,
  applyLeadBusinessRulesToPlainData,
  applyPriorityEscalation,
  clearPlotSquareFeetIfNotPlot,
  HOT_TRIGGER_STATUSES,
};
