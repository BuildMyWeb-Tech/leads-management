/**
 * priorityRanking.test.js — dashboard ordering support (backend only,
 * no UI). Verifies rank order matches the client spec and that the
 * comparator/sort helper produce a deterministic, correctly ordered
 * result.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getPriorityRank, sortLeadsByPriority, RANK } = require('../utils/priorityRanking');

const NOW = new Date('2026-09-08T12:00:00.000Z');

test('Booked outranks everything, including a Hot lead', () => {
  const booked = { status: 'Booked', priority: 'Warm' };
  const hot    = { status: 'Interested', priority: 'Hot' };
  assert.equal(getPriorityRank(booked), RANK.BOOKED);
  assert.ok(getPriorityRank(booked) < getPriorityRank(hot));
});

test('Hot outranks a completed-site-visit Warm lead', () => {
  const hot = { status: 'Interested', priority: 'Hot' };
  const completedVisitWarm = { status: 'Site Visit Done', priority: 'Warm' };
  assert.ok(getPriorityRank(hot) < getPriorityRank(completedVisitWarm));
});

test('a completed site visit outranks an upcoming (planned) site visit', () => {
  const completed = { status: 'Site Visit Done', priority: 'Cold' };
  const planned    = { status: 'Site Visit Planned', priority: 'Cold' };
  assert.ok(getPriorityRank(completed) < getPriorityRank(planned));
});

test('an upcoming site visit outranks plain Warm', () => {
  const planned = { status: 'Site Visit Planned', priority: 'Cold' };
  const warm     = { status: 'Interested', priority: 'Warm' };
  assert.ok(getPriorityRank(planned) < getPriorityRank(warm));
});

test('Warm outranks Cold', () => {
  const warm = { status: 'Interested', priority: 'Warm' };
  const cold = { status: 'New', priority: 'Cold' };
  assert.ok(getPriorityRank(warm) < getPriorityRank(cold));
});

test('siteVisits array entries are also recognised (not just legacy status strings)', () => {
  const completedViaArray = { status: 'Interested', priority: 'Cold', siteVisits: [{ status: 'completed' }] };
  const plannedViaArray   = { status: 'Interested', priority: 'Cold', siteVisits: [{ status: 'planned' }] };
  assert.equal(getPriorityRank(completedViaArray), RANK.COMPLETED_VISIT);
  assert.equal(getPriorityRank(plannedViaArray), RANK.UPCOMING_VISIT);
});

test('full dashboard ordering matches the client spec end to end', () => {
  const leads = [
    { _id: 'cold',      status: 'New',               priority: 'Cold' },
    { _id: 'warm',      status: 'Interested',        priority: 'Warm' },
    { _id: 'upcoming',  status: 'Site Visit Planned', priority: 'Cold' },
    { _id: 'completed', status: 'Site Visit Done',    priority: 'Cold' },
    { _id: 'hot',       status: 'Interested',        priority: 'Hot' },
    { _id: 'booked',    status: 'Booked',            priority: 'Hot' },
  ];
  const sorted = sortLeadsByPriority(leads, NOW).map((l) => l._id);
  assert.deepEqual(sorted, ['booked', 'hot', 'completed', 'upcoming', 'warm', 'cold']);
});

test('tie-breaker: within the same rank, an overdue follow-up sorts first', () => {
  const overdue  = { _id: 'overdue',  status: 'Follow Up', priority: 'Warm', followUpDate: new Date('2026-09-01T00:00:00.000Z') };
  const upcoming = { _id: 'upcoming', status: 'Follow Up', priority: 'Warm', followUpDate: new Date('2026-09-20T00:00:00.000Z') };
  const sorted = sortLeadsByPriority([upcoming, overdue], NOW).map((l) => l._id);
  assert.deepEqual(sorted, ['overdue', 'upcoming']);
});

test('tie-breaker: within the same rank and overdue-state, earlier followUpDate sorts first', () => {
  const later   = { _id: 'later',   status: 'Interested', priority: 'Warm', followUpDate: new Date('2026-09-25T00:00:00.000Z') };
  const earlier = { _id: 'earlier', status: 'Interested', priority: 'Warm', followUpDate: new Date('2026-09-15T00:00:00.000Z') };
  const sorted = sortLeadsByPriority([later, earlier], NOW).map((l) => l._id);
  assert.deepEqual(sorted, ['earlier', 'later']);
});

test('sortLeadsByPriority does not mutate the input array', () => {
  const leads = [
    { _id: 'a', status: 'New', priority: 'Cold' },
    { _id: 'b', status: 'Booked', priority: 'Hot' },
  ];
  const original = [...leads];
  sortLeadsByPriority(leads, NOW);
  assert.deepEqual(leads, original);
});
