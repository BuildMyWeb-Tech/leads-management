/**
 * phaseE.auditBeforeAfter.test.js — snapshotTrackedFields() captures
 * real before/after values for the generic lead-update audit event
 * (previously always `before: null`).
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { snapshotTrackedFields, AUDIT_TRACKED_FIELDS } = require('../utils/leadUpdateHelpers');

test('snapshots only fields present in the request body', () => {
  const lead = { name: 'Old Name', targetLocation: 'Old Location', budget: '50L', purpose: 'Investment' };
  const body = { targetLocation: 'New Location' };
  const snap = snapshotTrackedFields(lead, body);
  assert.deepEqual(snap, { targetLocation: 'Old Location' });
});

test('captures a real before value, not null, for a changed field', () => {
  const originalLead = { budget: '50L' };
  const body = { budget: '80L' };
  const before = snapshotTrackedFields(originalLead, body);
  assert.equal(before.budget, '50L');
  assert.notEqual(before.budget, null);

  const updatedLead = { budget: '80L' };
  const after = snapshotTrackedFields(updatedLead, body);
  assert.equal(after.budget, '80L');

  assert.notDeepEqual(before, after, 'before and after must actually differ for a real change');
});

test('multiple tracked fields are captured together', () => {
  const lead = { remarks: 'old remarks', purpose: 'Investment', propertyType: 'House' };
  const body = { remarks: 'new remarks', purpose: 'Residential' };
  const before = snapshotTrackedFields(lead, body);
  assert.deepEqual(before, { remarks: 'old remarks', purpose: 'Investment' });
  assert.equal(before.propertyType, undefined, 'unrelated fields not in body must not appear');
});

test('status and priority are intentionally excluded (they have their own dedicated audit events)', () => {
  assert.equal(AUDIT_TRACKED_FIELDS.includes('status'), false);
  assert.equal(AUDIT_TRACKED_FIELDS.includes('priority'), false);
});

test('no snapshot is produced for a field absent from the body, even if present on the lead', () => {
  const lead = { name: 'Test', email: 'test@example.com' };
  const body = { name: 'Renamed' };
  const snap = snapshotTrackedFields(lead, body);
  assert.deepEqual(snap, { name: 'Test' });
  assert.equal('email' in snap, false);
});
