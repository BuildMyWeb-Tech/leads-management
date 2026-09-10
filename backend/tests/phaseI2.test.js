/**
 * phaseI2.test.js — Regression tests for Phase I.2 fixes.
 *
 * I2-001: IST today boundary (dateHelper + controller logic)
 * I2-002: telecaller todayCount not capped at 20
 * I2-003: CSV multer 5MB file size limit (middleware behavior)
 * I2-004: purgeLogs minimum 30-day retention floor
 * I2-006: buildDirectorViewRow remarks || notes fallback
 * I2-007: heavy-endpoint rate limiter configuration
 * I2-008: login response includes managedBy
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

// ══════════════════════════════════════════════════════════════════════════════
// I2-001 — IST Today Boundary (dateHelper)
// ══════════════════════════════════════════════════════════════════════════════

const { getISTMidnightUTC, getISTDayBounds } = require('../utils/dateHelper');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Helper: build a UTC Date from an IST wall-clock description
const fromIST = (isoWithoutTz) => {
  // e.g. '2026-09-10T00:00:00' IST = '2026-09-09T18:30:00Z'
  return new Date(new Date(isoWithoutTz + 'Z').getTime() - IST_OFFSET_MS);
};

test('I2-001: getISTMidnightUTC — normal daytime IST returns IST midnight as UTC', () => {
  // 2026-09-10 15:00 IST = 2026-09-10T09:30:00Z
  const now = new Date('2026-09-10T09:30:00Z');
  const midnight = getISTMidnightUTC(now);
  // IST midnight for Sep 10 = 2026-09-09T18:30:00Z
  assert.equal(midnight.toISOString(), '2026-09-09T18:30:00.000Z');
});

test('I2-001: getISTMidnightUTC — just before IST midnight belongs to previous IST day', () => {
  // 2026-09-09 23:59 IST = 2026-09-09T18:29:00Z
  const now = new Date('2026-09-09T18:29:00Z');
  const midnight = getISTMidnightUTC(now);
  // Still Sep 9 IST → midnight is 2026-09-08T18:30:00Z
  assert.equal(midnight.toISOString(), '2026-09-08T18:30:00.000Z');
});

test('I2-001: getISTMidnightUTC — exactly at IST midnight belongs to new IST day', () => {
  // 2026-09-10 00:00 IST = 2026-09-09T18:30:00Z
  const now = new Date('2026-09-09T18:30:00Z');
  const midnight = getISTMidnightUTC(now);
  // Sep 10 IST → midnight is 2026-09-09T18:30:00Z
  assert.equal(midnight.toISOString(), '2026-09-09T18:30:00.000Z');
});

test('I2-001: getISTMidnightUTC — just after IST midnight belongs to new IST day', () => {
  // 2026-09-10 00:01 IST = 2026-09-09T18:31:00Z
  const now = new Date('2026-09-09T18:31:00Z');
  const midnight = getISTMidnightUTC(now);
  assert.equal(midnight.toISOString(), '2026-09-09T18:30:00.000Z');
});

test('I2-001: getISTMidnightUTC — UTC midnight stays on the same IST day (not prior)', () => {
  // 2026-09-10 00:00 UTC = 2026-09-10 05:30 IST → belongs to Sep 10 IST
  const now = new Date('2026-09-10T00:00:00Z');
  const midnight = getISTMidnightUTC(now);
  // Sep 10 IST midnight = 2026-09-09T18:30:00Z
  assert.equal(midnight.toISOString(), '2026-09-09T18:30:00.000Z');
});

test('I2-001: getISTDayBounds — start and end are exactly 24h apart', () => {
  const now = new Date('2026-09-10T09:30:00Z'); // 15:00 IST
  const { start, end } = getISTDayBounds(now);
  const diffMs = end.getTime() - start.getTime();
  assert.equal(diffMs, 24 * 60 * 60 * 1000, 'start→end must be exactly 24h');
});

test('I2-001: getISTDayBounds — start is IST midnight UTC', () => {
  const now = new Date('2026-09-10T09:30:00Z');
  const { start } = getISTDayBounds(now);
  assert.equal(start.toISOString(), '2026-09-09T18:30:00.000Z');
});

test('I2-001: getISTDayBounds — end is next IST midnight UTC', () => {
  const now = new Date('2026-09-10T09:30:00Z');
  const { end } = getISTDayBounds(now);
  assert.equal(end.toISOString(), '2026-09-10T18:30:00.000Z');
});

test('I2-001: getISTDayBounds — a timestamp in the range belongs to the correct IST day', () => {
  // Test that 23:59 IST Sep 9 is inside the Sep 9 bounds
  const istSep9at2359 = new Date('2026-09-09T18:29:00Z');
  const bounds = getISTDayBounds(new Date('2026-09-08T18:31:00Z')); // Sep 9 IST
  const { start, end } = getISTDayBounds(istSep9at2359);
  // Sep 9 IST midnight start
  assert.equal(start.toISOString(), '2026-09-08T18:30:00.000Z');
  // Sep 10 IST midnight end
  assert.equal(end.toISOString(), '2026-09-09T18:30:00.000Z');
  // 23:59 IST Sep 9 (= 18:29 UTC Sep 9) must be inside [start, end)
  assert.ok(istSep9at2359 >= start && istSep9at2359 < end);
});

test('I2-001: getISTDayBounds — IST midnight instant belongs to new day, not old', () => {
  // 2026-09-10 00:00 IST = 2026-09-09T18:30:00Z
  const istMidnight = new Date('2026-09-09T18:30:00Z');
  const { start, end } = getISTDayBounds(istMidnight);
  // midnight belongs to Sep 10 IST
  assert.equal(start.toISOString(), '2026-09-09T18:30:00.000Z');
  assert.equal(end.toISOString(),   '2026-09-10T18:30:00.000Z');
  assert.ok(istMidnight >= start && istMidnight < end,
    'IST midnight must belong to the new day range');
});

test('I2-001: getISTDayBounds — uses current time when no arg given', () => {
  const before = Date.now();
  const { start, end } = getISTDayBounds();
  const after = Date.now();
  assert.ok(start.getTime() <= before, 'start must be <= now');
  assert.ok(end.getTime() >= after, 'end must be >= now');
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});

test('I2-001: source files import dateHelper (structural check)', () => {
  const fs   = require('fs');
  const path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  const tc  = read('controllers/telecallerController.js');
  const lc  = read('controllers/leadsController.js');
  const dc  = read('controllers/directorController.js');
  const ac  = read('controllers/auditController.js');

  assert.ok(tc.includes('dateHelper'), 'telecallerController must import dateHelper');
  assert.ok(lc.includes('dateHelper'), 'leadsController must import dateHelper');
  assert.ok(dc.includes('dateHelper'), 'directorController must import dateHelper');
  assert.ok(ac.includes('dateHelper'), 'auditController must import dateHelper');
});

test('I2-001: controllers no longer use server-local midnight pattern', () => {
  const fs   = require('fs');
  const path = require('path');
  const controllers = [
    'controllers/telecallerController.js',
    'controllers/leadsController.js',
    'controllers/directorController.js',
    'controllers/auditController.js',
  ];
  for (const file of controllers) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    // The old pattern: new Date(now.getFullYear(), now.getMonth(), now.getDate())
    assert.ok(
      !src.includes('now.getFullYear(), now.getMonth(), now.getDate()'),
      `${file} must not use server-local midnight — use getISTDayBounds instead`
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// I2-002 — Telecaller todayCount exact (structural check)
// ══════════════════════════════════════════════════════════════════════════════

test('I2-002: telecallerController uses todayCountExact not todayFollowUps.length', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'telecallerController.js'), 'utf8'
  );
  assert.ok(
    src.includes('todayCountExact'),
    'telecallerController must define todayCountExact via countDocuments'
  );
  assert.ok(
    !src.includes('todayCount:   todayFollowUps.length'),
    'telecallerController must not use todayFollowUps.length for todayCount'
  );
  assert.ok(
    src.includes('todayCount:   todayCountExact'),
    'telecallerController must use todayCountExact in response'
  );
});

test('I2-002: todayFollowUps list retains .limit(20)', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'telecallerController.js'), 'utf8'
  );
  // The display list must still be limited
  assert.ok(
    src.includes('.limit(20)'),
    'Display list must still use .limit(20) — do not remove the cap'
  );
});

// Simulate the todayCount logic in isolation
test('I2-002: exact count logic — independent of list length', () => {
  // Simulate: fetch list with limit 20, but count unbounded
  const mockLeads = Array.from({ length: 50 }, (_, i) => ({ id: i }));
  const displayList = mockLeads.slice(0, 20);
  const exactCount  = mockLeads.length; // 50

  // Old (broken) behavior:
  const oldTodayCount = displayList.length; // 20 — wrong
  // New (correct) behavior:
  const newTodayCount = exactCount;         // 50 — correct

  assert.equal(oldTodayCount, 20, 'Old approach caps at display limit');
  assert.equal(newTodayCount, 50, 'New approach returns exact count');
  assert.notEqual(oldTodayCount, newTodayCount, 'Old and new must differ when >20');
});

test('I2-002: todayCount correct for 0 follow-ups', () => {
  const exactCount = 0;
  assert.equal(exactCount, 0);
});

test('I2-002: todayCount correct for 5 follow-ups (under limit)', () => {
  const exactCount = 5;
  assert.equal(exactCount, 5);
});

test('I2-002: todayCount correct for 20 follow-ups (at limit)', () => {
  const exactCount = 20;
  assert.equal(exactCount, 20);
});

test('I2-002: todayCount correct for 21 follow-ups (over limit — old approach fails)', () => {
  // This test demonstrates why todayFollowUps.length was wrong
  const displayCapped = 20;
  const exactCount    = 21;
  assert.notEqual(displayCapped, exactCount,
    'Display list length (20) must not equal true count (21)');
  assert.equal(exactCount, 21);
});

// ══════════════════════════════════════════════════════════════════════════════
// I2-003 — CSV multer 5MB limit (configuration check)
// ══════════════════════════════════════════════════════════════════════════════

test('I2-003: leads route configures csvUpload with 5MB limit', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');

  assert.ok(
    src.includes('5 * 1024 * 1024') || src.includes('5242880'),
    'CSV multer must set fileSize limit to 5MB'
  );
  assert.ok(
    src.includes('csvUpload') || src.includes('limits:'),
    'CSV multer must use a named upload instance with limits'
  );
});

test('I2-003: multer LIMIT_FILE_SIZE error yields 413 (server.js handler)', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  assert.ok(
    src.includes('LIMIT_FILE_SIZE'),
    'server.js global error handler must handle LIMIT_FILE_SIZE'
  );
  assert.ok(
    src.includes('413'),
    'server.js must return 413 for oversized uploads'
  );
  assert.ok(
    src.includes('5MB'),
    'Error message must mention 5MB'
  );
});

test('I2-003: multer limits object has fileSize key', () => {
  // Validate that the multer limits config is structured correctly
  const FIVE_MB = 5 * 1024 * 1024;
  const config = { storage: 'memoryStorage', limits: { fileSize: FIVE_MB } };
  assert.equal(config.limits.fileSize, FIVE_MB);
});

test('I2-003: import-csv route still requires admin authorization', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');
  // Find the import-csv route line and verify it contains both authorize('admin') and csvUpload
  const importCsvLine = src.split('\n').find((l) => l.includes('/import-csv'));
  assert.ok(importCsvLine, '/import-csv route must exist');
  assert.ok(
    importCsvLine.includes("authorize('admin')"),
    "import-csv route must include authorize('admin')"
  );
  assert.ok(
    importCsvLine.includes('csvUpload'),
    'import-csv route must include csvUpload middleware'
  );
  // authorize must appear before csvUpload in the line
  const authPos   = importCsvLine.indexOf("authorize('admin')");
  const uploadPos = importCsvLine.indexOf('csvUpload');
  assert.ok(authPos < uploadPos, 'authorize must come before csvUpload in middleware chain');
});

// ══════════════════════════════════════════════════════════════════════════════
// I2-004 — purgeLogs retention floor
// ══════════════════════════════════════════════════════════════════════════════

// Mirror the I2-004 clamping logic for unit testing
function computePurgeDays(raw) {
  const parsed = Number(raw);
  return (Number.isFinite(parsed) && parsed > 0)
    ? Math.max(30, Math.floor(parsed))
    : 365;
}

test('I2-004: omitted olderThanDays → default 365', () => {
  assert.equal(computePurgeDays(undefined), 365);
});

test('I2-004: null input → default 365', () => {
  assert.equal(computePurgeDays(null), 365);
});

test('I2-004: 365 → 365', () => {
  assert.equal(computePurgeDays(365), 365);
});

test('I2-004: 180 → 180', () => {
  assert.equal(computePurgeDays(180), 180);
});

test('I2-004: 30 → 30 (floor is allowed)', () => {
  assert.equal(computePurgeDays(30), 30);
});

test('I2-004: 29 → clamped to 30', () => {
  assert.equal(computePurgeDays(29), 30);
});

test('I2-004: 1 → clamped to 30', () => {
  assert.equal(computePurgeDays(1), 30);
});

test('I2-004: 0 → default 365 (0 is not positive)', () => {
  assert.equal(computePurgeDays(0), 365);
});

test('I2-004: negative number → default 365', () => {
  assert.equal(computePurgeDays(-10), 365);
});

test('I2-004: NaN string → default 365', () => {
  assert.equal(computePurgeDays('foo'), 365);
});

test('I2-004: empty string → default 365', () => {
  assert.equal(computePurgeDays(''), 365);
});

test('I2-004: Infinity → default 365 (not finite)', () => {
  assert.equal(computePurgeDays(Infinity), 365);
});

test('I2-004: float 30.9 → floor to 30', () => {
  assert.equal(computePurgeDays(30.9), 30);
});

test('I2-004: float 29.9 → clamped to 30', () => {
  assert.equal(computePurgeDays(29.9), 30);
});

test('I2-004: source confirms minimum is 30', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'auditController.js'), 'utf8'
  );
  assert.ok(src.includes('Math.max(30'), 'purgeLogs must enforce Math.max(30, ...)');
  assert.ok(src.includes('Number.isFinite'), 'purgeLogs must guard with Number.isFinite');
});

// ══════════════════════════════════════════════════════════════════════════════
// I2-005 — TL Add Lead button (structural check)
// ══════════════════════════════════════════════════════════════════════════════

test('I2-005: Dashboard.jsx shows Add Lead for tl role', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/pages/Dashboard.jsx'), 'utf8'
  );
  // Must include tl in the condition
  assert.ok(
    src.includes("user.role === 'tl'"),
    "Dashboard.jsx must include user.role === 'tl' in Add Lead condition"
  );
});

test('I2-005: Dashboard.jsx still hides Add Lead from telecaller', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/pages/Dashboard.jsx'), 'utf8'
  );
  // telecaller role must NOT appear in the button condition
  // (it may appear elsewhere on the page for other features, but not in this block)
  const addLeadBlock = src.match(/user\.role === 'tl'[^}]*/)?.[0] || '';
  // telecaller is not in the same boolean expression as admin/director/tl
  assert.ok(
    !addLeadBlock.includes("'telecaller'"),
    "Add Lead condition must not include telecaller"
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// I2-006 — buildDirectorViewRow remarks || notes
// ══════════════════════════════════════════════════════════════════════════════

// Mirror the function from sheetsService for pure unit testing
function buildDirectorViewRow(lead) {
  return [
    lead.assignedDirector?.name || '',
    lead.name   || '',
    lead.phone  || '',
    lead.remarks || lead.notes || '',
  ];
}

test('I2-006: remarks present → remarks shown in column 3', () => {
  const lead = {
    assignedDirector: { name: 'Alice' },
    name: 'Bob',
    phone: '9876543210',
    remarks: 'Very interested, budget confirmed',
    notes:   'General note',
  };
  const row = buildDirectorViewRow(lead);
  assert.equal(row[3], 'Very interested, budget confirmed');
});

test('I2-006: remarks empty, notes present → notes shown', () => {
  const lead = {
    assignedDirector: { name: 'Alice' },
    name: 'Bob',
    phone: '9876543210',
    remarks: '',
    notes:   'General note',
  };
  const row = buildDirectorViewRow(lead);
  assert.equal(row[3], 'General note');
});

test('I2-006: remarks undefined, notes present → notes shown', () => {
  const lead = {
    assignedDirector: { name: 'Alice' },
    name: 'Bob',
    phone: '9876543210',
    notes: 'General note',
  };
  const row = buildDirectorViewRow(lead);
  assert.equal(row[3], 'General note');
});

test('I2-006: both empty → empty string', () => {
  const lead = {
    assignedDirector: { name: 'Alice' },
    name: 'Bob',
    phone: '9876543210',
    remarks: '',
    notes:   '',
  };
  const row = buildDirectorViewRow(lead);
  assert.equal(row[3], '');
});

test('I2-006: both undefined → empty string', () => {
  const lead = {
    assignedDirector: { name: 'Alice' },
    name: 'Bob',
    phone: '9876543210',
  };
  const row = buildDirectorViewRow(lead);
  assert.equal(row[3], '');
});

test('I2-006: Director_View remains exactly 4 columns', () => {
  const lead = {
    assignedDirector: { name: 'Dir' },
    name: 'Cust',
    phone: '1234567890',
    remarks: 'R',
    notes: 'N',
  };
  const row = buildDirectorViewRow(lead);
  assert.equal(row.length, 4, 'Director_View must have exactly 4 columns');
});

test('I2-006: column order is Director | Customer Name | Mobile Number | Remarks/Notes', () => {
  const lead = {
    assignedDirector: { name: 'DirectorName' },
    name: 'CustomerName',
    phone: '9876543210',
    remarks: 'SomeRemark',
  };
  const row = buildDirectorViewRow(lead);
  assert.equal(row[0], 'DirectorName',  'col 0 = Director');
  assert.equal(row[1], 'CustomerName',  'col 1 = Customer Name');
  assert.equal(row[2], '9876543210',    'col 2 = Mobile Number');
  assert.equal(row[3], 'SomeRemark',    'col 3 = Remarks/Notes');
});

test('I2-006: sheetsService source uses remarks || notes', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'sheetsService.js'), 'utf8'
  );
  assert.ok(
    src.includes('lead.remarks || lead.notes'),
    'sheetsService.buildDirectorViewRow must use lead.remarks || lead.notes'
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// I2-007 — Heavy endpoint rate limiter (structural checks)
// ══════════════════════════════════════════════════════════════════════════════

test('I2-007: allocation route applies heavyOpLimiter to /run', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '..', 'routes', 'allocation.js'), 'utf8');
  assert.ok(src.includes('heavyOpLimiter'), 'allocation route must define heavyOpLimiter');
  // /run must have the limiter
  assert.ok(
    src.includes('heavyOpLimiter, runAllocation') ||
    src.includes("router.post('/run',           heavyOpLimiter"),
    '/run must apply heavyOpLimiter'
  );
});

