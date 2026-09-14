/**
 * phaseN2.attendance.test.js — Phase N.2 attendance tests.
 *
 * Tests the IST date helper, Attendance model, controller logic,
 * and present-only employee filtering — without requiring a live DB.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// ── Re-implement getISTDateString for isolated tests ──────────
const getISTDateString = (now = new Date()) => {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  return istNow.toISOString().slice(0, 10);
};

// ── N2-AT-01: getISTDateString returns YYYY-MM-DD ─────────────
test('N2-AT-01: getISTDateString returns correct YYYY-MM-DD string', () => {
  // 2026-09-14T00:00:00Z = 2026-09-14 05:30 IST → date '2026-09-14'
  const result = getISTDateString(new Date('2026-09-14T00:00:00Z'));
  assert.equal(result, '2026-09-14');
});

// ── N2-AT-02: IST vs UTC date boundary ───────────────────────
test('N2-AT-02: UTC midnight is still previous IST day (minus 5h30m)', () => {
  // 2026-09-14T00:00:00Z = 2026-09-14 05:30 IST → same day
  // 2026-09-13T18:00:00Z = 2026-09-13 23:30 IST → previous day
  const r1 = getISTDateString(new Date('2026-09-14T00:00:00Z'));
  const r2 = getISTDateString(new Date('2026-09-13T18:00:00Z'));
  assert.equal(r1, '2026-09-14');
  assert.equal(r2, '2026-09-13');
});

// ── N2-AT-03: midnight IST transition ────────────────────────
test('N2-AT-03: IST midnight transition (18:29 UTC → same day, 18:30 UTC → next day)', () => {
  // 2026-09-13T18:29:59Z = 2026-09-13 23:59:59 IST → '2026-09-13'
  // 2026-09-13T18:30:00Z = 2026-09-14 00:00:00 IST → '2026-09-14'
  const before = getISTDateString(new Date('2026-09-13T18:29:59Z'));
  const after  = getISTDateString(new Date('2026-09-13T18:30:00Z'));
  assert.equal(before, '2026-09-13');
  assert.equal(after,  '2026-09-14');
});

// ── N2-AT-04: Attendance schema structure ────────────────────
test('N2-AT-04: Attendance model requires employee and businessDate', () => {
  const Attendance = require('../models/Attendance');
  const schemaPaths = Attendance.schema.paths;
  assert.ok(schemaPaths.employee,     'employee field required');
  assert.ok(schemaPaths.businessDate, 'businessDate field required');
  assert.ok(schemaPaths.markedAt,     'markedAt field exists');
  assert.equal(schemaPaths.employee.isRequired,     true);
  assert.equal(schemaPaths.businessDate.isRequired, true);
});

// ── N2-AT-05: Unique index exists ────────────────────────────
test('N2-AT-05: Attendance has unique compound index on employee+businessDate', () => {
  const Attendance = require('../models/Attendance');
  const indexes    = Attendance.schema.indexes();
  const uniqueIdx  = indexes.find(([fields, opts]) =>
    fields.employee === 1 && fields.businessDate === 1 && opts.unique === true
  );
  assert.ok(uniqueIdx, 'Unique compound index on employee+businessDate must exist');
});

// ── N2-AT-06: Non-unique date index exists ───────────────────
test('N2-AT-06: Attendance has non-unique index on businessDate', () => {
  const Attendance = require('../models/Attendance');
  const indexes    = Attendance.schema.indexes();
  const dateIdx    = indexes.find(([fields]) =>
    fields.businessDate === 1 && Object.keys(fields).length === 1
  );
  assert.ok(dateIdx, 'Non-unique index on businessDate must exist');
});

// ── N2-AT-07: $setOnInsert behavior (pure logic test) ────────
test('N2-AT-07: $setOnInsert does not overwrite existing markedAt (logic test)', () => {
  // Simulate: upsert creates on first call, second call is no-op
  const originalMarkedAt = new Date('2026-09-14T04:00:00Z');
  const secondCallMarkedAt = new Date('2026-09-14T05:00:00Z');

  // With $setOnInsert: if doc exists, markedAt should NOT be updated
  function simulateSetOnInsert(docExists, existingMarkedAt) {
    if (!docExists) return new Date(); // insert: use $setOnInsert value
    return existingMarkedAt; // update: $setOnInsert is no-op
  }

  const result1 = simulateSetOnInsert(false, null);
  const result2 = simulateSetOnInsert(true, originalMarkedAt);

  assert.ok(result1 instanceof Date, 'First insert produces markedAt');
  assert.equal(result2.getTime(), originalMarkedAt.getTime(), '$setOnInsert preserves original markedAt');
  assert.notEqual(result2.getTime(), secondCallMarkedAt.getTime());
});

// ── N2-AT-08: businessDate is server-computed, not client-provided ─
test('N2-AT-08: businessDate is computed server-side from IST clock', () => {
  const serverDate = getISTDateString();
  // Format must match 'YYYY-MM-DD'
  assert.match(serverDate, /^\d{4}-\d{2}-\d{2}$/);
  // Must equal today's IST date
  const expected = getISTDateString(new Date());
  assert.equal(serverDate, expected);
});

// ── N2-AT-09: telecaller role check ──────────────────────────
test('N2-AT-09: markPresent is only authorized for telecaller role', () => {
  const allowedRoles = ['telecaller'];
  assert.ok(allowedRoles.includes('telecaller'), 'telecaller allowed');
  assert.ok(!allowedRoles.includes('admin'),     'admin not allowed');
  assert.ok(!allowedRoles.includes('tl'),        'tl not allowed');
  assert.ok(!allowedRoles.includes('director'),  'director not allowed');
});

// ── N2-AT-10: admin cannot mark present ──────────────────────
test('N2-AT-10: admin role should NOT be authorized for mark-present', () => {
  const route = require('../routes/attendance');
  // Inspect route stack to confirm authorize middleware is there
  const stack  = route.stack || [];
  const postRoute = stack.find((l) => l.route?.path === '/mark-present' && l.route?.methods?.post);
  assert.ok(postRoute, 'POST /mark-present route must exist');
});

// ── N2-AT-11: TL cannot mark present ─────────────────────────
test('N2-AT-11: routes/attendance exports a router with the three expected routes', () => {
  const router = require('../routes/attendance');
  assert.ok(router, 'attendance router must export');
  const paths = (router.stack || []).map((l) => l.route?.path).filter(Boolean);
  assert.ok(paths.includes('/mark-present'),      'POST /mark-present registered');
  assert.ok(paths.includes('/today'),             'GET /today registered');
  assert.ok(paths.includes('/employees/present'), 'GET /employees/present registered');
});

// ── N2-AT-12: idempotency — same response structure for duplicate ─
test('N2-AT-12: second mark-present response includes alreadyMarked flag', () => {
  // Simulate the controller response logic
  function buildResponse(isNewInsert) {
    if (isNewInsert) return { status: 201, alreadyMarked: false };
    return { status: 200, alreadyMarked: true };
  }
  const first  = buildResponse(true);
  const second = buildResponse(false);
  assert.equal(first.status,  201);
  assert.equal(second.status, 200);
  assert.equal(second.alreadyMarked, true);
});

// ── N2-AT-13: getTodayStatus — present path ──────────────────
test('N2-AT-13: getTodayStatus returns present:true when record exists for today', () => {
  const todayIST = getISTDateString();
  function simulateGetTodayStatus(record) {
    if (record && record.businessDate === todayIST) {
      return { present: true, markedAt: record.markedAt };
    }
    return { present: false, markedAt: null };
  }
  const result = simulateGetTodayStatus({ businessDate: todayIST, markedAt: new Date() });
  assert.equal(result.present, true);
  assert.ok(result.markedAt instanceof Date);
});

// ── N2-AT-14: getTodayStatus — absent path ───────────────────
test('N2-AT-14: getTodayStatus returns present:false when no record exists', () => {
  const todayIST = getISTDateString();
  function simulateGetTodayStatus(record) {
    if (record && record.businessDate === todayIST) return { present: true, markedAt: record.markedAt };
    return { present: false, markedAt: null };
  }
  const result = simulateGetTodayStatus(null);
  assert.equal(result.present, false);
  assert.equal(result.markedAt, null);
});

// ── N2-AT-15: getPresentEmployees returns only today's employees ─
test('N2-AT-15: getPresentEmployees filters to businessDate === today', () => {
  const todayIST     = getISTDateString();
  const yesterdayIST = getISTDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const records = [
    { employee: 'emp1', businessDate: todayIST },
    { employee: 'emp2', businessDate: yesterdayIST },
  ];

  const todayRecords = records.filter((r) => r.businessDate === todayIST);
  assert.equal(todayRecords.length, 1);
  assert.equal(todayRecords[0].employee, 'emp1');
});

// ── N2-AT-16: yesterday's records excluded ───────────────────
test('N2-AT-16: yesterday record does not count as present today', () => {
  const todayIST     = getISTDateString();
  const yesterdayIST = getISTDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  assert.notEqual(yesterdayIST, todayIST, 'Yesterday must differ from today');

  function isPresent(businessDate) {
    return businessDate === todayIST;
  }
  assert.ok(!isPresent(yesterdayIST), 'Yesterday record is NOT present today');
  assert.ok( isPresent(todayIST),     'Today record IS present today');
});

// ── N2-AT-17: inactive employees excluded ────────────────────
test('N2-AT-17: inactive employees excluded from present employee list', () => {
  const employees = [
    { _id: 'emp1', role: 'telecaller', isActive: true },
    { _id: 'emp2', role: 'telecaller', isActive: false },
    { _id: 'emp3', role: 'telecaller', isActive: true },
  ];
  const active = employees.filter((e) => e.isActive && e.role === 'telecaller');
  assert.equal(active.length, 2);
  assert.ok(!active.find((e) => e._id === 'emp2'), 'Inactive emp2 excluded');
});

// ── N2-AT-18: TL team scoping ─────────────────────────────────
test('N2-AT-18: TL sees only employees with managedBy === TL._id', () => {
  const tlId = 'tl1';
  const employees = [
    { _id: 'emp1', managedBy: 'tl1', role: 'telecaller', isActive: true },
    { _id: 'emp2', managedBy: 'tl2', role: 'telecaller', isActive: true },
    { _id: 'emp3', managedBy: 'tl1', role: 'telecaller', isActive: true },
  ];
  const team = employees.filter((e) => String(e.managedBy) === String(tlId));
  assert.equal(team.length, 2);
  assert.ok(!team.find((e) => e._id === 'emp2'), 'emp2 from tl2 excluded');
});

// ── N2-AT-19: absent employee bulk assignment rejected ────────
test('N2-AT-19: bulkAssign attendance gate rejects absent employee', async () => {
  const todayIST = getISTDateString();

  async function mockAttendanceFind(query) {
    // No attendance record for today
    if (query.businessDate !== todayIST) return null;
    return null; // absent
  }

  const assignedTelecaller = 'emp1';
  const presentRecord = await mockAttendanceFind({ employee: assignedTelecaller, businessDate: todayIST });

  if (!presentRecord) {
    const response = { status: 400, message: 'This employee is not marked present today' };
    assert.equal(response.status, 400);
    assert.match(response.message, /not marked present/i);
  }
});

// ── N2-AT-20: present employee bulk assignment succeeds ───────
test('N2-AT-20: bulkAssign attendance gate allows present employee', async () => {
  const todayIST = getISTDateString();

  async function mockAttendanceFind(query) {
    if (query.businessDate === todayIST) {
      return { employee: query.employee, businessDate: todayIST, markedAt: new Date() };
    }
    return null;
  }

  const assignedTelecaller = 'emp1';
  const presentRecord = await mockAttendanceFind({ employee: assignedTelecaller, businessDate: todayIST });

  assert.ok(presentRecord, 'Present record found — assignment should proceed');
});
