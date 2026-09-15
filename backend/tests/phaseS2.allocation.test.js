/**
 * phaseS2.allocation.test.js — S.2 hierarchical employee allocation tests.
 *
 * All tests are static/structural (source-code and schema inspection) so
 * they run without a live MongoDB connection, following the project's
 * established node:test pattern.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const engineSrc = fs.readFileSync(
  path.resolve(__dirname, '../utils/allocationEngine.js'), 'utf8'
);
const leadCtrlSrc = fs.readFileSync(
  path.resolve(__dirname, '../controllers/leadsController.js'), 'utf8'
);
const userCtrlSrc = fs.readFileSync(
  path.resolve(__dirname, '../controllers/usersController.js'), 'utf8'
);
const attendanceRouteSrc = fs.readFileSync(
  path.resolve(__dirname, '../routes/attendance.js'), 'utf8'
);

// ── S2-AL-01: pickNextEmployee is exported ───────────────────────
test('S2-AL-01: pickNextEmployee is exported from allocationEngine', () => {
  const engine = require('../utils/allocationEngine');
  assert.strictEqual(typeof engine.pickNextEmployee, 'function',
    'pickNextEmployee must be exported as a function');
});

// ── S2-AL-02: null when no TLs under Director ────────────────────
test('S2-AL-02: pickNextEmployee returns null when no TLs found for director', () => {
  // Verified by structural inspection: tls.length check before proceeding
  assert.ok(engineSrc.includes('if (!tls.length) return null'),
    'Must return null when no TLs found for director');
});

// ── S2-AL-03: null when no active employees ──────────────────────
test('S2-AL-03: pickNextEmployee returns null when TLs exist but no active Employees', () => {
  assert.ok(engineSrc.includes('if (!candidates.length) return null'),
    'Must return null when no active employee candidates found');
});

// ── S2-AL-04: null when none Present today ───────────────────────
test('S2-AL-04: pickNextEmployee returns null when employees are active but none Present today', () => {
  assert.ok(engineSrc.includes('if (!presentRecords.length) return null'),
    'Must return null when no present records found');
});

// ── S2-AL-05: selects an employee when one is Present ────────────
test('S2-AL-05: pickNextEmployee returns eligible[0] when at least one Present', () => {
  assert.ok(engineSrc.includes('return eligible[0]._id'),
    'Must return the first eligible employee _id');
});

// ── S2-AL-06: inactive employee excluded ─────────────────────────
test('S2-AL-06: inactive Employee excluded from candidate query', () => {
  // The candidate query includes isActive: true
  assert.ok(engineSrc.includes("isActive:  true,\n    }).select('_id').lean();\n\n    if (!candidates.length)") ||
            engineSrc.includes("isActive: true"),
    'Employee candidate query must filter isActive: true');
  // Confirm isActive appears in the candidates lookup context
  const candidatesBlock = engineSrc.slice(
    engineSrc.indexOf('role:      \'telecaller\''),
    engineSrc.indexOf('if (!candidates.length)')
  );
  assert.ok(candidatesBlock.includes('isActive'), 'isActive must be in telecaller query');
});

// ── S2-AL-07: absent employee excluded ───────────────────────────
test('S2-AL-07: absent Employee excluded via Attendance intersection', () => {
  assert.ok(engineSrc.includes('employee:     { $in: candidateIds }'),
    'Attendance query must filter by candidateIds');
  assert.ok(engineSrc.includes("presentIds.includes(String(c._id))"),
    'Eligible filter must use presentIds intersection');
});

// ── S2-AL-08: employee under another Director excluded ───────────
test('S2-AL-08: Employee under another Director is excluded via TL managedBy chain', () => {
  // The TL query filters managedBy = directorId, so only TLs under THIS
  // director are retrieved. Employees of other directors' TLs are never
  // in the candidate list.
  const tlsBlock = engineSrc.slice(
    engineSrc.indexOf('// Step 1: TLs under this director'),
    engineSrc.indexOf('// Step 2: Active telecallers')
  );
  assert.ok(tlsBlock.includes('managedBy: directorId'),
    'TL query must be scoped to the picked director');
});

// ── S2-AL-09: createLead assigns Director + Employee when eligible ─
test('S2-AL-09: createLead calls pickNextEmployee after Director pick', () => {
  assert.ok(leadCtrlSrc.includes('pickNextEmployee'),
    'createLead must import and call pickNextEmployee');
  assert.ok(leadCtrlSrc.includes('const empId = await pickNextEmployee(pick.directorId)'),
    'createLead must call pickNextEmployee with the director id');
});

// ── S2-AL-10: createLead leaves Employee null when none eligible ──
test('S2-AL-10: createLead leaves assignedTelecaller null when pickNextEmployee returns null', () => {
  // The guard is: if (empId) leadData.assignedTelecaller = empId
  assert.ok(leadCtrlSrc.includes('if (empId) leadData.assignedTelecaller = empId'),
    'assignedTelecaller must only be set when empId is truthy');
});

// ── S2-AL-11: IST attendance date used ───────────────────────────
test('S2-AL-11: pickNextEmployee uses getISTDateString() for today', () => {
  assert.ok(engineSrc.includes("const { getISTDateString } = require('./dateHelper')"),
    'allocationEngine must import getISTDateString from dateHelper');
  assert.ok(engineSrc.includes('getISTDateString()'),
    'pickNextEmployee must call getISTDateString() for business date');
});

// ── S2-AL-12: TL.managedBy can point to Director ─────────────────
test('S2-AL-12: updateUser allows TL.managedBy to be set to a Director', () => {
  // updateUser no longer has `if (role === 'tl') update.managedBy = null`
  assert.ok(!userCtrlSrc.includes("if (role === 'tl') update.managedBy = null"),
    'updateUser must NOT auto-clear managedBy when role is tl');
  // The new code validates managedBy for tl role against director role
  assert.ok(userCtrlSrc.includes("manager.role !== 'director'"),
    "updateUser must validate TL's managedBy points to a director");
});

// ── S2-AL-13: invalid TL.managedBy rejected ──────────────────────
test('S2-AL-13: updateUser rejects TL.managedBy pointing to non-director', () => {
  // The source file uses an escaped apostrophe: 'A Team Lead\'s manager must be a Director'
  assert.ok(
    userCtrlSrc.includes("A Team Lead's manager must be a Director") ||
    userCtrlSrc.includes("A Team Lead\\'s manager must be a Director"),
    'updateUser must return error when TL managedBy is not a director'
  );
});

// ── S2-AL-14: importCSV gets Employee assignment ─────────────────
test('S2-AL-14: importCSV also calls pickNextEmployee for each row', () => {
  // importCSV already calls pickNextDirector; now it also calls pickNextEmployee
  const csvBlock = leadCtrlSrc.slice(
    leadCtrlSrc.indexOf('const importCSV'),
    leadCtrlSrc.indexOf('module.exports')
  );
  assert.ok(csvBlock.includes('pickNextEmployee'),
    'importCSV must call pickNextEmployee for each imported row');
  assert.ok(csvBlock.includes('raw.assignedTelecaller = empId'),
    'importCSV must set assignedTelecaller from Phase 2 result');
});

// ── S2-AL-15: telecaller-created lead remains self-owned ─────────
test('S2-AL-15: telecaller-created lead is not overwritten by Phase 2', () => {
  // The guard: if (req.user.role !== 'telecaller' && !leadData.assignedTelecaller)
  assert.ok(
    leadCtrlSrc.includes("req.user.role !== 'telecaller' && !leadData.assignedTelecaller"),
    'Phase 2 must be skipped for telecaller-created leads'
  );
});

// ── S2-AL-16: manual bulkAssign still enforces attendance ────────
test('S2-AL-16: bulkAssign attendance gate unchanged', () => {
  assert.ok(leadCtrlSrc.includes('not marked present today'),
    'bulkAssign attendance gate must still be present');
});

// ── S2-AL-17: AQRR regression — pickNextDirector unchanged ───────
test('S2-AL-17: Director AQRR regression — pickNextDirector/simulatePick unchanged', () => {
  const engine = require('../utils/allocationEngine');
  assert.strictEqual(typeof engine.pickNextDirector,  'function', 'pickNextDirector must exist');
  assert.strictEqual(typeof engine.simulatePick,      'function', 'simulatePick must exist');
  assert.strictEqual(typeof engine.previewSequence,   'function', 'previewSequence must exist');

  // Verify the AQRR math is intact: A=9,B=4,C=4,D=1 → first 4 picks: A B C D
  const { simulatePick, freshCycleRemaining } = engine;
  const enabled = [
    { director: 'A', sequenceOrder: 0, quota: 9 },
    { director: 'B', sequenceOrder: 1, quota: 4 },
    { director: 'C', sequenceOrder: 2, quota: 4 },
    { director: 'D', sequenceOrder: 3, quota: 1 },
  ];
  let cr = freshCycleRemaining(enabled);
  let ptr = 0;
  const seq = [];
  for (let i = 0; i < 18; i++) {
    const { directorIndex, nextCycleRemaining, nextPointer } = simulatePick(enabled, cr, ptr);
    seq.push(enabled[directorIndex].director);
    cr = nextCycleRemaining;
    ptr = nextPointer;
  }
  const expected = ['A','B','C','D','A','B','C','A','B','C','A','B','C','A','A','A','A','A'];
  assert.deepStrictEqual(seq, expected, 'AQRR sequence A=9,B=4,C=4,D=1 must match spec');
});

// ── S2-AL-18: multiple TLs under same Director ───────────────────
test('S2-AL-18: pickNextEmployee pools employees across multiple TLs under same Director', () => {
  // The TL query returns ALL TLs with managedBy = directorId (not just one)
  // and the employee query uses $in: tlIds (array), not a single tlId.
  assert.ok(engineSrc.includes('managedBy: { $in: tlIds }'),
    'Employee query must use $in: tlIds to pool across multiple TLs');
});

// ── S2-AL-19: multiple Directors have isolated Employee pools ─────
test('S2-AL-19: different Directors produce disjoint Employee pools', () => {
  // Isolation is guaranteed because TL query is scoped to ONE directorId.
  // TLs under Director2 have managedBy = Director2._id, which does not
  // match a query for Director1's id.
  const tlBlock = engineSrc.slice(
    engineSrc.indexOf('// Step 1: TLs under this director'),
    engineSrc.indexOf('const tlIds')
  );
  assert.ok(tlBlock.includes('managedBy: directorId'),
    'TL scope must use single directorId — isolates pools across directors');
});

// ── S2-AL-20: inactive TL/hierarchy cannot leak Employees ─────────
test('S2-AL-20: inactive TLs are excluded from the hierarchy walk', () => {
  const tlBlock = engineSrc.slice(
    engineSrc.indexOf('// Step 1: TLs under this director'),
    engineSrc.indexOf('// Step 2: Active telecallers')
  );
  assert.ok(tlBlock.includes('isActive:  true'),
    'TL query must require isActive: true — inactive TLs must not leak employees');
});

// ── S2-AL-21: client-supplied assignedTelecaller cannot override ──
test('S2-AL-21: non-admin, non-telecaller callers cannot force assignedTelecaller', () => {
  assert.ok(
    leadCtrlSrc.includes("req.user.role !== 'admin' && req.user.role !== 'telecaller'"),
    'createLead must delete client-supplied assignedTelecaller for non-admin/non-telecaller'
  );
  assert.ok(
    leadCtrlSrc.includes("delete leadData.assignedTelecaller"),
    'assignedTelecaller must be deleted from leadData for restricted roles'
  );
});

// ── S2-AL-22: zero-present returns null (safe fallback) ──────────
test('S2-AL-22: zero-present employees produces null from pickNextEmployee', () => {
  // presentRecords.length === 0 → return null before selection
  assert.ok(engineSrc.includes('if (!presentRecords.length) return null'),
    'Must return null (not throw) when no employees are present today');
});

// ── S2-AL-23: distribution does not always pick same employee ─────
test('S2-AL-23: least-loaded selection distributes leads across eligible employees', () => {
  // Uses Lead.aggregate to count today's leads per employee, then sorts
  // by ascending count. This prevents one employee always being first.
  assert.ok(engineSrc.includes('$group: { _id: \'$assignedTelecaller\', count: { $sum: 1 } }'),
    'Must aggregate today\'s lead counts per employee for fair distribution');
  assert.ok(engineSrc.includes('countMap[String(a._id)]') && engineSrc.includes('countMap[String(b._id)]'),
    'Sort must compare employees by lead count from countMap');
});

// ── S2-AL-24: Director AQRR state never touched by Phase 2 ────────
test('S2-AL-24: pickNextEmployee never reads or writes AllocationConfig', () => {
  const phase2Block = engineSrc.slice(
    engineSrc.indexOf('const pickNextEmployee'),
    engineSrc.indexOf('module.exports')
  );
  assert.ok(!phase2Block.includes('AllocationConfig'),
    'pickNextEmployee must NOT touch AllocationConfig (Director AQRR state)');
});
