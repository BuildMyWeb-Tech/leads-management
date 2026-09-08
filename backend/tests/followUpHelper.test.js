/**
 * followUpHelper.test.js — overdue/upcoming follow-up computation.
 * Pure functions, no database, no mongoose document needed (plain
 * objects with the relevant shape are enough).
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isFollowUpOverdue, isFollowUpUpcoming } = require('../utils/followUpHelper');

const NOW = new Date('2026-09-08T12:00:00.000Z');

test('a past followUpDate on a Follow Up lead is overdue', () => {
  const lead = { status: 'Follow Up', followUpDate: new Date('2026-09-01T00:00:00.000Z') };
  assert.equal(isFollowUpOverdue(lead, NOW), true);
});

test('a future followUpDate on a Follow Up lead is NOT overdue', () => {
  const lead = { status: 'Follow Up', followUpDate: new Date('2026-09-20T00:00:00.000Z') };
  assert.equal(isFollowUpOverdue(lead, NOW), false);
});

test('a lead with no followUpDate is never overdue', () => {
  const lead = { status: 'Follow Up', followUpDate: null };
  assert.equal(isFollowUpOverdue(lead, NOW), false);
});

test('a past followUpDate on a lead NOT in Follow Up status is not counted as overdue', () => {
  const lead = { status: 'Booked', followUpDate: new Date('2026-01-01T00:00:00.000Z') };
  assert.equal(isFollowUpOverdue(lead, NOW), false);
});

test('a future followUpDate is upcoming', () => {
  const lead = { followUpDate: new Date('2026-09-20T00:00:00.000Z') };
  assert.equal(isFollowUpUpcoming(lead, NOW), true);
});

test('a past followUpDate is not upcoming', () => {
  const lead = { followUpDate: new Date('2026-01-01T00:00:00.000Z') };
  assert.equal(isFollowUpUpcoming(lead, NOW), false);
});

test('exact date+time boundary is respected (not just the date part)', () => {
  const justBefore = { status: 'Follow Up', followUpDate: new Date('2026-09-08T11:59:59.000Z') };
  const justAfter  = { status: 'Follow Up', followUpDate: new Date('2026-09-08T12:00:01.000Z') };
  assert.equal(isFollowUpOverdue(justBefore, NOW), true);
  assert.equal(isFollowUpOverdue(justAfter, NOW), false);
});
