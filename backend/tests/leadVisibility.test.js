/**
 * leadVisibility.test.js — role-based Lead visibility filter.
 *
 * admin/director/telecaller/unknown-role branches need no database
 * (pure filter-object construction). The 'tl' branch's DB lookup
 * (which telecallers does this TL manage) is exercised via the
 * injectable `getManagedIdsFn` parameter with a fake, so no live
 * MongoDB connection is used anywhere in this file.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const { buildLeadVisibilityFilter } = require('../utils/leadVisibility');

const oid = () => new mongoose.Types.ObjectId();

test('admin sees everything (empty filter)', async () => {
  const filter = await buildLeadVisibilityFilter({ role: 'admin', _id: oid() });
  assert.deepEqual(filter, {});
});

test('director is scoped to their own assignedDirector leads (unchanged from pre-Phase-C)', async () => {
  const directorId = oid();
  const filter = await buildLeadVisibilityFilter({ role: 'director', _id: directorId });
  assert.deepEqual(filter, { assignedDirector: directorId });
});

test('telecaller is scoped to their own assignedTelecaller leads (unchanged from pre-Phase-C)', async () => {
  const tcId = oid();
  const filter = await buildLeadVisibilityFilter({ role: 'telecaller', _id: tcId });
  assert.deepEqual(filter, { assignedTelecaller: tcId });
});

test('tl is scoped to leads of telecallers they manage', async () => {
  const tlId = oid();
  const managedTc1 = oid();
  const managedTc2 = oid();
  const fakeGetManagedIds = async (id) => {
    assert.equal(String(id), String(tlId));
    return [managedTc1, managedTc2];
  };
  const filter = await buildLeadVisibilityFilter({ role: 'tl', _id: tlId }, fakeGetManagedIds);
  assert.deepEqual(filter, { assignedTelecaller: { $in: [managedTc1, managedTc2] } });
});

test('a tl managing nobody sees no leads (fails safe, not open)', async () => {
  const tlId = oid();
  const fakeGetManagedIds = async () => [];
  const filter = await buildLeadVisibilityFilter({ role: 'tl', _id: tlId }, fakeGetManagedIds);
  assert.deepEqual(filter, { assignedTelecaller: { $in: [] } });
});

test('an unrecognised role fails safe (sees nothing, never everything)', async () => {
  const filter = await buildLeadVisibilityFilter({ role: 'guest', _id: oid() });
  assert.deepEqual(filter, { _id: null });
});
