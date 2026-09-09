/**
 * followUpHelper.js — Reusable, backend-only follow-up timing logic.
 *
 * No permanent "isOverdue" field is stored anywhere (per requirement)
 * — overdue-ness is always computed from the current time against the
 * stored `followUpDate`.
 *
 * TIMEZONE NOTE: JavaScript `Date` objects always represent a single
 * UTC instant internally, so `followUpDate < now` comparisons here are
 * timezone-safe regardless of server locale — no manual offset math is
 * needed (unlike day-boundary calculations such as reminderScheduler's
 * "today in IST" range, which is a different, unrelated concern this
 * helper does not touch).
 */

// A lead only "counts" as overdue while it is still sitting in the
// Follow Up stage — once it moves on (Called, Booked, etc.) its old
// follow-up date is no longer an actionable overdue item.
const isFollowUpOverdue = (lead, now = new Date()) => {
  if (!lead || !lead.followUpDate) return false;
  if (lead.status !== 'Follow Up') return false;
  return new Date(lead.followUpDate).getTime() < now.getTime();
};

const isFollowUpUpcoming = (lead, now = new Date()) => {
  if (!lead || !lead.followUpDate) return false;
  return new Date(lead.followUpDate).getTime() >= now.getTime();
};

// PHASE E FIX: telecallerController's dashboard "overdue" query used
// to treat `followUpDate: null` (with status 'Follow Up') as overdue,
// while isFollowUpOverdue() above explicitly does not — a lead could
// show as overdue on the telecaller dashboard but nowhere else
// (priority ranking, FollowUpBadge). Rather than fix the query inline
// and risk the two definitions drifting apart again later, this
// builds the exact MongoDB filter shape that matches
// isFollowUpOverdue()'s semantics, so there is ONE source of truth:
// status must be 'Follow Up', followUpDate must be non-null, and it
// must be strictly before `now`.
//
// Note `$ne: null` is required (not just `$lt: now`): MongoDB's
// cross-type comparison ordering places `null` before any Date value,
// so `{ followUpDate: { $lt: now } }` alone would incorrectly match
// documents where followUpDate is null.
const buildOverdueFollowUpQuery = (base = {}, now = new Date()) => ({
  ...base,
  status: 'Follow Up',
  followUpDate: { $ne: null, $lt: now },
});

module.exports = { isFollowUpOverdue, isFollowUpUpcoming, buildOverdueFollowUpQuery };
