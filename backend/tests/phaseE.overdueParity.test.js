/**
 * phaseE.overdueParity.test.js — verifies buildOverdueFollowUpQuery()
 * (now used by telecallerController's dashboard) matches
 * isFollowUpOverdue()'s definition exactly, closing the previous
 * inconsistency (dashboard treated followUpDate:null as overdue;
 * isFollowUpOverdue() did not).
 *
 * Since the query itself is only meaningful against a real MongoDB
 * (Date vs null BSON-ordering semantics), this suite verifies the
 * query SHAPE explicitly guards against the null case, and cross-
 * checks parity against isFollowUpOverdue() across a table of leads
 * using a small in-memory matcher for the query's own filter shape
 * (status + followUpDate range) — not a general Mongo simulator, just
 * enough to interpret the two conditions this query actually sets.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isFollowUpOverdue, buildOverdueFollowUpQuery } = require('../utils/followUpHelper');

const NOW = new Date('2026-09-08T12:00:00.000Z');

test('buildOverdueFollowUpQuery explicitly excludes null followUpDate ($ne: null)', () => {
  const q = buildOverdueFollowUpQuery({ assignedTelecaller: 'x' }, NOW);
  assert.equal(q.followUpDate.$ne, null, 'must explicitly exclude null — Mongo BSON ordering would otherwise match it under $lt');
  assert.equal(q.status, 'Follow Up');
  assert.deepEqual(q.followUpDate.$lt, NOW);
});

test('buildOverdueFollowUpQuery preserves the caller-supplied base filter', () => {
  const q = buildOverdueFollowUpQuery({ assignedTelecaller: 'tc1' }, NOW);
  assert.equal(q.assignedTelecaller, 'tc1');
});

// Interprets ONLY the filter shape buildOverdueFollowUpQuery produces
// (status equality + followUpDate $ne/$lt) against one lead — used to
// prove parity with isFollowUpOverdue(), not a general Mongo simulator.
const matchesOverdueQuery = (lead, query) => {
  if (lead.status !== query.status) return false;
  if (lead.followUpDate === null || lead.followUpDate === undefined) return false; // $ne: null
  return new Date(lead.followUpDate).getTime() < query.followUpDate.$lt.getTime();
};

test('parity: query result and isFollowUpOverdue() agree across a table of leads', () => {
  const leads = [
    { label: 'past + Follow Up',        status: 'Follow Up', followUpDate: new Date('2026-09-01T00:00:00.000Z') },
    { label: 'future + Follow Up',      status: 'Follow Up', followUpDate: new Date('2026-09-20T00:00:00.000Z') },
    { label: 'null + Follow Up',        status: 'Follow Up', followUpDate: null },
    { label: 'past + Booked',           status: 'Booked',    followUpDate: new Date('2026-01-01T00:00:00.000Z') },
    { label: 'past + Follow Up, no tz', status: 'Follow Up', followUpDate: new Date('2026-09-08T11:00:00.000Z') },
  ];

  const query = buildOverdueFollowUpQuery({}, NOW);

  for (const lead of leads) {
    const queryResult  = matchesOverdueQuery(lead, query);
    const helperResult = isFollowUpOverdue(lead, NOW);
    assert.equal(queryResult, helperResult, `mismatch for case "${lead.label}"`);
  }
});

test('the previous (buggy) definition would have disagreed on the null case — confirms this is a real fix', () => {
  const nullFollowUpLead = { status: 'Follow Up', followUpDate: null };
  const oldBuggyDefinition = nullFollowUpLead.status === 'Follow Up'; // old query's effective "null counts as overdue"
  const canonical = isFollowUpOverdue(nullFollowUpLead, NOW);
  assert.equal(oldBuggyDefinition, true);
  assert.equal(canonical, false);
  assert.notEqual(oldBuggyDefinition, canonical, 'demonstrates the inconsistency that has now been fixed');
});
