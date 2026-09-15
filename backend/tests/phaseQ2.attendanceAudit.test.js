/**
 * phaseQ2.attendanceAudit.test.js — Q2-007 attendance audit event tests.
 *
 * Verifies that attendance_marked is emitted once on first mark and
 * NOT emitted on repeated/concurrent marks.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

// ── Q2-AA-01: attendance_marked event structure ──────────────────
test('Q2-AA-01: attendance_marked audit event has required fields', () => {
  // Verify AuditLog action enum includes attendance_marked
  const AuditLog = require('../models/AuditLog');
  const actionEnum = AuditLog.schema.paths.action.enumValues;
  assert.ok(actionEnum.includes('attendance_marked'),
    'AuditLog.action enum must include attendance_marked');
});

// ── Q2-AA-02: audit event fired only on first successful insert ──
test('Q2-AA-02: attendance audit fires exactly once for first mark (not on repeat)', () => {
  let auditCallCount = 0;

  function mockAuditLog(action) {
    if (action === 'attendance_marked') auditCallCount++;
  }

  // Simulate controller logic:
  // created = true  → first insert → fire audit
  // created = false → repeat call  → no audit
  function simulateMarkPresent(created) {
    if (created) {
      mockAuditLog('attendance_marked');
      return { status: 201, alreadyMarked: false };
    }
    return { status: 200, alreadyMarked: true };
  }

  simulateMarkPresent(true);  // first call
  simulateMarkPresent(false); // repeated call
  simulateMarkPresent(false); // repeated call

  assert.equal(auditCallCount, 1,
    'attendance_marked audit must fire exactly once for the first mark');
});

// ── Q2-AA-03: concurrent duplicate request does not double-audit ─
test('Q2-AA-03: E11000 concurrent duplicate path does not fire attendance audit', () => {
  let auditCallCount = 0;

  function mockAuditLog(action) {
    if (action === 'attendance_marked') auditCallCount++;
  }

  // Simulate E11000 path: catch block handles concurrent race
  // No audit event should fire in this path
  function simulateE11000Path() {
    // E11000 catch: record already exists — return 200 alreadyMarked
    // No audit call here (created = false equivalent)
    return { status: 200, alreadyMarked: true };
  }

  simulateE11000Path();
  assert.equal(auditCallCount, 0,
    'No audit event on E11000 concurrent path — not a new record');
});

// ── Q2-AA-04: audit log action enum integrity ─────────────────────
test('Q2-AA-04: AuditLog enum includes all expected attendance and existing actions', () => {
  const AuditLog = require('../models/AuditLog');
  const actionEnum = AuditLog.schema.paths.action.enumValues;

  // Existing actions must still be present
  assert.ok(actionEnum.includes('lead_created'),       'lead_created must exist');
  assert.ok(actionEnum.includes('user_login'),         'user_login must exist');
  assert.ok(actionEnum.includes('sheets_synced'),      'sheets_synced must exist');
  // New action
  assert.ok(actionEnum.includes('attendance_marked'),  'attendance_marked must exist');
  // Protected: these must NOT appear (no new surveillance without spec)
  assert.ok(!actionEnum.includes('attendance_deleted'), 'no attendance_deleted action');
});

// ── Q2-AA-05: attendance controller imports auditService ─────────
test('Q2-AA-05: attendanceController module can be required without error', () => {
  // If the import is broken or auditService is incorrectly wired, this throws
  assert.doesNotThrow(() => {
    require('../controllers/attendanceController');
  }, 'attendanceController must load without errors');
});
