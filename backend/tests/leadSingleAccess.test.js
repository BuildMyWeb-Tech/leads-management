/**
 * leadSingleAccess.test.js — Phase C security fix: GET /api/leads/:id
 * must respect the same role-based visibility as the list endpoints.
 *
 * The controller (leadsController.getLead) does:
 *   Lead.findOne({ _id: req.params.id, ...await buildLeadVisibilityFilter(req.user) })
 *
 * This suite does NOT reimplement access-control logic — it exercises
 * the REAL buildLeadVisibilityFilter() from utils/leadVisibility.js
 * (the same function the controller calls) and combines its result
 * with an `_id` constraint exactly like the controller does. A tiny
 * in-memory matcher then interprets ONLY the handful of filter shapes
 * that function is capable of producing ({}, {assignedDirector},
 * {assignedTelecaller}, {assignedTelecaller:{$in}}, {_id:null}) — it
 * makes no access decisions of its own, it just simulates what
 * MongoDB would match for that filter shape. No database connection
 * is used.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const { buildLeadVisibilityFilter } = require('../utils/leadVisibility');

const oid = () => new mongoose.Types.ObjectId();
const eq = (a, b) => String(a) === String(b);

// Interprets the specific filter shapes buildLeadVisibilityFilter can
// return, combined with the controller's `_id` constraint, against a
// single candidate lead. This mirrors MongoDB's own matching for
// those shapes — it is not a second copy of the visibility RULES.
const matchesFilter = (lead, filter) => {
  if (filter._id === null) return false; // fail-safe deny-all shape
  if (String(filter._id) !== String(lead._id)) return false;
  if (filter.assignedDirector !== undefined) {
    return eq(lead.assignedDirector, filter.assignedDirector);
  }
  if (filter.assignedTelecaller !== undefined) {
    if (filter.assignedTelecaller && filter.assignedTelecaller.$in) {
      return filter.assignedTelecaller.$in.some((id) => eq(id, lead.assignedTelecaller));
    }
    return eq(lead.assignedTelecaller, filter.assignedTelecaller);
  }
  return true; // {} (admin) — id already matched above
};

// Simulates exactly what the controller does for a given actor
// fetching a given lead: build the real filter, merge with _id, check
// whether the lead would be returned.
const canAccessLead = async (user, lead, getManagedIdsFn) => {
  const filter = await buildLeadVisibilityFilter(user, getManagedIdsFn);
  const combined = { _id: lead._id, ...filter };
  return matchesFilter(lead, combined);
};

test('admin can retrieve any lead', async () => {
  const admin = { role: 'admin', _id: oid() };
  const lead  = { _id: oid(), assignedDirector: oid(), assignedTelecaller: oid() };
  assert.equal(await canAccessLead(admin, lead), true);
});

test('director can retrieve a lead within their scope', async () => {
  const directorId = oid();
  const director = { role: 'director', _id: directorId };
  const lead = { _id: oid(), assignedDirector: directorId, assignedTelecaller: oid() };
  assert.equal(await canAccessLead(director, lead), true);
});

test('director cannot retrieve another director\'s lead', async () => {
  const director = { role: 'director', _id: oid() };
  const otherDirectorsLead = { _id: oid(), assignedDirector: oid(), assignedTelecaller: oid() };
  assert.equal(await canAccessLead(director, otherDirectorsLead), false);
});

test('TL can retrieve a lead assigned to a telecaller they manage', async () => {
  const tlId = oid();
  const managedTcId = oid();
  const tl = { role: 'tl', _id: tlId };
  const lead = { _id: oid(), assignedTelecaller: managedTcId };
  const fakeGetManagedIds = async () => [managedTcId];
  assert.equal(await canAccessLead(tl, lead, fakeGetManagedIds), true);
});

test('TL cannot retrieve a lead belonging to another TL\'s team', async () => {
  const tlId = oid();
  const managedTcId = oid();
  const otherTeamsTcId = oid();
  const tl = { role: 'tl', _id: tlId };
  const otherTeamsLead = { _id: oid(), assignedTelecaller: otherTeamsTcId };
  const fakeGetManagedIds = async () => [managedTcId]; // does NOT include otherTeamsTcId
  assert.equal(await canAccessLead(tl, otherTeamsLead, fakeGetManagedIds), false);
});

test('telecaller can retrieve their own assigned lead', async () => {
  const tcId = oid();
  const telecaller = { role: 'telecaller', _id: tcId };
  const lead = { _id: oid(), assignedTelecaller: tcId };
  assert.equal(await canAccessLead(telecaller, lead), true);
});

test('telecaller cannot retrieve another telecaller\'s lead', async () => {
  const telecaller = { role: 'telecaller', _id: oid() };
  const othersLead = { _id: oid(), assignedTelecaller: oid() };
  assert.equal(await canAccessLead(telecaller, othersLead), false);
});

test('an unrecognised role is denied access to any lead (fail-safe)', async () => {
  const guest = { role: 'guest', _id: oid() };
  const anyLead = { _id: oid(), assignedDirector: oid(), assignedTelecaller: oid() };
  assert.equal(await canAccessLead(guest, anyLead), false);
});

test('a TL managing nobody cannot access any lead', async () => {
  const tl = { role: 'tl', _id: oid() };
  const someLead = { _id: oid(), assignedTelecaller: oid() };
  const fakeGetManagedIds = async () => [];
  assert.equal(await canAccessLead(tl, someLead, fakeGetManagedIds), false);
});
