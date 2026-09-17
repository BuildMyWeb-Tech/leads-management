/**
 * Phase S.4 Tests
 *
 * S4-AT-01 to S4-AT-10: Attendance management (source + behavioral)
 * S4-NAV-01 to S4-NAV-08: Navigation routes (source inspection)
 * S4-SIDE-01 to S4-SIDE-05: Sidebar cleanup (source inspection)
 * S4-FORM-01 to S4-FORM-05: Lead form (source inspection)
 * S4-RATE-01 to S4-RATE-02: Login rate limiter
 * S4-AL-01 to S4-AL-05: Allocation regression (source)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readFE = (rel) => fs.readFileSync(
  path.join(ROOT, '..', 'frontend', 'src', rel), 'utf8'
);

// ══════════════════════════════════════════════════════
// S4-AT — Attendance Management
// ══════════════════════════════════════════════════════

describe('S4-AT: Attendance management endpoint', () => {

  test('S4-AT-01: manageAttendance exported from attendanceController', () => {
    const src = read('controllers/attendanceController.js');
    assert.ok(src.includes('manageAttendance'), 'manageAttendance must be defined');
    assert.ok(src.includes("module.exports = {") && src.includes('manageAttendance'),
      'manageAttendance must be exported');
  });

  test('S4-AT-02: POST /api/attendance/manage route exists', () => {
    const src = read('routes/attendance.js');
    assert.ok(src.includes("'/manage'") || src.includes('"/manage"'),
      'POST /manage route must exist');
    assert.ok(src.includes('manageAttendance'), 'route must reference manageAttendance');
  });

  test('S4-AT-03: manage route authorized for admin and director only', () => {
    const src = read('routes/attendance.js');
    const manageLine = src.split('\n').find((l) => l.includes("'/manage'") || l.includes('"/manage"'));
    assert.ok(manageLine, 'manage route line must exist');
    assert.ok(manageLine.includes("'admin'") || manageLine.includes('"admin"'),
      'admin must be authorized');
    assert.ok(manageLine.includes("'director'") || manageLine.includes('"director"'),
      'director must be authorized');
    assert.ok(
      !manageLine.includes("'telecaller'") && !manageLine.includes('"telecaller"'),
      'telecaller must NOT be authorized on manage route'
    );
  });

  test('S4-AT-04: manageAttendance validates action field', () => {
    const src = read('controllers/attendanceController.js');
    assert.ok(src.includes("action !== 'present'") && src.includes("action !== 'absent'"),
      'must validate action is present or absent');
    assert.ok(src.includes("'employeeId and action are required'") ||
      src.includes('"employeeId and action are required"'),
      'must require both employeeId and action');
  });

  test('S4-AT-05: manageAttendance enforces director hierarchy scoping', () => {
    const src = read('controllers/attendanceController.js');
    assert.ok(src.includes("req.user.role === 'director'"),
      'must scope by director role');
    assert.ok(src.includes("managedBy: req.user._id"),
      'director must be matched by managedBy on TLs');
    assert.ok(src.includes('empFilter.managedBy'),
      'employee filter must be scoped for director');
  });

  test('S4-AT-06: manageAttendance marks present via upsert', () => {
    const src = read('controllers/attendanceController.js');
    assert.ok(src.includes('findOneAndUpdate'), 'present action must use findOneAndUpdate');
    assert.ok(src.includes('$setOnInsert'), 'must use $setOnInsert to avoid overwriting existing markedAt');
    assert.ok(src.includes("upsert: true"), 'must upsert on mark-present');
  });

  test('S4-AT-07: manageAttendance marks absent by deleting the record', () => {
    const src = read('controllers/attendanceController.js');
    assert.ok(
      src.includes('findOneAndDelete') || src.includes('deleteOne'),
      'absent action must remove attendance record'
    );
    assert.ok(src.includes("action === 'absent'"), 'must check for absent action');
  });

  test('S4-AT-08: manageAttendance prevents unauthorized role (telecaller cannot use it)', () => {
    const src = read('routes/attendance.js');
    const lines = src.split('\n');
    const manageLine = lines.find((l) => l.includes("'/manage'") || l.includes('"/manage"'));
    assert.ok(manageLine, 'manage route must exist');
    assert.ok(
      !manageLine.includes("'tl'") && !manageLine.includes('"tl"') &&
      !manageLine.includes("'telecaller'") && !manageLine.includes('"telecaller"'),
      'TL and telecaller must not be authorized on manage route'
    );
  });

  test('S4-AT-09: manageAttendance validates employee exists before acting', () => {
    const src = read('controllers/attendanceController.js');
    assert.ok(src.includes('Employee not found or access denied'),
      'must return 404 if employee not found or access denied');
  });

  test('S4-AT-10: manageAttendance audits the action', () => {
    const src = read('controllers/attendanceController.js');
    assert.ok(src.includes("'attendance_managed'"),
      'must audit log the attendance management action');
  });

});

// ══════════════════════════════════════════════════════
// S4-NAV — Navigation Route Correctness
// ══════════════════════════════════════════════════════

describe('S4-NAV: TopBar navigation routes', () => {

  test('S4-NAV-01: TopBar navigates to /notifications (not /notification-settings)', () => {
    const src = readFE('components/layout/TopBar.jsx');
    assert.ok(src.includes("navigate('/notifications')"),
      "TopBar notification must navigate to '/notifications'");
    assert.ok(!src.includes("navigate('/notification-settings')"),
      "TopBar must NOT navigate to '/notification-settings'");
  });

  test('S4-NAV-02: TopBar navigates to /leads/add (not /add-lead)', () => {
    const src = readFE('components/layout/TopBar.jsx');
    assert.ok(src.includes("navigate('/leads/add')"),
      "TopBar Add Lead must navigate to '/leads/add'");
    assert.ok(!src.includes("navigate('/add-lead')"),
      "TopBar must NOT navigate to '/add-lead'");
  });

  test('S4-NAV-03: TopBar is not mobile-only (no lg:hidden on header)', () => {
    const src = readFE('components/layout/TopBar.jsx');
    const headerLine = src.split('\n').find((l) => l.includes('<header'));
    assert.ok(headerLine, 'TopBar must have a header element');
    assert.ok(!headerLine.includes('lg:hidden'),
      'TopBar header must NOT have lg:hidden — it must show on desktop');
  });

  test('S4-NAV-04: App.jsx route /notifications exists', () => {
    const src = readFE('App.jsx');
    assert.ok(src.includes('path="/notifications"'),
      '/notifications route must exist in App.jsx');
  });

  test('S4-NAV-05: App.jsx route /leads/add exists', () => {
    const src = readFE('App.jsx');
    assert.ok(src.includes('path="/leads/add"'),
      '/leads/add route must exist in App.jsx');
  });

  test('S4-NAV-06: AddLead page has OCR link to /ocr-capture', () => {
    const src = readFE('pages/AddLead.jsx');
    assert.ok(src.includes('to="/ocr-capture"'),
      'AddLead must have a link to /ocr-capture');
  });

  test('S4-NAV-07: AddLead page has CSV import link to /leads/import', () => {
    const src = readFE('pages/AddLead.jsx');
    assert.ok(src.includes('to="/leads/import"'),
      'AddLead must have a link to /leads/import');
  });

  test('S4-NAV-08: /ocr-capture and /leads/import routes still exist in App.jsx', () => {
    const src = readFE('App.jsx');
    assert.ok(src.includes('path="/ocr-capture"'), '/ocr-capture route must still exist');
    assert.ok(src.includes('path="/leads/import"'), '/leads/import route must still exist');
  });

});

// ══════════════════════════════════════════════════════
// S4-SIDE — Sidebar Cleanup
// ══════════════════════════════════════════════════════

describe('S4-SIDE: Sidebar navigation cleanup', () => {

  test('S4-SIDE-01: Notifications removed from sidebar NAV_LINKS', () => {
    const src = readFE('components/layout/Sidebar.jsx');
    assert.ok(!src.includes("label: 'Notifications'"),
      'Notifications must be removed from sidebar NAV_LINKS');
  });

  test('S4-SIDE-02: Allocate Leads removed from sidebar NAV_LINKS', () => {
    const src = readFE('components/layout/Sidebar.jsx');
    assert.ok(!src.includes("label: 'Allocate Leads'"),
      'Allocate Leads must be removed from sidebar NAV_LINKS');
  });

  test('S4-SIDE-03: Import CSV removed from sidebar NAV_LINKS', () => {
    const src = readFE('components/layout/Sidebar.jsx');
    assert.ok(!src.includes("label: 'Import CSV'"),
      'Import CSV must be removed from sidebar NAV_LINKS');
  });

  test('S4-SIDE-04: Audit Logs removed from sidebar NAV_LINKS', () => {
    const src = readFE('components/layout/Sidebar.jsx');
    assert.ok(!src.includes("label: 'Audit Logs'"),
      'Audit Logs must be removed from sidebar NAV_LINKS');
  });

  test('S4-SIDE-05: Sidebar still has Add Lead, Dashboard, All Leads', () => {
    const src = readFE('components/layout/Sidebar.jsx');
    assert.ok(src.includes("label: 'Add Lead'"), 'Add Lead must remain in sidebar');
    assert.ok(src.includes("label: 'Dashboard'"), 'Dashboard must remain in sidebar');
    assert.ok(src.includes("label: 'All Leads'"), 'All Leads must remain in sidebar');
  });

});

// ══════════════════════════════════════════════════════
// S4-FORM — Lead Form Validation
// ══════════════════════════════════════════════════════

describe('S4-FORM: AddLead form requirements', () => {

  test('S4-FORM-01: Budget is a text input, not a dropdown', () => {
    const src = readFE('pages/AddLead.jsx');
    // BUDGETS array (predefined dropdown options) must be gone
    assert.ok(!src.includes('const BUDGETS'), 'BUDGETS array must be removed');
    // There must be an <input> for budget (not a select with BUDGETS options)
    assert.ok(src.includes("onChange={set('budget')}"), 'budget onChange must exist');
    assert.ok(src.includes("placeholder") && src.includes("budget"),
      'budget must be a text input with a placeholder');
    // Ensure BUDGETS.map is not used (was the old dropdown pattern)
    assert.ok(!src.includes('BUDGETS.map'), 'BUDGETS.map must not be used for budget dropdown');
  });

  test('S4-FORM-02: Email is the last field in the form', () => {
    const src = readFE('pages/AddLead.jsx');
    const emailIdx = src.lastIndexOf("set('email')");
    const submitIdx = src.indexOf('type="submit"');
    assert.ok(emailIdx > 0, 'email field must exist');
    assert.ok(submitIdx > emailIdx, 'submit button must come after email field');
  });

  test('S4-FORM-03: Plot Area is a free-text input', () => {
    const src = readFE('pages/AddLead.jsx');
    assert.ok(src.includes("set('plotSquareFeet')"), 'plotSquareFeet field must exist');
    assert.ok(src.includes('placeholder') && src.includes('plotSquareFeet'),
      'plotSquareFeet must be a text input with placeholder');
  });

  test('S4-FORM-04: Follow-up Date and Site Visit Date are present', () => {
    const src = readFE('pages/AddLead.jsx');
    assert.ok(src.includes("set('followUpDate')"), 'followUpDate field must exist');
    assert.ok(src.includes("set('siteVisitDate')"), 'siteVisitDate field must exist');
  });

  test('S4-FORM-05: Budget validation checks non-empty string (not dropdown match)', () => {
    const src = readFE('pages/AddLead.jsx');
    assert.ok(src.includes("form.budget.trim()"),
      "budget validation must check trim() — it's a text field now");
    assert.ok(!src.includes('BUDGETS.includes'),
      'budget must not be validated against a predefined BUDGETS list');
  });

});

// ══════════════════════════════════════════════════════
// S4-RATE — Login Rate Limiter
// ══════════════════════════════════════════════════════

describe('S4-RATE: Login rate limiter', () => {

  test('S4-RATE-01: auth rate limiter max is >= 20 (allows testing, still limits abuse)', () => {
    const src = read('server.js');
    const match = src.match(/authLimiter[\s\S]*?max:\s*(\d+)/);
    assert.ok(match, 'authLimiter must be defined in server.js');
    const maxVal = parseInt(match[1], 10);
    assert.ok(maxVal >= 20, `authLimiter max must be >= 20 for multi-device testing, got ${maxVal}`);
    assert.ok(maxVal <= 100, `authLimiter max must be <= 100 to retain abuse protection, got ${maxVal}`);
  });

  test('S4-RATE-02: auth rate limiter window is still 15 minutes', () => {
    const src = read('server.js');
    assert.ok(src.includes('15 * 60 * 1000') || src.includes('900000'),
      'authLimiter window must be 15 minutes');
  });

});

// ══════════════════════════════════════════════════════
// S4-AL — Allocation Regression
// ══════════════════════════════════════════════════════

describe('S4-AL: Allocation engine regression', () => {

  test('S4-AL-01: pickNextEmployee uses workload-based (least-loaded) selection', () => {
    const src = read('utils/allocationEngine.js');
    assert.ok(src.includes('Least-loaded') || src.includes('least-loaded') || src.includes('leadCounts'),
      'pickNextEmployee must use lead count for workload-based selection');
    assert.ok(src.includes('Lead.aggregate'), 'must aggregate lead counts for workload');
    assert.ok(src.includes('countMap'), 'must build a count map for fair selection');
  });

  test('S4-AL-02: pickNextEmployee tie-breaks by _id for determinism', () => {
    const src = read('utils/allocationEngine.js');
    assert.ok(src.includes('localeCompare') || src.includes('String(a._id)'),
      'tie-breaker must use _id comparison for determinism');
  });

  test('S4-AL-03: pickNextEmployee isolates by Director hierarchy (TL filter)', () => {
    const src = read('utils/allocationEngine.js');
    assert.ok(src.includes("managedBy: directorId"),
      'TL query must filter by directorId');
    assert.ok(src.includes("managedBy: { $in: tlIds }"),
      'telecaller query must filter by TL ids');
  });

  test('S4-AL-04: pickNextEmployee returns null when no present employees', () => {
    const src = read('utils/allocationEngine.js');
    assert.ok(src.includes("if (!presentRecords.length) return null"),
      'must return null when no employees are present');
  });

  test('S4-AL-05: Director AQRR unchanged — pickNextDirector still references simulatePick', () => {
    const src = read('utils/allocationEngine.js');
    assert.ok(src.includes('simulatePick(enabled, baseRemaining, basePointer)'),
      'pickNextDirector must still call simulatePick');
    assert.ok(src.includes('MAX_RETRIES = 5'),
      'AQRR retry count must remain at 5');
  });

  test('S4-AL-06: Kanban COLD column label in frontend (HOLD key → COLD display)', () => {
    const src = readFE('components/leads/KanbanBoard.jsx');
    assert.ok(src.includes("label: 'COLD'"), "HOLD column must display as 'COLD'");
    assert.ok(src.includes("HOLD: 'Cold'") || src.includes("HOLD:'Cold'"),
      "COLUMN_TO_PRIORITY mapping HOLD → 'Cold' DB value must remain");
  });

  test('S4-AL-07: Lead assignment shows Team Lead in drawer (nested populate)', () => {
    const src = read('controllers/leadsController.js');
    assert.ok(
      src.includes("'managedBy'") || src.includes('"managedBy"'),
      'leads controller must populate managedBy for telecaller TL display'
    );
    assert.ok(src.includes("populate: { path: 'managedBy'") ||
      src.includes('populate: { path: "managedBy"'),
      'must use nested populate for managedBy to get TL name'
    );
  });

  test('S4-AL-08: LeadDetailDrawer shows Team Lead label (not Telecaller)', () => {
    const src = readFE('components/leads/LeadDetailDrawer.jsx');
    assert.ok(src.includes('Team Lead'), 'LeadDetailDrawer must have Team Lead label');
    assert.ok(src.includes('Employee'), 'LeadDetailDrawer must show Employee label');
    assert.ok(!src.includes(">Telecaller<"),
      'Telecaller label must be replaced with Employee in drawer');
  });

});