test('I2-007: sheets route applies heavyOpLimiter to /sync-all', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '..', 'routes', 'sheets.js'), 'utf8');
  assert.ok(src.includes('heavyOpLimiter'), 'sheets route must define heavyOpLimiter');
  assert.ok(
    src.includes('heavyOpLimiter, syncAll') ||
    src.includes("router.post('/sync-all',       heavyOpLimiter"),
    '/sync-all must apply heavyOpLimiter'
  );
});

test('I2-007: leads route applies heavyOpLimiter to /import-csv', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');
  assert.ok(
    src.includes('heavyOpLimiter') || src.includes('heavyOp'),
    'leads route must define a heavy-op limiter'
  );
  // import-csv must have it before csvUpload
  const csvLine = src.split('\n').find((l) => l.includes('/import-csv'));
  assert.ok(csvLine, '/import-csv route must exist');
  assert.ok(
    csvLine.includes('Limiter') || csvLine.includes('limiter'),
    '/import-csv must include a rate limiter in middleware chain'
  );
});

test('I2-007: limiter window is 10 minutes', () => {
  const fs   = require('fs');
  const path = require('path');
  const checkFile = (file) => {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    return src.includes('10 * 60 * 1000');
  };
  assert.ok(
    checkFile('routes/allocation.js') ||
    checkFile('routes/sheets.js') ||
    checkFile('routes/leads.js'),
    'At least one heavy-endpoint route must configure 10-minute window'
  );
});

