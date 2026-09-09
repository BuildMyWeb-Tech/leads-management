/**
 * phaseE.siteVisitValidation.test.js — minimal validation added to
 * appendSiteVisit(): reject malformed entries, without blocking
 * legitimate manual/historical entries or corrupting existing history.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Lead = require('../models/Lead');
const { appendSiteVisit } = require('../utils/leadUpdateHelpers');

const baseLead = () => new Lead({ name: 'Test', phone: '9876543210' });

test('a valid planned visit with a planned date is accepted', () => {
  const lead = baseLead();
  const entry = appendSiteVisit(lead, { status: 'planned', plannedDate: '2026-10-01' });
  assert.equal(entry.status, 'planned');
  assert.equal(lead.siteVisits.length, 1);
});

test('a valid completed visit with a completed date is accepted', () => {
  const lead = baseLead();
  const entry = appendSiteVisit(lead, { status: 'completed', completedDate: '2026-09-05' });
  assert.equal(entry.status, 'completed');
});

test('a planned visit WITHOUT a planned date is rejected', () => {
  const lead = baseLead();
  assert.throws(() => appendSiteVisit(lead, { status: 'planned' }), /planned date/i);
  assert.equal(lead.siteVisits.length, 0, 'nothing should be pushed on rejection');
});

test('a completed visit WITHOUT a completed date is rejected', () => {
  const lead = baseLead();
  assert.throws(() => appendSiteVisit(lead, { status: 'completed' }), /completed date/i);
  assert.equal(lead.siteVisits.length, 0);
});

test('an invalid status value is rejected', () => {
  const lead = baseLead();
  assert.throws(() => appendSiteVisit(lead, { status: 'rescheduled', plannedDate: '2026-10-01' }), /invalid site visit status/i);
});

test('an invalid (unparseable) date value is rejected', () => {
  const lead = baseLead();
  assert.throws(() => appendSiteVisit(lead, { status: 'planned', plannedDate: 'not-a-date' }), /invalid planned date/i);
});

test('a cancelled visit does not require any date', () => {
  const lead = baseLead();
  const entry = appendSiteVisit(lead, { status: 'cancelled' });
  assert.equal(entry.status, 'cancelled');
});

test('a legitimate manual backfill of a past completed date is allowed (not blocked as "impossible")', () => {
  const lead = baseLead();
  const entry = appendSiteVisit(lead, { status: 'completed', completedDate: '2020-01-01' });
  assert.equal(entry.status, 'completed');
});

test('an exact duplicate of the most recent entry is rejected', () => {
  const lead = baseLead();
  appendSiteVisit(lead, { status: 'planned', plannedDate: '2026-10-01' });
  assert.throws(() => appendSiteVisit(lead, { status: 'planned', plannedDate: '2026-10-01' }), /duplicates the most recent/i);
  assert.equal(lead.siteVisits.length, 1, 'the duplicate must not have been pushed');
});

test('a genuinely different follow-up entry (reschedule) is NOT treated as a duplicate', () => {
  const lead = baseLead();
  appendSiteVisit(lead, { status: 'planned', plannedDate: '2026-10-01' });
  appendSiteVisit(lead, { status: 'planned', plannedDate: '2026-10-15' }); // reschedule
  assert.equal(lead.siteVisits.length, 2, 'a reschedule to a different date must be preserved as new history');
});

test('rejecting a malformed entry never corrupts or removes existing history', () => {
  const lead = baseLead();
  appendSiteVisit(lead, { status: 'completed', completedDate: '2026-09-01' });
  assert.throws(() => appendSiteVisit(lead, { status: 'completed' })); // missing date, rejected
  assert.equal(lead.siteVisits.length, 1, 'the prior valid entry must remain untouched');
  assert.equal(lead.siteVisits[0].status, 'completed');
});

test('undefined siteVisit input remains a harmless no-op (unchanged pre-existing behavior)', () => {
  const lead = baseLead();
  const result = appendSiteVisit(lead, null);
  assert.equal(result, null);
  assert.equal(lead.siteVisits.length, 0);
});
