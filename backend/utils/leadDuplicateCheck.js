/**
 * leadDuplicateCheck.js — Bounded phone-based duplicate lookup.
 *
 * PHASE E FIX: previously, both ocrController.checkDuplicates and
 * ocrController.importOcrLeads called `Lead.find({}).select('phone')`
 * — fetching every lead's phone number into memory on every request,
 * regardless of how many phones were actually being checked. This
 * does not scale (a real, unbounded-growth problem at large lead
 * counts).
 *
 * Fix: query only the specific phone values that could possibly match
 * one of the candidate numbers, via an indexed $in lookup on `phone`
 * (Lead.js has `leadSchema.index({ phone: 1 })`).
 *
 * WHY TWO VARIANTS PER CANDIDATE: normaliseForDedupe() (phoneUtils.js)
 * strips ALL non-digit characters — including a leading '+' — to
 * build its comparison key. normalisePhone() (storage format) keeps
 * an optional leading '+'. So a stored phone is always either exactly
 * the dedupe key's digits, or that same digit string prefixed with
 * '+'. Querying for both forms reproduces the exact same match
 * behaviour as the old fetch-everything-and-compare-in-JS approach,
 * without ever loading unrelated leads.
 */

const { normaliseForDedupe } = require('./phoneUtils');

// The bounded set of literal `phone` field values that could match a
// given raw phone number under the existing dedupe-key comparison.
const phoneLookupVariants = (rawPhone) => {
  const key = normaliseForDedupe(rawPhone);
  if (!key) return [];
  return [key, `+${key}`];
};

// Queries only leads whose stored `phone` could match one of the
// given raw phone numbers — never the whole collection.
const findExistingLeadsByPhones = async (LeadModel, rawPhones) => {
  const variants = [...new Set(rawPhones.flatMap(phoneLookupVariants))];
  if (!variants.length) return [];
  return LeadModel.find({ phone: { $in: variants } })
    .select('name phone status assignedDirector')
    .populate('assignedDirector', 'name')
    .lean();
};

module.exports = { phoneLookupVariants, findExistingLeadsByPhones };
