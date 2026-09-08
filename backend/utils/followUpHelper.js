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

module.exports = { isFollowUpOverdue, isFollowUpUpcoming };
