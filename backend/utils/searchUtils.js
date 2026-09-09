/**
 * searchUtils.js — Safe regex construction for user-supplied search text.
 *
 * PHASE E FIX: leadsController.getLeads previously interpolated the
 * raw `search` query param directly into a MongoDB `$regex`. This let
 * regex metacharacters (., (, ), +, *, ?, [, ], {, }, \, ^, $) either
 * throw/misbehave (e.g. an unbalanced paren) or behave as regex
 * operators instead of literal characters a user actually typed
 * (searching "A+B" should find the literal text "A+B", not "one or
 * more A followed by B"). A crafted pattern could also trigger
 * catastrophic backtracking (ReDoS) on the query executor.
 *
 * Fix: escape every regex metacharacter so the string is always
 * matched literally, while keeping the existing partial-match,
 * case-insensitive search behaviour unchanged.
 */

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegex };
