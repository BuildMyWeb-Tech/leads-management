/**
 * priorityRanking.js — Backend-only dashboard ordering support.
 *
 * Required business order (client spec):
 *   1. Booking Status / Booked
 *   2. Hot
 *   3. Completed Site Visits
 *   4. Scheduled / Upcoming Site Visits
 *   5. Warm
 *   6. Cold
 *
 * This is intentionally a SINGLE reusable ranking utility rather than
 * duplicated inline sort logic in multiple controllers. No frontend
 * sorting/UI is implemented here — this only prepares the backend so
 * a later phase (or an already-wired `?sort=priority` query param on
 * GET /api/leads, see leadsController.js) can request leads in this
 * order.
 *
 * WHY rank 3/4 (site-visit-based) can outrank a plain Warm/Cold lead
 * that hasn't escalated: the automatic escalation rule (see
 * leadBusinessRules.js) only fires for Cold leads reaching a
 * high-intent status/site-visit. A Warm lead with a scheduled visit
 * is not auto-escalated to Hot by that rule, so without this ranking
 * it would sit at plain "Warm" — this ranking still surfaces it above
 * plain Warm/Cold leads based on its actual site-visit sub-state,
 * independent of the `priority` field's exact value.
 */

const { isFollowUpOverdue } = require('./followUpHelper');

const RANK = {
  BOOKED: 1,
  HOT: 2,
  COMPLETED_VISIT: 3,
  UPCOMING_VISIT: 4,
  WARM: 5,
  COLD: 6,
};

const hasCompletedSiteVisit = (lead) =>
  (lead.siteVisits || []).some((v) => v.status === 'completed') || lead.status === 'Site Visit Done';

const hasUpcomingSiteVisit = (lead) =>
  (lead.siteVisits || []).some((v) => v.status === 'planned') || lead.status === 'Site Visit Planned';

const getPriorityRank = (lead) => {
  if (lead.status === 'Booked') return RANK.BOOKED;
  if (lead.priority === 'Hot') return RANK.HOT;
  if (hasCompletedSiteVisit(lead)) return RANK.COMPLETED_VISIT;
  if (hasUpcomingSiteVisit(lead)) return RANK.UPCOMING_VISIT;
  if (lead.priority === 'Warm') return RANK.WARM;
  return RANK.COLD;
};

// Deterministic tie-breaker within the same rank, kept intentionally
// simple per Phase C scope:
//   1. overdue follow-up first
//   2. earliest upcoming followUpDate (no followUpDate sorts last)
//   3. most recently updated
//   4. newest created
const compareLeadsByPriority = (a, b, now = new Date()) => {
  const rankDiff = getPriorityRank(a) - getPriorityRank(b);
  if (rankDiff !== 0) return rankDiff;

  const aOverdue = isFollowUpOverdue(a, now);
  const bOverdue = isFollowUpOverdue(b, now);
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

  const aFollow = a.followUpDate ? new Date(a.followUpDate).getTime() : Infinity;
  const bFollow = b.followUpDate ? new Date(b.followUpDate).getTime() : Infinity;
  if (aFollow !== bFollow) return aFollow - bFollow;

  const aUpdated = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const bUpdated = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  if (aUpdated !== bUpdated) return bUpdated - aUpdated;

  const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return bCreated - aCreated;
};

const sortLeadsByPriority = (leads, now = new Date()) =>
  [...leads].sort((a, b) => compareLeadsByPriority(a, b, now));

module.exports = {
  RANK,
  getPriorityRank,
  hasCompletedSiteVisit,
  hasUpcomingSiteVisit,
  compareLeadsByPriority,
  sortLeadsByPriority,
};
