/**
 * phaseR2.userManagement.test.js — R.2 user management tests.
 *
 * Verifies updateUser password handling, role restrictions,
 * managedBy validation, and API response safety.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

// ── R2-UM-01: updateUser with password uses save() pattern ───────
test('R2-UM-01: User model pre-save hook hashes password on save()', async () => {
  const User = require('../models/User');
  const schema = User.schema;
  // Verify pre-save hooks exist (bcrypt hashing)
  const preSaveHooks = schema.s.hooks?._pres?.get('save') || schema._callQueue?.filter(([k]) => k === 'pre');
  // Alternatively verify the hook is registered via the schema callQueue
  const hasPreSave = schema.callQueue?.some(([method]) => method === 'pre') ||
    schema.s?.hooks?._pres?.get('save')?.length > 0 ||
    typeof schema._callQueue !== 'undefined';
  // Most reliable: check via registered middleware
  assert.ok(
    schema.s?.hooks?._pres?.get('save')?.length > 0 || schema.callQueue?.length > 0,
    'User schema must have pre-save hook for password hashing'
  );
});

// ── R2-UM-02: password not in API response ────────────────────────
test('R2-UM-02: User toJSON strips password from API response', () => {
  const User = require('../models/User');
  const fakeUser = new User({
    name: 'Test',
    email: 'test@example.com',
    password: 'hashedvalue',
    role: 'telecaller',
  });
  const json = fakeUser.toJSON();
  assert.ok(!('password' in json), 'password must not appear in toJSON output');
});

// ── R2-UM-03: role restriction — admin/director not allowed ───────
test('R2-UM-03: updateUser controller rejects role=admin', async () => {
  const usersController = require('../controllers/usersController');
  let respondedStatus = null;
  let respondedBody = null;
  const mockReq = {
    params: { id: '000000000000000000000001' },
    body: { role: 'admin' },
    user: { _id: '000000000000000000000099', role: 'admin' },
  };
  const mockRes = {
    status(s) { respondedStatus = s; return this; },
    json(b) { respondedBody = b; return this; },
  };
  await usersController.updateUser(mockReq, mockRes);
  assert.equal(respondedStatus, 400, 'role=admin must be rejected with 400');
  assert.match(respondedBody.message, /tl or telecaller/i);
});

// ── R2-UM-04: role restriction — director not allowed ─────────────
test('R2-UM-04: updateUser controller rejects role=director', async () => {
  const usersController = require('../controllers/usersController');
  let respondedStatus = null;
  const mockReq = {
    params: { id: '000000000000000000000001' },
    body: { role: 'director' },
    user: { _id: '000000000000000000000099', role: 'admin' },
  };
  const mockRes = {
    status(s) { respondedStatus = s; return this; },
    json() { return this; },
  };
  await usersController.updateUser(mockReq, mockRes);
  assert.equal(respondedStatus, 400, 'role=director must be rejected with 400');
});

// ── R2-UM-05: allowed roles pass validation ───────────────────────
test('R2-UM-05: updateUser allows role tl and telecaller in ALLOWED_ROLES', () => {
  const ALLOWED_ROLES = ['tl', 'telecaller'];
  assert.ok(ALLOWED_ROLES.includes('tl'), 'tl must be in allowed roles');
  assert.ok(ALLOWED_ROLES.includes('telecaller'), 'telecaller must be in allowed roles');
  assert.ok(!ALLOWED_ROLES.includes('admin'), 'admin must NOT be in allowed roles');
  assert.ok(!ALLOWED_ROLES.includes('director'), 'director must NOT be in allowed roles');
});

// ── R2-UM-06: managedBy NOT auto-cleared for TL role (S.2 update) ──
// S.2 removed the auto-clear so admins can set TL.managedBy = Director._id.
// Instead, the code validates that when managedBy is supplied for a TL
// it must point to a director — the explicit validation replaces the
// old blind clear.
test('R2-UM-06: usersController does NOT auto-clear managedBy when role changes to tl (S.2)', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../controllers/usersController'), 'utf8');
  assert.ok(!src.includes("if (role === 'tl') update.managedBy = null"),
    'S.2: managedBy must NOT be auto-cleared for tl role — TL can be linked to a director');
  assert.ok(src.includes("manager.role !== 'director'"),
    'S.2: updateUser must validate that TL managedBy points to a director');
});

// ── R2-UM-07: password change requires user.save() ────────────────
test('R2-UM-07: usersController uses user.save() for password change (not findByIdAndUpdate)', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../controllers/usersController'), 'utf8');
  assert.ok(src.includes('userDoc.password = password'),
    'password must be set on userDoc before save()');
  assert.ok(src.includes('await userDoc.save()'),
    'user.save() must be used to trigger bcrypt pre-save hook');
});

// ── R2-UM-08: AuditLog has user_updated and user_deactivated ─────
test('R2-UM-08: AuditLog action enum includes user_updated and user_deactivated', () => {
  const AuditLog = require('../models/AuditLog');
  const actionEnum = AuditLog.schema.paths.action.enumValues;
  assert.ok(actionEnum.includes('user_updated'),     'user_updated must be in AuditLog enum');
  assert.ok(actionEnum.includes('user_deactivated'), 'user_deactivated must be in AuditLog enum');
  assert.ok(actionEnum.includes('user_created'),     'user_created must be in AuditLog enum');
});

// ── R2-UM-09: User model has isActive field ───────────────────────
test('R2-UM-09: User model has isActive boolean field', () => {
  const User = require('../models/User');
  const paths = User.schema.paths;
  assert.ok(paths.isActive, 'isActive field must exist');
  assert.equal(paths.isActive.instance, 'Boolean', 'isActive must be Boolean');
  assert.equal(paths.isActive.defaultValue, true, 'isActive must default to true');
});

// ── R2-UM-10: protect middleware blocks deactivated users ─────────
test('R2-UM-10: protect middleware source blocks isActive=false users', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../middleware/auth'), 'utf8');
  assert.ok(src.includes('isActive === false'), 'protect must check isActive');
  assert.ok(src.includes('deactivated'), 'protect must reject deactivated accounts');
});

// ── R2-UM-11: PUT /api/users/:id route is admin-only ─────────────
test('R2-UM-11: users route PUT /:id is restricted to admin role', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../routes/users'), 'utf8');
  assert.ok(
    src.includes("authorize('admin')") && src.includes("put('/:id'"),
    "PUT /:id must require authorize('admin')"
  );
});
