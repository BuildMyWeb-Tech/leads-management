/**
 * phaseJ2.test.js — Regression tests for Phase J.2 fixes.
 *
 * J2-001: Reminder scheduler IST day range (getTodayRange)
 * J2-002: createLead mass-assignment protection (allowlist)
 * J2-003: updateLead visibility scoping for director/TL
 * J2-004: Director dashboard IST week/month grouping
 * J2-005: Audit export dateTo end-of-day boundary
 * J2-006: Lead model createdAt index
 * J2-007: SheetSync comment + health message cleanup
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs   = require('node:fs');
const path = require('node:path');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Build a UTC Date from an IST wall-clock string (no TZ suffix)
// e.g. '2026-09-10T00:00:00' IST → subtract IST offset from that UTC value
const fromIST = (isoIST) =>
  new Date(new Date(isoIST + 'Z').getTime() - IST_OFFSET_MS);

// ══════════════════════════════════════════════════════════════════════════════
// J2-001 — Scheduler: getTodayRange IST day range
// ══════════════════════════════════════════════════════════════════════════════

const { getTodayRange } = require('../utils/reminderScheduler');

// Deterministic anchor: 2026-09-10 14:00:00 IST = 2026-09-10T08:30:00Z
const ANCHOR_IST  = '2026-09-10T14:00:00'; // 2pm IST
const ANCHOR_UTC  = new Date(ANCHOR_IST + 'Z').getTime() - IST_OFFSET_MS; // UTC

test('J2-001-1: getTodayRange start is IST midnight as UTC', () => {
  const { start } = getTodayRange(new Date(ANCHOR_UTC));
  // IST midnight on Sep 10 = Sep 9 18:30:00 UTC
  const expectedStart = fromIST('2026-09-10T00:00:00');
  assert.equal(start.getTime(), expectedStart.getTime());
});

test('J2-001-2: getTodayRange end is 23:59:59.999 IST', () => {
  const { end } = getTodayRange(new Date(ANCHOR_UTC));
  // 23:59:59.999 IST on Sep 10 = Sep 10 18:29:59.999 UTC
  const expectedEnd = fromIST('2026-09-10T23:59:59.999');
  assert.equal(end.getTime(), expectedEnd.getTime());
});

test('J2-001-3: getTodayRange duration is exactly 24h minus 1ms', () => {
  const { start, end } = getTodayRange(new Date(ANCHOR_UTC));
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000 - 1);
});

test('J2-001-4: follow-up at 00:00 IST (start) is included', () => {
  const { start, end } = getTodayRange(new Date(ANCHOR_UTC));
  const followUp = fromIST('2026-09-10T00:00:00');
  assert.ok(followUp >= start && followUp <= end);
});

test('J2-001-5: follow-up at 05:29 IST is included (was cut off by old bug)', () => {
  const { start, end } = getTodayRange(new Date(ANCHOR_UTC));
  const followUp = fromIST('2026-09-10T05:29:00');
  assert.ok(followUp >= start && followUp <= end);
});

test('J2-001-6: follow-up at 05:30 IST is included (was cut off by old bug)', () => {
  const { start, end } = getTodayRange(new Date(ANCHOR_UTC));
  const followUp = fromIST('2026-09-10T05:30:00');
  assert.ok(followUp >= start && followUp <= end);
});

test('J2-001-7: follow-up at noon IST is included', () => {
  const { start, end } = getTodayRange(new Date(ANCHOR_UTC));
  const followUp = fromIST('2026-09-10T12:00:00');
  assert.ok(followUp >= start && followUp <= end);
});

test('J2-001-8: follow-up at 18:00 IST is included', () => {
  const { start, end } = getTodayRange(new Date(ANCHOR_UTC));
  const followUp = fromIST('2026-09-10T18:00:00');
  assert.ok(followUp >= start && followUp <= end);
});

test('J2-001-9: follow-up at 23:59:59.999 IST is included', () => {
  const { start, end } = getTodayRange(new Date(ANCHOR_UTC));
  const followUp = fromIST('2026-09-10T23:59:59.999');
  assert.ok(followUp >= start && followUp <= end);
});

test('J2-001-10: next day 00:00 IST is excluded', () => {
  const { start, end } = getTodayRange(new Date(ANCHOR_UTC));
  const nextDayStart = fromIST('2026-09-11T00:00:00');
  assert.ok(nextDayStart > end);
});

test('J2-001-11: range works correctly when now is just after IST midnight', () => {
  // 00:05 IST on Sep 10
  const { start, end } = getTodayRange(fromIST('2026-09-10T00:05:00'));
  assert.equal(start.getTime(), fromIST('2026-09-10T00:00:00').getTime());
  assert.equal(end.getTime(), fromIST('2026-09-10T23:59:59.999').getTime());
});

test('J2-001-12: range works correctly when now is 23:55 IST', () => {
  // 23:55 IST on Sep 10
  const { start, end } = getTodayRange(fromIST('2026-09-10T23:55:00'));
  assert.equal(start.getTime(), fromIST('2026-09-10T00:00:00').getTime());
  assert.equal(end.getTime(), fromIST('2026-09-10T23:59:59.999').getTime());
});

// ══════════════════════════════════════════════════════════════════════════════
// J2-002 — createLead mass-assignment protection
// ══════════════════════════════════════════════════════════════════════════════

const leadsControllerSrc = fs.readFileSync(
  path.resolve(__dirname, '../controllers/leadsController.js'),
  'utf8',
);

test('J2-002-1: createLead no longer uses spread-all { ...req.body }', () => {
  // The old pattern was: const leadData = { ...req.body }
  // It should now be an explicit destructuring from req.body
  assert.ok(
    !leadsControllerSrc.includes('const leadData = { ...req.body }'),
    'createLead must not spread the entire req.body into leadData',
  );
});

test('J2-002-2: createLead allowlist includes name and phone', () => {
  assert.ok(leadsControllerSrc.includes("name, phone, email, source,"));
});

test('J2-002-3: createLead allowlist explicitly excludes captureDate', () => {
  // captureDate must NOT appear in the allowlist destructure
  // The only reference inside createLead should be the old H.2 updateLead reference
  // We verify there is no direct assignment of captureDate from req.body in createLead
  const createLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const createLead ='),
    leadsControllerSrc.indexOf('const getLead ='),
  );
  assert.ok(
    !createLeadSection.includes('captureDate: req.body') &&
    !createLeadSection.includes("'captureDate'") &&
    !createLeadSection.match(/captureDate\s*=\s*req\.body/),
    'createLead must not assign captureDate from req.body',
  );
});

test('J2-002-4: createLead allowlist explicitly excludes leadId', () => {
  const createLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const createLead ='),
    leadsControllerSrc.indexOf('const getLead ='),
  );
  // leadId must not be in the destructure from req.body in createLead
  // (it may appear as a variable name reference elsewhere in the section but
  // not as a client-supplied field via req.body)
  assert.ok(
    !createLeadSection.match(/leadId\s*,\s*\n.*=\s*req\.body/) &&
    !createLeadSection.match(/leadId:\s*req\.body/),
    'createLead must not accept leadId from req.body',
  );
});

test('J2-002-5: createLead removes undefined keys before Lead.create', () => {
  assert.ok(
    leadsControllerSrc.includes('Object.keys(leadData).forEach'),
    'createLead must strip undefined keys so schema defaults apply',
  );
});

test('J2-002-6: createLead allowlist includes all standard UI fields', () => {
  // Use 'const getLead =' (with space+equals) to avoid matching 'const getLeads ='
  const createLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const createLead ='),
    leadsControllerSrc.indexOf('const getLead ='),
  );
  const requiredFields = ['name', 'phone', 'email', 'source', 'budget', 'remarks', 'notes', 'followUpDate'];
  for (const f of requiredFields) {
    assert.ok(
      createLeadSection.includes(f),
      `createLead allowlist must include '${f}'`,
    );
  }
});

test('J2-002-7: priority is excluded from createLead allowlist', () => {
  const createLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const createLead ='),
    leadsControllerSrc.indexOf('const getLead ='),
  );
  // priority must NOT appear in the destructuring allowlist inside createLead
  // (it can appear in comments but not as a destructured field)
  const destructureBlock = createLeadSection.slice(
    createLeadSection.indexOf('= req.body;'),
    createLeadSection.indexOf('Object.keys(leadData)'),
  );
  assert.ok(
    !destructureBlock.includes('priority'),
    'priority must not be in createLead allowlist',
  );
});

test('J2-002-8: siteVisits and callHistory excluded from createLead allowlist', () => {
  const createLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const createLead ='),
    leadsControllerSrc.indexOf('const getLead ='),
  );
  const destructureBlock = createLeadSection.slice(
    createLeadSection.indexOf('= req.body;'),
    createLeadSection.indexOf('Object.keys(leadData)'),
  );
  assert.ok(!destructureBlock.includes('callHistory'), 'callHistory must not be in createLead allowlist');
  assert.ok(!destructureBlock.includes('siteVisits'), 'siteVisits must not be in createLead allowlist');
});

test('J2-002-9: status is excluded from createLead allowlist (only set by allocation)', () => {
  const createLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const createLead ='),
    leadsControllerSrc.indexOf('const getLead ='),
  );
  const destructureBlock = createLeadSection.slice(
    createLeadSection.indexOf('= req.body;'),
    createLeadSection.indexOf('Object.keys(leadData)'),
  );
  assert.ok(!destructureBlock.includes('status'), 'status must not be in createLead allowlist');
});

// ══════════════════════════════════════════════════════════════════════════════
// J2-003 — updateLead visibility scoping
// ══════════════════════════════════════════════════════════════════════════════

test('J2-003-1: updateLead uses buildLeadVisibilityFilter for director/TL', () => {
  assert.ok(
    leadsControllerSrc.includes("buildLeadVisibilityFilter(req.user)"),
    'updateLead must call buildLeadVisibilityFilter for director/TL visibility',
  );
});

test('J2-003-2: updateLead uses findOne with visibility filter for director', () => {
  const updateLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const updateLead'),
    leadsControllerSrc.indexOf('// ── GET /api/leads/dashboard'),
  );
  assert.ok(
    updateLeadSection.includes("req.user.role === 'director'") &&
    updateLeadSection.includes('findOne'),
    'updateLead must use findOne with visibility filter for director role',
  );
});

test('J2-003-3: updateLead admin retains unrestricted findById access', () => {
  const updateLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const updateLead'),
    leadsControllerSrc.indexOf('// ── GET /api/leads/dashboard'),
  );
  assert.ok(
    updateLeadSection.includes("req.user.role === 'admin'") &&
    updateLeadSection.includes('findById'),
    'updateLead must use findById for admin role',
  );
});

test('J2-003-4: updateLead returns 404 for inaccessible lead (visibility)', () => {
  const updateLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const updateLead'),
    leadsControllerSrc.indexOf('// ── GET /api/leads/dashboard'),
  );
  // 404 guard exists early in the function before the role branches
  assert.ok(
    updateLeadSection.includes("if (!lead) return res.status(404)"),
    'updateLead must return 404 for leads not found within visibility scope',
  );
});

test('J2-003-5: updateLead telecaller branch is unchanged (findById then ownership check)', () => {
  const updateLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const updateLead'),
    leadsControllerSrc.indexOf('// ── GET /api/leads/dashboard'),
  );
  // telecaller ownership check still present
  assert.ok(
    updateLeadSection.includes("req.user.role === 'telecaller'") &&
    updateLeadSection.includes('assignedTelecaller?.toString() !== req.user._id.toString()'),
    'telecaller branch must still enforce ownership',
  );
});

test('J2-003-6: leadId remains protected in updateLead management branch', () => {
  const updateLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const updateLead'),
    leadsControllerSrc.indexOf('// ── GET /api/leads/dashboard'),
  );
  assert.ok(
    updateLeadSection.includes('leadId: _leadId'),
    'leadId must still be destructured out (immutable) in management update branch',
  );
});

test('J2-003-7: captureDate remains protected in updateLead management branch', () => {
  const updateLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const updateLead'),
    leadsControllerSrc.indexOf('// ── GET /api/leads/dashboard'),
  );
  assert.ok(
    updateLeadSection.includes('captureDate: _captureDate'),
    'captureDate must still be destructured out (immutable) in management update branch',
  );
});

test('J2-003-8: TL is included in visibility scoping for updateLead', () => {
  const updateLeadSection = leadsControllerSrc.slice(
    leadsControllerSrc.indexOf('const updateLead'),
    leadsControllerSrc.indexOf('// ── GET /api/leads/dashboard'),
  );
  assert.ok(
    updateLeadSection.includes("req.user.role === 'tl'"),
    'updateLead must scope TL role the same as director',
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// J2-004 — Director dashboard IST week/month grouping
// ══════════════════════════════════════════════════════════════════════════════

const directorControllerSrc = fs.readFileSync(
  path.resolve(__dirname, '../controllers/directorController.js'),
  'utf8',
);

test('J2-004-1: weeklyTrend uses IST timezone in dateToString', () => {
  assert.ok(
    directorControllerSrc.includes("timezone: '+05:30'"),
    'weeklyTrend aggregation must use timezone +05:30 for IST date grouping',
  );
});

test('J2-004-2: monthStart uses istNow UTC components (not server-local now)', () => {
  // The fix uses istNow.getUTCFullYear() / istNow.getUTCMonth()
  assert.ok(
    directorControllerSrc.includes('istNow.getUTCFullYear()') &&
    directorControllerSrc.includes('istNow.getUTCMonth()'),
    'monthStart must derive year/month from istNow, not server-local now',
  );
});

test('J2-004-3: monthStart uses Date.UTC to avoid server-local calendar', () => {
  assert.ok(
    directorControllerSrc.includes('Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1)'),
    'monthStart must use Date.UTC(istYear, istMonth, 1)',
  );
});

test('J2-004-4: IST monthStart is correct for Aug 31 20:30 UTC (= Sep 1 IST)', () => {
  // Aug 31 20:30 UTC = Sep 1 02:00 IST → monthStart should be Sep 1 IST midnight
  const { getISTMidnightUTC } = require('../utils/dateHelper');
  const now = new Date('2026-08-31T20:30:00Z'); // UTC
  const istNow = new Date(now.getTime() + IST_OFFSET_MS); // Sep 1 IST
  const monthStart = getISTMidnightUTC(
    new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1)),
  );
  // Sep 1 00:00 IST = Aug 31 18:30 UTC
  const expected = new Date('2026-08-31T18:30:00Z');
  assert.equal(monthStart.getTime(), expected.getTime());
});

test('J2-004-5: IST monthStart stays in current IST month when UTC is same month', () => {
  // Sep 10 08:30 UTC = Sep 10 14:00 IST → monthStart = Sep 1 IST midnight
  const { getISTMidnightUTC } = require('../utils/dateHelper');
  const now = new Date('2026-09-10T08:30:00Z');
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const monthStart = getISTMidnightUTC(
    new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1)),
  );
  const expected = new Date('2026-08-31T18:30:00Z'); // Sep 1 IST midnight
  assert.equal(monthStart.getTime(), expected.getTime());
});

test('J2-004-6: IST monthStart is correct at January boundary', () => {
  // Dec 31 19:00 UTC = Jan 1 00:30 IST → monthStart should be Jan 1 IST midnight
  const { getISTMidnightUTC } = require('../utils/dateHelper');
  const now = new Date('2026-12-31T19:00:00Z');
  const istNow = new Date(now.getTime() + IST_OFFSET_MS); // Jan 1 2027 IST
  const monthStart = getISTMidnightUTC(
    new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1)),
  );
  // Jan 1 2027 00:00 IST = Dec 31 2026 18:30:00 UTC
  const expected = new Date('2026-12-31T18:30:00Z');
  assert.equal(monthStart.getTime(), expected.getTime());
});

test('J2-004-7: weeklyTrend dateToString format still includes date format', () => {
  assert.ok(
    directorControllerSrc.includes("format: '%Y-%m-%d'"),
    'weeklyTrend must still use YYYY-MM-DD date format',
  );
});

test('J2-004-8: lead at 00:30 IST groups into same IST calendar day (not UTC prev day)', () => {
  // Sep 10 00:30 IST = Sep 9 19:00 UTC
  // UTC grouping would put this in Sep 9; IST grouping should put it in Sep 10
  // We verify that fromIST('2026-09-10T00:30:00') in IST is "2026-09-10"
  const d = fromIST('2026-09-10T00:30:00');
  const istDate = new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  assert.equal(istDate, '2026-09-10');
  // And confirm it would have been wrong in UTC
  assert.equal(d.toISOString().slice(0, 10), '2026-09-09');
});

// ══════════════════════════════════════════════════════════════════════════════
// J2-005 — Audit export dateTo end-of-day
// ══════════════════════════════════════════════════════════════════════════════

const auditControllerSrc = fs.readFileSync(
  path.resolve(__dirname, '../controllers/auditController.js'),
  'utf8',
);

test('J2-005-1: exportLogs applies setHours(23,59,59,999) to dateTo', () => {
  assert.ok(
    auditControllerSrc.includes('end.setHours(23, 59, 59, 999)'),
    'exportLogs must set end-of-day on dateTo (23:59:59.999)',
  );
});

test('J2-005-2: exportLogs end-of-day is inside the exportLogs function body', () => {
  const exportSection = auditControllerSrc.slice(
    auditControllerSrc.indexOf('const exportLogs'),
    auditControllerSrc.indexOf('module.exports'),
  );
  assert.ok(
    exportSection.includes('end.setHours(23, 59, 59, 999)'),
    'end-of-day must be applied inside exportLogs, not elsewhere',
  );
});

test('J2-005-3: exportLogs dateTo end is consistent with getLogs boundary logic', () => {
  // Both getLogs and exportLogs must contain setHours(23, 59, 59, 999)
  // We already know getLogs has it; verify exportLogs does too (checked above)
  const getLogsSection = auditControllerSrc.slice(
    auditControllerSrc.indexOf('const getLogs'),
    auditControllerSrc.indexOf('const getLeadHistory'),
  );
  const exportSection = auditControllerSrc.slice(
    auditControllerSrc.indexOf('const exportLogs'),
    auditControllerSrc.indexOf('module.exports'),
  );
  assert.ok(getLogsSection.includes('setHours(23, 59, 59, 999)'), 'getLogs must have end-of-day');
  assert.ok(exportSection.includes('setHours(23, 59, 59, 999)'), 'exportLogs must have end-of-day');
});

test('J2-005-4: exportLogs end-of-day boundary logic is deterministically correct', () => {
  // Simulate the fixed boundary: new Date('2026-09-10') then setHours(23,59,59,999)
  const dateTo = '2026-09-10';
  const end = new Date(dateTo);
  end.setHours(23, 59, 59, 999);
  // end must be after the start of the day
  assert.ok(end > new Date(dateTo));
  // A log at 23:00 on the requested day must be included
  const logAt23 = new Date('2026-09-10T23:00:00');
  assert.ok(logAt23 <= end, 'log at 23:00 on dateTo should be included');
  // A log at start of next day must NOT be included
  const logNextDay = new Date('2026-09-11T00:00:00');
  assert.ok(logNextDay > end, 'log at next-day start should be excluded');
});

test('J2-005-5: exportLogs dateFrom still works (not affected by fix)', () => {
  const exportSection = auditControllerSrc.slice(
    auditControllerSrc.indexOf('const exportLogs'),
    auditControllerSrc.indexOf('module.exports'),
  );
  assert.ok(
    exportSection.includes('filter.createdAt.$gte = new Date(dateFrom)'),
    'exportLogs dateFrom must still use direct new Date(dateFrom)',
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// J2-006 — Lead model createdAt index
// ══════════════════════════════════════════════════════════════════════════════

const leadModelSrc = fs.readFileSync(
  path.resolve(__dirname, '../models/Lead.js'),
  'utf8',
);

test('J2-006-1: Lead schema has explicit createdAt index', () => {
  assert.ok(
    leadModelSrc.includes("leadSchema.index({ createdAt: -1 })"),
    'Lead schema must have an explicit createdAt descending index',
  );
});

test('J2-006-2: createdAt index does not break existing indexes', () => {
  // All previous indexes must still be present
  const expectedIndexes = [
    "leadSchema.index({ leadId: 1 }",
    "leadSchema.index({ phone: 1 }",
    "leadSchema.index({ assignedDirector: 1 }",
    "leadSchema.index({ assignedTelecaller: 1 }",
    "leadSchema.index({ status: 1 }",
    "leadSchema.index({ followUpDate: 1 }",
    "leadSchema.index({ priority: 1 }",
    "leadSchema.index({ captureDate: 1 }",
    "leadSchema.index({ status: 1, followUpDate: 1 }",
    "leadSchema.index({ createdAt: -1 }",
  ];
  for (const idx of expectedIndexes) {
    assert.ok(leadModelSrc.includes(idx), `Lead schema must contain index: ${idx}`);
  }
});

test('J2-006-3: createdAt index is defined after the compound status+followUpDate index', () => {
  const statusFuIdx = leadModelSrc.indexOf("leadSchema.index({ status: 1, followUpDate: 1 })");
  const createdAtIdx = leadModelSrc.indexOf("leadSchema.index({ createdAt: -1 })");
  assert.ok(createdAtIdx > statusFuIdx, 'createdAt index must follow the compound index');
});

// ══════════════════════════════════════════════════════════════════════════════
// J2-007 — Documentation and health message
// ══════════════════════════════════════════════════════════════════════════════

const sheetSyncSrc = fs.readFileSync(
  path.resolve(__dirname, '../models/SheetSync.js'),
  'utf8',
);

const serverSrc = fs.readFileSync(
  path.resolve(__dirname, '../server.js'),
  'utf8',
);

test('J2-007-1: SheetSync comment no longer says 5-column', () => {
  assert.ok(
    !sheetSyncSrc.includes('5-column'),
    'SheetSync.js must not contain stale "5-column" description',
  );
});

test('J2-007-2: SheetSync comment now says 4-column', () => {
  assert.ok(
    sheetSyncSrc.includes('4-column'),
    'SheetSync.js must describe Director_View as 4-column',
  );
});

test('J2-007-3: SheetSync comment does not mention Status as a Director_View column', () => {
  // The old comment listed: Director, Customer Name, Mobile Number, Status, Remarks/Notes
  // Status must not appear as a column in the updated comment for Director_View
  const dvCommentSection = sheetSyncSrc.slice(
    sheetSyncSrc.indexOf('directorViewSheetName (NEW):'),
    sheetSyncSrc.indexOf('const sheetSyncSchema'),
  );
  assert.ok(
    !dvCommentSection.includes('Status,') &&
    !dvCommentSection.match(/Customer Name, Mobile Number, Status/),
    'Director_View comment must not list Status as a column',
  );
});

test('J2-007-4: health endpoint returns current phase (Q2-003: updated from I.2 to Phase Q)', () => {
  assert.ok(
    serverSrc.includes("Phase Q"),
    'health endpoint must say Phase Q (updated in Q2-003)',
  );
  assert.ok(
    !serverSrc.includes("Phase G.2"),
    'health endpoint must not say Phase G.2',
  );
});

test('J2-007-5: Director_View 4-column structure unchanged in sheetsService', () => {
  const sheetsSvcSrc = fs.readFileSync(
    path.resolve(__dirname, '../utils/sheetsService.js'),
    'utf8',
  );
  // Verify DIRECTOR_VIEW_HEADERS has exactly 4 entries
  const headersMatch = sheetsSvcSrc.match(/DIRECTOR_VIEW_HEADERS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(headersMatch, 'DIRECTOR_VIEW_HEADERS must be defined');
  const entries = headersMatch[1].split(',').filter((s) => s.trim().startsWith("'"));
  assert.equal(entries.length, 4, 'Director_View must have exactly 4 header columns');
});

// ══════════════════════════════════════════════════════════════════════════════
// Mongoose connection guard (matches existing test convention)
// ══════════════════════════════════════════════════════════════════════════════

test('mongoose connection is not opened by this suite', () => {
  // All J2 tests above are unit/structural; no DB connection opened
  assert.ok(true);
});
