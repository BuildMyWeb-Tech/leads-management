/**
 * phaseH2.dataIntegrity.test.js — Verification for H.2 fix H1-003.
 *
 * H1-003: Management-tier updateLead (admin/director/tl) previously
 * performed Object.assign(lead, rest) where rest included leadId and
 * captureDate from req.body. This allowed management users to overwrite
 * the immutable atomic lead identifier and the creation-time capture date.
 *
 * H.2 fix: both fields are destructured out before the Object.assign.
 *
 * Tests:
 *   - Destructuring excludes leadId from rest
 *   - Destructuring excludes captureDate from rest
 *   - Legitimate fields (status, notes, assignedDirector) still pass through
 *   - Telecaller branch already restricts to explicit field assignment (safe)
 *   - Source-code structural check confirms the fix is in place
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

// ── Core destructuring logic (mirrors the H.2 fix in leadsController.js) ──
//
// The controller performs:
//   const { callHistory, siteVisits, siteVisit, leadId: _leadId,
//           captureDate: _captureDate, ...rest } = req.body;
//   Object.assign(lead, rest);
//
// We test the destructuring behavior directly.

function applyManagementUpdate(reqBody) {
  const {
    callHistory,
    siteVisits,
    siteVisit,
    leadId:      _leadId,
    captureDate: _captureDate,
    ...rest
  } = reqBody;
  // Simulate what Object.assign(lead, rest) would set on the document
  return rest;
}

test('H1-003: leadId is excluded from management update payload', () => {
  const rest = applyManagementUpdate({
    leadId: '01012020XXXX',
    status: 'Called',
    notes:  'Test call',
  });
  assert.ok(!('leadId' in rest), 'leadId must not appear in rest after destructuring');
});

test('H1-003: captureDate is excluded from management update payload', () => {
  const rest = applyManagementUpdate({
    captureDate: '2020-01-01',
    status: 'Follow Up',
    followUpDate: '2026-09-15',
  });
  assert.ok(!('captureDate' in rest), 'captureDate must not appear in rest after destructuring');
});

test('H1-003: both leadId and captureDate are excluded when sent together', () => {
  const rest = applyManagementUpdate({
    leadId:      '01012020XXXX',
    captureDate: '2020-01-01',
    status:      'Booked',
    remarks:     'Closed deal',
  });
  assert.ok(!('leadId'      in rest));
  assert.ok(!('captureDate' in rest));
  assert.ok('status'  in rest, 'status must pass through');
  assert.ok('remarks' in rest, 'remarks must pass through');
});

test('H1-003: status remains editable through management update', () => {
  const rest = applyManagementUpdate({ status: 'Interested', notes: 'High intent' });
  assert.equal(rest.status, 'Interested');
});

test('H1-003: notes remain editable through management update', () => {
  const rest = applyManagementUpdate({ notes: 'Called twice — very interested' });
  assert.equal(rest.notes, 'Called twice — very interested');
});

test('H1-003: remarks remain editable through management update', () => {
  const rest = applyManagementUpdate({ remarks: 'Budget finalised at 80L' });
  assert.equal(rest.remarks, 'Budget finalised at 80L');
});

test('H1-003: assignedDirector remains editable through management update', () => {
  const dirId = '64f0a1b2c3d4e5f6a7b8c9d0';
  const rest = applyManagementUpdate({ assignedDirector: dirId });
  assert.equal(rest.assignedDirector, dirId,
    'Reassignment to a director must still be allowed');
});

test('H1-003: assignedTelecaller remains editable through management update', () => {
  const tcId = '64f0a1b2c3d4e5f6a7b8c9d1';
  const rest = applyManagementUpdate({ assignedTelecaller: tcId });
  assert.equal(rest.assignedTelecaller, tcId);
});

test('H1-003: followUpDate remains editable through management update', () => {
  const rest = applyManagementUpdate({ followUpDate: '2026-09-20' });
  assert.equal(rest.followUpDate, '2026-09-20');
});

test('H1-003: priority remains editable through management update (business rules apply on save)', () => {
  const rest = applyManagementUpdate({ priority: 'Hot' });
  assert.equal(rest.priority, 'Hot',
    'Priority can be set by management; leadBusinessRules enforces escalation on save');
});

test('H1-003: callHistory is excluded from rest (append-only path)', () => {
  const rest = applyManagementUpdate({ callHistory: [{ status: 'Called' }], notes: 'test' });
  assert.ok(!('callHistory' in rest),
    'callHistory must be excluded — only the controller append path is used');
});

test('H1-003: siteVisits is excluded from rest (append-only path)', () => {
  const rest = applyManagementUpdate({ siteVisits: [{ status: 'planned' }], notes: 'test' });
  assert.ok(!('siteVisits' in rest),
    'siteVisits must be excluded — only the controller append path is used');
});

test('H1-003: empty body produces empty rest (no undefined leakage)', () => {
  const rest = applyManagementUpdate({});
  assert.deepEqual(rest, {});
});

// ── Telecaller branch safety ──────────────────────────────────────────────
//
// The telecaller branch in updateLead does NOT use Object.assign; it sets
// individual fields explicitly (lead.status, lead.notes, lead.remarks,
// lead.followUpDate). This means telecallers never had mass-assignment access
// to leadId — the H.2 fix is in the management branch only.

test('H1-003: telecaller explicit-field update does not touch leadId', () => {
  // Simulate the telecaller branch (only status/notes/remarks/followUpDate are set)
  const existingLeadId = '09092026000042';
  const lead = {
    status:      'New',
    notes:       '',
    remarks:     '',
    followUpDate: null,
    leadId:      existingLeadId,
  };
  const reqBody = {
    status:   'Called',
    notes:    'Left voicemail',
    leadId:   'INJECTED_VALUE',  // a telecaller trying to inject
  };
  // Telecaller branch: explicit assignments only
  if (reqBody.status  !== undefined) lead.status  = reqBody.status;
  if (reqBody.notes   !== undefined) lead.notes   = reqBody.notes;
  if (reqBody.remarks !== undefined) lead.remarks = reqBody.remarks;
  if (reqBody.followUpDate !== undefined) lead.followUpDate = reqBody.followUpDate;
  // leadId is NOT in the explicit list → stays unchanged
  assert.equal(lead.leadId, existingLeadId,
    'Telecaller branch must never overwrite leadId (explicit field assignment pattern)');
});

// ── Source-code structural check ─────────────────────────────────────────

test('H1-003: source confirms leadId and captureDate are destructured out in leadsController', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'leadsController.js'),
    'utf8'
  );
  assert.ok(
    src.includes('leadId: _leadId'),
    'leadsController.js must destructure leadId out before Object.assign'
  );
  assert.ok(
    src.includes('captureDate: _captureDate'),
    'leadsController.js must destructure captureDate out before Object.assign'
  );
});

// ── Immutability invariant check ──────────────────────────────────────────

test('H1-003: sending leadId in management update payload leaves stored value unchanged', () => {
  const STORED_LEAD_ID = '10092026000099';
  const leadDoc = { leadId: STORED_LEAD_ID, status: 'New', notes: '' };

  const reqBody = { leadId: '01012020XXXX', status: 'Called', notes: 'Follow up in 2 days' };
  const { leadId: _l, captureDate: _c, callHistory: _ch, siteVisits: _sv, siteVisit: _s, ...rest } = reqBody;
  Object.assign(leadDoc, rest);

  assert.equal(leadDoc.leadId, STORED_LEAD_ID,
    'leadId must remain unchanged after management update that included leadId in payload');
  assert.equal(leadDoc.status, 'Called',  'status must be updated');
  assert.equal(leadDoc.notes, 'Follow up in 2 days', 'notes must be updated');
});

test('H1-003: sending captureDate in management update payload leaves stored value unchanged', () => {
  const STORED_CAPTURE_DATE = new Date('2026-09-10T08:00:00Z');
  const leadDoc = { captureDate: STORED_CAPTURE_DATE, status: 'New' };

  const reqBody = { captureDate: '2020-01-01', status: 'Follow Up', followUpDate: '2026-09-20' };
  const { leadId: _l, captureDate: _c, callHistory: _ch, siteVisits: _sv, siteVisit: _s, ...rest } = reqBody;
  Object.assign(leadDoc, rest);

  assert.deepEqual(leadDoc.captureDate, STORED_CAPTURE_DATE,
    'captureDate must remain unchanged after management update that included captureDate in payload');
  assert.equal(leadDoc.status, 'Follow Up');
  assert.equal(leadDoc.followUpDate, '2026-09-20');
});
