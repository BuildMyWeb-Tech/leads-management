/**
 * leadVisibility.js — Reusable Lead visibility/authorization filter.
 *
 * Single source of truth for "which leads can this user see", so the
 * rule isn't duplicated (and doesn't drift) across leadsController,
 * directorController, telecallerController, etc.
 *
 * Existing admin/director/telecaller behaviour is preserved exactly
 * as it was before Phase C — only the new 'tl' branch is new.
 *
 * TL hierarchy rule (per Phase B's User.managedBy):
 *   A TL sees leads assigned to telecallers they manage
 *   (User.managedBy === tl._id, role: 'telecaller').
 *   A TL with no managed telecallers yet sees nothing (fail-safe:
 *   never silently falls through to "see everything").
 *
 * NOTE ON AMBIGUITY (flagged per Phase C instructions rather than
 * guessed): the spec says a TL may also need visibility into "any
 * leads directly appropriate to TL if the existing architecture
 * requires it". Nothing in the current architecture assigns leads
 * directly to a TL (there is no `assignedTL` field), so this filter
 * only implements the unambiguous case (leads of managed
 * telecallers). If leads should ever be assignable directly to a TL,
 * that needs an explicit product decision + schema field — not
 * inferred here.
 */

const User = require('../models/User');

const getManagedTelecallerIds = async (tlUserId) => {
  const managed = await User.find({ managedBy: tlUserId, role: 'telecaller' })
    .select('_id')
    .lean();
  return managed.map((u) => u._id);
};

// Returns a MongoDB filter object scoping Lead queries to what `user`
// is allowed to see. Never returns an unscoped {} for a non-admin
// role by accident — unrecognised roles fail safe (see nothing)
// rather than silently seeing everything.
//
// `getManagedIdsFn` is injectable purely for testing the 'tl' branch
// without a live database (default: the real DB-backed function
// above); production callers should never pass this argument.
const buildLeadVisibilityFilter = async (user, getManagedIdsFn = getManagedTelecallerIds) => {
  switch (user.role) {
    case 'admin':
      return {};
    case 'director':
      return { assignedDirector: user._id };
    case 'tl': {
      const telecallerIds = await getManagedIdsFn(user._id);
      // Empty $in array is intentional: a TL managing nobody yet sees
      // no leads, rather than matching everything.
      return { assignedTelecaller: { $in: telecallerIds } };
    }
    case 'telecaller':
      return { assignedTelecaller: user._id };
    default:
      // Fail-safe: an unrecognised role sees nothing rather than
      // everything.
      return { _id: null };
  }
};

module.exports = { buildLeadVisibilityFilter, getManagedTelecallerIds };