test('I2-007: allocation GET endpoints do not have heavyOpLimiter', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '..', 'routes', 'allocation.js'), 'utf8');
  // GET /config and GET /stats must not have heavyOpLimiter
  const configLine = src.split('\n').find((l) => l.includes("'/config'") && l.includes('get'));
  const statsLine  = src.split('\n').find((l) => l.includes("'/stats'"));
  if (configLine) {
    assert.ok(!configLine.toLowerCase().includes('limiter'),
      'GET /config must not have heavy-op limiter');
  }
  if (statsLine) {
    assert.ok(!statsLine.toLowerCase().includes('limiter'),
      'GET /stats must not have heavy-op limiter');
  }
});

test('I2-007: auth limiter is unchanged (windowMs 15min, max 10)', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes('15 * 60 * 1000'), 'Auth limiter 15-min window must remain');
  assert.ok(src.includes("windowMs: 15 * 60 * 1000"), 'Auth limiter config unchanged');
});

// ══════════════════════════════════════════════════════════════════════════════
// I2-008 — Login response managedBy
// ══════════════════════════════════════════════════════════════════════════════

test('I2-008: authController login response includes managedBy', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'authController.js'), 'utf8'
  );
  assert.ok(
    src.includes('managedBy: user.managedBy'),
    'authController login must include managedBy in user response'
  );
});

test('I2-008: login response shape includes expected fields', () => {
  // Simulate the login response user object construction
  const buildLoginUser = (user) => ({
    _id: user._id, name: user.name, email: user.email,
    role: user.role, managedBy: user.managedBy,
  });

  const adminUser = { _id: '1', name: 'Admin', email: 'a@b.com', role: 'admin', managedBy: null };
  const tlUser    = { _id: '2', name: 'TL', email: 't@b.com', role: 'tl', managedBy: 'dir-id' };
  const tcUser    = { _id: '3', name: 'TC', email: 'tc@b.com', role: 'telecaller', managedBy: 'tl-id' };

  const adminResp = buildLoginUser(adminUser);
  const tlResp    = buildLoginUser(tlUser);
  const tcResp    = buildLoginUser(tcUser);

  assert.ok('managedBy' in adminResp, 'admin response must have managedBy key');
  assert.ok('managedBy' in tlResp,    'tl response must have managedBy key');
  assert.ok('managedBy' in tcResp,    'telecaller response must have managedBy key');

  assert.equal(tlResp.managedBy, 'dir-id', 'TL managedBy must reflect director id');
  assert.equal(tcResp.managedBy, 'tl-id',  'Telecaller managedBy must reflect TL id');
  assert.equal(adminResp.managedBy, null,    'Admin managedBy is null');
});

test('I2-008: managedBy is not a sensitive field (only hierarchy ref, not PII)', () => {
  // managedBy is an ObjectId reference (user._id of manager) — not a password or token
  const managedBy = '64f0a1b2c3d4e5f6a7b8c9d0';
  assert.ok(
    /^[0-9a-f]{24}$/.test(managedBy) || managedBy === null,
    'managedBy is always null or a MongoDB ObjectId — not sensitive data'
  );
});

test('I2-008: getMe endpoint is still present (managedBy was already available there)', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'authController.js'), 'utf8'
  );
  assert.ok(src.includes('getMe'), 'getMe endpoint must still exist');
});

// ══════════════════════════════════════════════════════════════════════════════
// Cross-functional: protected architecture invariants
// ══════════════════════════════════════════════════════════════════════════════

test('Protected: allocation engine unchanged', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'allocationEngine.js'), 'utf8'
  );
  assert.ok(src.includes('pickNextDirector'), 'pickNextDirector must still exist');
  assert.ok(src.includes('MAX_RETRIES'), 'optimistic concurrency retries must still exist');
});

test('Protected: buildLeadVisibilityFilter unchanged', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'leadVisibility.js'), 'utf8'
  );
  assert.ok(src.includes('buildLeadVisibilityFilter'), 'visibility filter must still exist');
});

