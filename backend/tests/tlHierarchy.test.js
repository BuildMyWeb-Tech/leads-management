/**
 * tlHierarchy.test.js — Phase C: full Director -> TL -> Telecaller
 * chain construction. Role-level validity (tl accepted, managedBy
 * optional, invalid role rejected) is already covered in
 * user.schema.test.js (Phase B) — this file adds the full 3-level
 * chain scenario Phase C introduces, plus confirms existing users
 * with no managedBy at all keep working unchanged.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const User = require('../models/User');

const baseUser = (overrides = {}) => ({
  name: 'Test User',
  email: `test-${Math.random().toString(36).slice(2)}@example.com`,
  password: 'Password@123',
  ...overrides,
});

test('full Director -> TL -> Telecaller chain validates end to end', () => {
  const directorId = new mongoose.Types.ObjectId();
  const director = new User(baseUser({ _id: directorId, role: 'director', managedBy: null }));
  assert.equal(director.validateSync(), undefined);

  const tlId = new mongoose.Types.ObjectId();
  const tl = new User(baseUser({ _id: tlId, role: 'tl', managedBy: directorId }));
  assert.equal(tl.validateSync(), undefined);
  assert.equal(tl.managedBy.toString(), directorId.toString());

  const telecaller = new User(baseUser({ role: 'telecaller', managedBy: tlId }));
  assert.equal(telecaller.validateSync(), undefined);
  assert.equal(telecaller.managedBy.toString(), tlId.toString());
});

test('a pre-existing telecaller with no managedBy at all remains valid (not required)', () => {
  const legacyTelecaller = new User(baseUser({ role: 'telecaller' }));
  assert.equal(legacyTelecaller.managedBy, null);
  assert.equal(legacyTelecaller.validateSync(), undefined);
});

test('a pre-existing director is not required to have managedBy null explicitly set', () => {
  const legacyDirector = new User({
    name: 'Existing Director',
    email: 'existing-director@example.com',
    password: 'Password@123',
    role: 'director',
  });
  assert.equal(legacyDirector.managedBy, null);
  assert.equal(legacyDirector.validateSync(), undefined);
});
