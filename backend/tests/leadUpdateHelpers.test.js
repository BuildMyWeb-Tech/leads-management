/**
 * leadUpdateHelpers.test.js — call-history append + lastCallDetails
 * refresh, and site-visit append (history-preserving reschedule).
 * Uses in-memory Mongoose documents only (no DB connection).
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const { recordCallHistoryEntry, appendSiteVisit } = require('../utils/leadUpdateHelpers');

const baseLead = () => new Lead({ name: 'Test', phone: '9876543210' });

test('recording a call appends to callHistory without erasing previous entries', () => {
  const lead = baseLead();
  const updatedBy = new mongoose.Types.ObjectId();

  recordCallHistoryEntry(lead, { status: 'Called', notes: 'First call', updatedBy });
  recordCallHistoryEntry(lead, { status: 'Follow Up', notes: 'Second call', updatedBy });

  assert.equal(lead.callHistory.length, 2);
  assert.equal(lead.callHistory[0].notes, 'First call');
  assert.equal(lead.callHistory[1].notes, 'Second call');
});

test('recording a call updates lastCallDetails to the newest call', () => {
  const lead = baseLead();
  const updatedBy = new mongoose.Types.ObjectId();

  recordCallHistoryEntry(lead, { status: 'Called', notes: 'First call', updatedBy });
  const firstCallTime = lead.lastCallDetails.dateTime;

  recordCallHistoryEntry(lead, { status: 'Follow Up', notes: 'Second call', updatedBy });

  assert.equal(lead.lastCallDetails.discussion, 'Second call');
  assert.ok(lead.lastCallDetails.dateTime.getTime() >= firstCallTime.getTime());
  // Historical record must still contain the first call intact.
  assert.equal(lead.callHistory[0].notes, 'First call');
});

test('appending a planned site visit records the expected/planned date', () => {
  const lead = baseLead();
  const visit = appendSiteVisit(lead, { status: 'planned', plannedDate: new Date('2026-10-01') });
  assert.equal(visit.status, 'planned');
  assert.equal(lead.siteVisits.length, 1);
  assert.ok(lead.siteVisits[0].plannedDate instanceof Date);
  assert.equal(lead.siteVisits[0].completedDate, null);
});

test('appending a completed site visit records the exact completed date', () => {
  const lead = baseLead();
  appendSiteVisit(lead, { status: 'completed', completedDate: new Date('2026-09-05') });
  assert.equal(lead.siteVisits[0].status, 'completed');
  assert.ok(lead.siteVisits[0].completedDate instanceof Date);
});

test('rescheduling (adding a second visit) preserves the original visit history', () => {
  const lead = baseLead();
  appendSiteVisit(lead, { status: 'planned', plannedDate: new Date('2026-09-10') });
  appendSiteVisit(lead, { status: 'cancelled' });
  appendSiteVisit(lead, { status: 'planned', plannedDate: new Date('2026-09-20') });

  assert.equal(lead.siteVisits.length, 3, 'all three visit records must remain, nothing overwritten');
  assert.equal(lead.siteVisits[0].plannedDate.toISOString().slice(0, 10), '2026-09-10');
  assert.equal(lead.siteVisits[1].status, 'cancelled');
  assert.equal(lead.siteVisits[2].plannedDate.toISOString().slice(0, 10), '2026-09-20');
});
