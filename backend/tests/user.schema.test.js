/**
 * user.schema.test.js — Phase B User schema validation tests.
 * Uses validateSync() only — no database connection opened.
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

test('admin role remains valid', () => {
  const user = new User(baseUser({ role: 'admin' }));
  assert.equal(user.validateSync(), undefined);
});

test('director role remains valid', () => {
  const user = new User(baseUser({ role: 'director' }));
  assert.equal(user.validateSync(), undefined);
});

test('telecaller role remains valid', () => {
  const user = new User(baseUser({ role: 'telecaller' }));
  assert.equal(user.validateSync(), undefined);
});

test('tl role is accepted (new role, not a director rename)', () => {
  const user = new User(baseUser({ role: 'tl' }));
  assert.equal(user.validateSync(), undefined);
});

test('invalid role is rejected', () => {
  const user = new User(baseUser({ role: 'manager' }));
  const err = user.validateSync();
  assert.ok(err && err.errors.role, 'expected "manager" to be rejected — it is not a valid role');
});

test('managedBy is optional — existing users without it remain valid', () => {
  const user = new User(baseUser({ role: 'director' }));
  assert.equal(user.managedBy, null);
  assert.equal(user.validateSync(), undefined);
});

test('a TL can reference a Director via managedBy', () => {
  const directorId = new mongoose.Types.ObjectId();
  const tl = new User(baseUser({ role: 'tl', managedBy: directorId }));
  const err = tl.validateSync();
  assert.equal(err, undefined);
  assert.equal(tl.managedBy.toString(), directorId.toString());
});

test('a Telecaller can reference a TL via managedBy', () => {
  const tlId = new mongoose.Types.ObjectId();
  const telecaller = new User(baseUser({ role: 'telecaller', managedBy: tlId }));
  const err = telecaller.validateSync();
  assert.equal(err, undefined);
  assert.equal(telecaller.managedBy.toString(), tlId.toString());
});

test('mongoose connection is not opened by this suite', () => {
  assert.equal(mongoose.connection.readyState, 0);
});
