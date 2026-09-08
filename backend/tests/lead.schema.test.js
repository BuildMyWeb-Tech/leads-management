/**
 * lead.schema.test.js — Phase B schema validation tests.
 *
 * These tests use Mongoose's `validateSync()`, which runs schema-level
 * validation (required/enum/type checks) entirely in memory — no
 * database connection is opened, so this suite is completely safe to
 * run against a machine with a real production MONGO_URI configured
 * in .env; it never touches that database.
 *
 * Limitation (documented, not worked around in Phase B): actual
 * persistence (does a saved document really round-trip through
 * MongoDB?) is NOT verified here, since no isolated/in-memory Mongo
 * server is available in this environment. What IS verified: the
 * field is declared on the schema (schema.path(...) exists) and a
 * document containing it passes validation — which directly proves
 * the "callHistory silently dropped by strict mode" bug is fixed
 * (the old code had no schema path for it at all).
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const Lead = require('../models/Lead');

const baseLead = () => ({ name: 'Test Lead', phone: '9876543210' });

test('existing required fields remain valid (name, phone)', () => {
  const lead = new Lead(baseLead());
  const err = lead.validateSync();
  assert.equal(err, undefined);
});

test('missing required fields are rejected', () => {
  const lead = new Lead({});
  const err = lead.validateSync();
  assert.ok(err, 'expected validation error for missing name/phone');
  assert.ok(err.errors.name);
  assert.ok(err.errors.phone);
});

test('a new lead can be created with all Phase B fields', () => {
  const lead = new Lead({
    ...baseLead(),
    propertyType: 'Plot',
    plotSquareFeet: '1200',
    targetLocation: 'Whitefield',
    purpose: 'Investment',
    remarks: 'Wants a corner plot',
    priority: 'Warm',
    lastCallDetails: { dateTime: new Date(), discussion: 'Interested, will call back' },
  });
  const err = lead.validateSync();
  assert.equal(err, undefined);
});

test('propertyType accepts Plot and House', () => {
  for (const value of ['Plot', 'House']) {
    const lead = new Lead({ ...baseLead(), propertyType: value });
    assert.equal(lead.validateSync(), undefined);
  }
});

test('invalid propertyType is rejected', () => {
  const lead = new Lead({ ...baseLead(), propertyType: 'Apartment' });
  const err = lead.validateSync();
  assert.ok(err && err.errors.propertyType);
});

test('plotSquareFeet accepts Below 1200 / 1200 / Above 1200', () => {
  for (const value of ['Below 1200', '1200', 'Above 1200']) {
    const lead = new Lead({ ...baseLead(), propertyType: 'Plot', plotSquareFeet: value });
    assert.equal(lead.validateSync(), undefined);
  }
});

test('invalid plotSquareFeet is rejected', () => {
  const lead = new Lead({ ...baseLead(), propertyType: 'Plot', plotSquareFeet: '2000' });
  const err = lead.validateSync();
  assert.ok(err && err.errors.plotSquareFeet);
});

test('purpose accepts Investment and Residential', () => {
  for (const value of ['Investment', 'Residential']) {
    const lead = new Lead({ ...baseLead(), purpose: value });
    assert.equal(lead.validateSync(), undefined);
  }
});

test('invalid purpose is rejected', () => {
  const lead = new Lead({ ...baseLead(), purpose: 'Speculation' });
  const err = lead.validateSync();
  assert.ok(err && err.errors.purpose);
});

test('priority accepts Hot, Warm, Cold', () => {
  for (const value of ['Hot', 'Warm', 'Cold']) {
    const lead = new Lead({ ...baseLead(), priority: value });
    assert.equal(lead.validateSync(), undefined);
  }
});

test('invalid priority is rejected', () => {
  const lead = new Lead({ ...baseLead(), priority: 'Lukewarm' });
  const err = lead.validateSync();
  assert.ok(err && err.errors.priority);
});

test('priority defaults to Cold for a new lead', () => {
  const lead = new Lead(baseLead());
  assert.equal(lead.priority, 'Cold');
});

test('captureDate is populated by default for a new lead', () => {
  const lead = new Lead(baseLead());
  assert.ok(lead.captureDate instanceof Date);
});

test('followUpDate can store an exact date + time', () => {
  const dt = new Date('2026-09-20T14:30:00.000Z');
  const lead = new Lead({ ...baseLead(), followUpDate: dt });
  assert.equal(lead.followUpDate.getTime(), dt.getTime());
});

test('lastCallDetails accepts a date/time and discussion text', () => {
  const dt = new Date();
  const lead = new Lead({ ...baseLead(), lastCallDetails: { dateTime: dt, discussion: 'Follow up next week' } });
  assert.equal(lead.lastCallDetails.discussion, 'Follow up next week');
  assert.equal(lead.lastCallDetails.dateTime.getTime(), dt.getTime());
});

test('callHistory is declared on the schema and accepts entries', () => {
  assert.ok(Lead.schema.path('callHistory'), 'callHistory must be a declared schema path');
  const lead = new Lead(baseLead());
  lead.callHistory.push({ status: 'Called', notes: 'First contact', updatedAt: new Date() });
  const err = lead.validateSync();
  assert.equal(err, undefined);
  assert.equal(lead.callHistory.length, 1);
  assert.equal(lead.callHistory[0].status, 'Called');
});

test('siteVisits can persist a planned visit', () => {
  const lead = new Lead(baseLead());
  lead.siteVisits.push({ status: 'planned', plannedDate: new Date('2026-10-01') });
  const err = lead.validateSync();
  assert.equal(err, undefined);
  assert.equal(lead.siteVisits[0].status, 'planned');
  assert.ok(lead.siteVisits[0].plannedDate instanceof Date);
});

test('siteVisits can persist a completed visit', () => {
  const lead = new Lead(baseLead());
  lead.siteVisits.push({ status: 'completed', completedDate: new Date('2026-09-05') });
  const err = lead.validateSync();
  assert.equal(err, undefined);
  assert.equal(lead.siteVisits[0].status, 'completed');
  assert.ok(lead.siteVisits[0].completedDate instanceof Date);
});

test('invalid siteVisits status is rejected', () => {
  const lead = new Lead(baseLead());
  lead.siteVisits.push({ status: 'rescheduled' });
  const err = lead.validateSync();
  assert.ok(err, 'expected validation error for invalid site visit status');
});

test('all existing status enum values remain valid, including Booked', () => {
  const statuses = [
    'New','Allocated','Called','Follow Up',
    'Site Visit Planned','Site Visit Done',
    'Interested','Negotiation','Booked',
    'Wrong Number','Not Interested','Closed',
  ];
  for (const status of statuses) {
    const lead = new Lead({ ...baseLead(), status });
    assert.equal(lead.validateSync(), undefined, `status "${status}" should be valid`);
  }
});

test('existing lead structure (pre-Phase-B shape) remains backward compatible', () => {
  // Simulates a document as it existed before Phase B — none of the
  // new fields present.
  const legacyLeadData = {
    name: 'Legacy Lead',
    phone: '9998887776',
    email: 'legacy@example.com',
    source: 'Referral',
    status: 'Follow Up',
    notes: 'Old notes field',
    propertyInterest: '3 BHK Apartment',
    budget: '50-70L',
    followUpDate: new Date(),
  };
  const lead = new Lead(legacyLeadData);
  const err = lead.validateSync();
  assert.equal(err, undefined);
  // New fields should have safe defaults, not break the doc
  assert.equal(lead.leadId, null);
  assert.equal(lead.priority, 'Cold');
  assert.deepEqual(lead.callHistory, []);
  assert.deepEqual(lead.siteVisits, []);
});

test('mongoose connection is not opened by this suite', () => {
  // readyState 0 = disconnected. If this is ever non-zero, some test
  // accidentally opened a real DB connection — that must never happen
  // in this file.
  assert.equal(mongoose.connection.readyState, 0);
});
