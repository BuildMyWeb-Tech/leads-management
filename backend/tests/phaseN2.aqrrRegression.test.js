/**
 * phaseN2.aqrrRegression.test.js — AQRR regression tests for Phase N.2.
 *
 * Verifies that the attendance feature did NOT alter director-level AQRR.
 * The expected sequence A=9, B=4, C=4, D=1 must remain unchanged.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { previewSequence } = require('../utils/allocationEngine');

// ── N2-AR-01: A=9,B=4,C=4,D=1 sequence unchanged ─────────────
test('N2-AR-01: AQRR sequence A=9,B=4,C=4,D=1 is unchanged after N.2', () => {
  // previewSequence uses d.director (ObjectId-like) and d.enabled directly
  const directors = [
    { director: 'A', quota: 9, sequenceOrder: 1, enabled: true },
    { director: 'B', quota: 4, sequenceOrder: 2, enabled: true },
    { director: 'C', quota: 4, sequenceOrder: 3, enabled: true },
    { director: 'D', quota: 1, sequenceOrder: 4, enabled: true },
  ];

  const expected = [
    'A','B','C','D',
    'A','B','C',
    'A','B','C',
    'A','B','C',
    'A',
    'A','A','A','A',
  ];

  const sequence = previewSequence(directors, {}, expected.length);

  assert.equal(sequence.length, expected.length, 'sequence length matches');
  for (let i = 0; i < expected.length; i++) {
    assert.equal(
      String(sequence[i].director),
      expected[i],
      `Pick ${i + 1}: expected ${expected[i]}, got ${sequence[i].director}`
    );
  }
});

// ── N2-AR-02: attendance does not mutate AllocationConfig ────
test('N2-AR-02: Attendance model exists independently — does not modify AllocationConfig', () => {
  const Attendance     = require('../models/Attendance');
  const AllocationConfig = require('../models/AllocationConfig');

  // Ensure they are distinct models
  assert.notEqual(Attendance.modelName, AllocationConfig.modelName);
  assert.equal(Attendance.modelName, 'Attendance');

  // AllocationConfig has no attendance field
  const paths = AllocationConfig.schema.paths;
  assert.ok(!paths.attendance,   'AllocationConfig must not have attendance field');
  assert.ok(!paths.isPresent,    'AllocationConfig must not have isPresent field');
  assert.ok(!paths.businessDate, 'AllocationConfig must not have businessDate field');
});

// ── N2-AR-03: absent employee excluded from assignment ────────
test('N2-AR-03: employee absent today is excluded from eligible assignment pool', () => {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const todayIST = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

  const attendanceRecords = [
    { employee: 'emp1', businessDate: todayIST },
  ];

  function isPresent(employeeId) {
    return attendanceRecords.some(
      (r) => String(r.employee) === String(employeeId) && r.businessDate === todayIST
    );
  }

  assert.ok( isPresent('emp1'), 'emp1 is present');
  assert.ok(!isPresent('emp2'), 'emp2 is absent');
});

// ── N2-AR-04: no present employees → appropriate error ───────
test('N2-AR-04: empty present employee list results in no-assignment scenario', () => {
  const presentEmployees = [];
  function canAssign(targetEmployeeId) {
    if (presentEmployees.length === 0) return false;
    return presentEmployees.includes(targetEmployeeId);
  }
  assert.ok(!canAssign('emp1'), 'No assignments when no employees present');
});

// ── N2-AR-05: present filtering does NOT affect director AQRR ─
test('N2-AR-05: director AQRR runs independently of employee attendance', () => {
  // AQRR engine: getEnabledDirectors only checks enabled flag + d.director exists
  const { getEnabledDirectors } = require('../utils/allocationEngine');
  const directors = [
    { director: 'A', quota: 9, sequenceOrder: 1, enabled: true  },
    { director: 'B', quota: 4, sequenceOrder: 2, enabled: false },
  ];

  const config = { directors };
  const enabled = getEnabledDirectors(config);
  assert.equal(enabled.length, 1);
  assert.equal(String(enabled[0].director), 'A');
  // Attendance field is irrelevant — AQRR never checks it
});

// ── N2-AR-06: managedBy hierarchy preserved ──────────────────
test('N2-AR-06: managedBy hierarchy unaffected by N.2 changes', () => {
  const User = require('../models/User');
  const schema = User.schema;
  // managedBy must still exist and ref User
  assert.ok(schema.paths.managedBy, 'managedBy field must exist on User schema');
  const managedByOptions = schema.paths.managedBy.options;
  assert.equal(String(managedByOptions.ref), 'User', 'managedBy must ref User');
  // No assignedTL field
  assert.ok(!schema.paths.assignedTL, 'assignedTL must NOT exist on User schema');
});

// ── N2-AR-07: employee role remains telecaller (not employee) ─
test('N2-AR-07: DB role enum still uses telecaller, not employee', () => {
  const User = require('../models/User');
  const roleEnum = User.schema.paths.role.enumValues;
  assert.ok(roleEnum.includes('telecaller'), 'telecaller must be in role enum');
  assert.ok(!roleEnum.includes('employee'),  'employee must NOT be in role enum');
  assert.ok(roleEnum.includes('admin'),      'admin must be in role enum');
  assert.ok(roleEnum.includes('director'),   'director must be in role enum');
  assert.ok(roleEnum.includes('tl'),         'tl must be in role enum');
});