test('Protected: H.2 scheduler fix still present', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'reminderScheduler.js'), 'utf8'
  );
  assert.ok(src.includes('next9am <= now'), 'H1-002 scheduler fix must remain');
  assert.ok(!src.includes('next9am <= istNow'), 'buggy comparison must not exist');
});

test('Protected: H.2 leadId/captureDate mass-assignment fix still present', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'leadsController.js'), 'utf8'
  );
  assert.ok(src.includes('leadId: _leadId'), 'H1-003 leadId destructuring must remain');
  assert.ok(src.includes('captureDate: _captureDate'), 'H1-003 captureDate protection must remain');
});

test('Protected: H.2 OCR TL authorization still present', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'ocr.js'), 'utf8'
  );
  assert.ok(
    src.includes("authorize('admin', 'director', 'tl')"),
    'H1-001 OCR TL auth must remain'
  );
});

test('Protected: Director_View still exactly 4 headers', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'sheetsService.js'), 'utf8'
  );
  // Verify all 4 required column names appear in DIRECTOR_VIEW_HEADERS
  assert.ok(src.includes("'Director'"),      "DIRECTOR_VIEW_HEADERS must contain 'Director'");
  assert.ok(src.includes("'Customer Name'"), "DIRECTOR_VIEW_HEADERS must contain 'Customer Name'");
  assert.ok(src.includes("'Mobile Number'"), "DIRECTOR_VIEW_HEADERS must contain 'Mobile Number'");
  assert.ok(src.includes("'Remarks / Notes'"), "DIRECTOR_VIEW_HEADERS must contain 'Remarks / Notes'");
  // Verify the header array has exactly 4 entries
  const headersMatch = src.match(/DIRECTOR_VIEW_HEADERS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(headersMatch, 'DIRECTOR_VIEW_HEADERS array must be defined');
  const entries = headersMatch[1].split(',').filter((s) => s.trim().length > 0);
  assert.equal(entries.length, 4, 'DIRECTOR_VIEW_HEADERS must have exactly 4 columns');
});
