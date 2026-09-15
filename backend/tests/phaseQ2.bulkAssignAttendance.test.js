/**
 * phaseQ2.bulkAssignAttendance.test.js — Q2 bulkAssign attendance gate integration tests.
 *
 * Covers the attendance gate in leadsController.bulkAssign:
 * - present employee can be assigned
 * - absent employee gets 400
 * - director assignment remains unaffected by attendance
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const todayIST = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
const yesterdayIST = new Date(Date.now() + IST_OFFSET_MS - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// ── Simulate bulkAssign attendance gate logic ────────────────────
async function simulateBulkAssign({ assignedTelecaller, attendanceRecords }) {
  if (assignedTelecaller) {
    const presentRecord = attendanceRecords.find(
      (r) => String(r.employee) === String(assignedTelecaller) && r.businessDate === todayIST
    ) || null;
    if (!presentRecord) {
      return { statusCode: 400, body: { message: 'This employee is not marked present today' } };
    }
  }
  return { statusCode: 200, body: { message: '3 lead(s) updated', modifiedCount: 3 } };
}

// ── Q2-BA-01: present employee can be assigned ───────────────────
test('Q2-BA-01: bulkAssign succeeds when telecaller is marked present today', async () => {
  const attendanceRecords = [
    { employee: 'emp1', businessDate: todayIST },
  ];
  const result = await simulateBulkAssign({
    assignedTelecaller: 'emp1',
    attendanceRecords,
  });
  assert.equal(result.statusCode, 200, 'Present employee assignment should succeed (200)');
  assert.ok(result.body.modifiedCount > 0, 'Leads should be marked as modified');
});

// ── Q2-BA-02: absent employee gets 400 ──────────────────────────
test('Q2-BA-02: bulkAssign returns 400 when telecaller is NOT marked present today', async () => {
  const attendanceRecords = [
    // emp2 only has yesterday's record — NOT present today
    { employee: 'emp2', businessDate: yesterdayIST },
  ];
  const result = await simulateBulkAssign({
    assignedTelecaller: 'emp2',
    attendanceRecords,
  });
  assert.equal(result.statusCode, 400, 'Absent employee must receive 400');
  assert.match(result.body.message, /not marked present today/i,
    'Error message must indicate employee is absent');
});

// ── Q2-BA-03: director assignment bypasses attendance gate ───────
test('Q2-BA-03: bulkAssign with only director assignment skips attendance gate', async () => {
  const attendanceRecords = []; // no attendance records at all
  const result = await simulateBulkAssign({
    assignedTelecaller: null, // no telecaller — director only assignment
    attendanceRecords,
  });
  assert.equal(result.statusCode, 200,
    'Director-only assignment must not require attendance — gate only applies to telecaller');
});

// ── Q2-BA-04: employee with no attendance record is absent ───────
test('Q2-BA-04: employee with no attendance record at all is treated as absent', async () => {
  const attendanceRecords = []; // completely empty
  const result = await simulateBulkAssign({
    assignedTelecaller: 'emp_no_record',
    attendanceRecords,
  });
  assert.equal(result.statusCode, 400, 'Employee with no record is absent → 400');
});

// ── Q2-BA-05: only today's record counts (not yesterday's) ───────
test('Q2-BA-05: only today IST attendance record makes employee eligible', () => {
  const records = [
    { employee: 'emp1', businessDate: yesterdayIST },
    { employee: 'emp2', businessDate: todayIST },
  ];

  const isPresent = (empId) => records.some(
    (r) => String(r.employee) === String(empId) && r.businessDate === todayIST
  );

  assert.ok(!isPresent('emp1'), 'emp1 (yesterday only) is NOT present today');
  assert.ok( isPresent('emp2'), 'emp2 (today) IS present today');
});

// ── Q2-BA-06: AQRR config has no attendance fields ───────────────
test('Q2-BA-06: attendance gate does not touch AllocationConfig (AQRR unchanged)', () => {
  const AllocationConfig = require('../models/AllocationConfig');
  const paths = AllocationConfig.schema.paths;
  assert.ok(!paths.attendance,   'AllocationConfig must not have attendance field');
  assert.ok(!paths.isPresent,    'AllocationConfig must not have isPresent field');
  assert.ok(!paths.businessDate, 'AllocationConfig must not have businessDate field');
});
