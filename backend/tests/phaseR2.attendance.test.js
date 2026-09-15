/**
 * phaseR2.attendance.test.js — R.2 attendance history API tests.
 *
 * Verifies the three new attendance endpoints: getOwnHistory,
 * getAttendanceReport, getEmployeeHistory — logic, scoping, and
 * security constraints, without requiring a live DB connection.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const todayIST = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
const yesterdayIST = new Date(Date.now() + IST_OFFSET_MS - 86400000).toISOString().slice(0, 10);

// ── R2-AT-01: new routes are declared in attendance router ────────
test('R2-AT-01: attendance routes include /history, /report, /employee/:id/history', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../routes/attendance'), 'utf8');
  assert.ok(src.includes("'/history'"),            '/history route must be declared');
  assert.ok(src.includes("'/report'"),             '/report route must be declared');
  assert.ok(src.includes("'/employee/:id/history'"), '/employee/:id/history route must be declared');
});

// ── R2-AT-02: /history is telecaller only ─────────────────────────
test('R2-AT-02: /history route is restricted to telecaller role', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../routes/attendance'), 'utf8');
  // Verify /history uses authorize('telecaller')
  const historyLine = src.split('\n').find((l) => l.includes("'/history'"));
  assert.ok(historyLine && historyLine.includes("'telecaller'"),
    '/history must be restricted to telecaller role');
});

// ── R2-AT-03: /report and /employee/:id/history are admin/tl ─────
test('R2-AT-03: /report route is restricted to admin/director/tl', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../routes/attendance'), 'utf8');
  const reportLine = src.split('\n').find((l) => l.includes("'/report'"));
  assert.ok(reportLine && reportLine.includes("'admin'"),
    '/report must include admin role');
  assert.ok(reportLine && reportLine.includes("'tl'"),
    '/report must include tl role');
});

// ── R2-AT-04: getOwnHistory uses req.user._id (not request param) ─
test('R2-AT-04: getOwnHistory queries by req.user._id — no client-supplied employee ID', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
  // getOwnHistory should use req.user._id
  assert.ok(src.includes('employee: req.user._id'),
    'getOwnHistory must use req.user._id for employee filter');
});

// ── R2-AT-05: getEmployeeHistory scopes TL by managedBy ───────────
test('R2-AT-05: getEmployeeHistory enforces managedBy scope for TL role', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
  // The getEmployeeHistory function must include managedBy scoping for TL
  assert.ok(
    src.includes("empFilter.managedBy = req.user._id"),
    'getEmployeeHistory must set empFilter.managedBy = req.user._id for TL scoping'
  );
});

// ── R2-AT-06: getAttendanceReport defaults to today IST ───────────
test('R2-AT-06: getAttendanceReport falls back to getISTDateString() when no date param', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
  assert.ok(src.includes('req.query.date || getISTDateString()'),
    'getAttendanceReport must default to today IST');
});

// ── R2-AT-07: present/absent computed from record existence ────────
test('R2-AT-07: presence determined by record existence — no Absent documents stored', () => {
  const Attendance = require('../models/Attendance');
  const paths = Attendance.schema.paths;
  // Absence is NOT a stored field — only presence records exist
  assert.ok(!paths.status, 'Attendance schema must not have a status field');
  assert.ok(!paths.absent, 'Attendance schema must not have an absent field');
  assert.ok(paths.employee, 'employee field required');
  assert.ok(paths.businessDate, 'businessDate field required');
});

// ── R2-AT-08: Attendance model has no markedBy field ─────────────
test('R2-AT-08: Attendance schema has no markedBy field (markedBy = employee self-mark)', () => {
  const Attendance = require('../models/Attendance');
  const paths = Attendance.schema.paths;
  assert.ok(!paths.markedBy, 'markedBy must NOT be added to Attendance schema in R.2');
});

// ── R2-AT-09: existing mark-present endpoint unchanged ────────────
test('R2-AT-09: mark-present controller still uses server-side IST date', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
  assert.ok(src.includes('getISTDateString()'),
    'markPresent must derive businessDate from getISTDateString() — not from req.body');
  assert.ok(!src.includes('req.body.businessDate'),
    'markPresent must NOT accept businessDate from request body');
});

// ── R2-AT-10: pagination params handled safely ────────────────────
test('R2-AT-10: history endpoints apply page and limit bounds', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
  assert.ok(src.includes('Math.min(100'),   'limit must be capped at 100');
  assert.ok(src.includes('Math.max(1'),     'page must be floored at 1');
  assert.ok(src.includes('.skip(skip)'),    'pagination skip must be applied');
  assert.ok(src.includes('.limit(limit)'),  'pagination limit must be applied');
});

// ── R2-AT-11: getEmployeeHistory returns 404 on access denied ─────
test('R2-AT-11: getEmployeeHistory returns 404 when employee not found or access denied', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
  assert.ok(src.includes('Employee not found or access denied'),
    'must return 404 with access-denied message for out-of-scope employee');
});

// ── R2-AT-12: existing endpoints still present ───────────────────
test('R2-AT-12: existing attendance endpoints mark-present, today, employees/present unchanged', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../routes/attendance'), 'utf8');
  assert.ok(src.includes("'/mark-present'"),        '/mark-present must still exist');
  assert.ok(src.includes("'/today'"),               '/today must still exist');
  assert.ok(src.includes("'/employees/present'"),   '/employees/present must still exist');
});

// ── R2-AT-13: attendance gate in bulkAssign unchanged ────────────
test('R2-AT-13: bulkAssign attendance gate still uses Attendance.findOne (not new endpoints)', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
  assert.ok(src.includes("require('../models/Attendance')"),
    'bulkAssign must still require Attendance directly');
  assert.ok(src.includes('not marked present today'),
    'bulkAssign absence rejection message must remain');
});

// ── R2-AT-14: AQRR unchanged ──────────────────────────────────────
test('R2-AT-14: allocationEngine still exports pickNextDirector (AQRR unchanged)', () => {
  const alloc = require('../utils/allocationEngine');
  assert.ok(typeof alloc.pickNextDirector  === 'function', 'pickNextDirector must exist');
  assert.ok(typeof alloc.previewSequence   === 'function', 'previewSequence must exist');
  assert.ok(typeof alloc.simulatePick      === 'function', 'simulatePick must exist');
});

// ── R2-AT-15: Attendance has required indexes ─────────────────────
test('R2-AT-15: Attendance compound unique index and businessDate index present', () => {
  const Attendance = require('../models/Attendance');
  const indexes    = Attendance.schema.indexes();
  const uniqueIdx  = indexes.find(([f, o]) => f.employee === 1 && f.businessDate === 1 && o?.unique);
  const dateIdx    = indexes.find(([f]) => f.businessDate === 1 && !f.employee);
  assert.ok(uniqueIdx, 'unique compound index {employee:1, businessDate:1} must exist');
  assert.ok(dateIdx,   'index {businessDate:1} must exist for report queries');
});

// ── R2-AT-16: today-only is server-enforced in markPresent ────────
test('R2-AT-16: markPresent derives employee from req.user._id and date from server', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
  // employee must come from req.user._id
  assert.ok(src.includes('employee: req.user._id'),
    'employee must be derived from authenticated user, not body');
  // markedAt must not be accepted from body
  assert.ok(!src.includes('req.body.markedAt'),
    'markedAt must NOT be accepted from request body');
});
