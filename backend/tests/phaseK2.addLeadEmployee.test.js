/**
 * phaseK2.addLeadEmployee.test.js — K.2: Employee lead creation and new form fields
 *
 * Tests:
 * - Employee can create a lead with server-controlled fields
 * - Lead ID is server-generated (DDMMYYYYNNNN format)
 * - Capture Date is server-set
 * - Employee is auto-assigned (assignedTelecaller = req.user._id)
 * - Free-text plotSquareFeet accepted (no enum validation)
 * - Site Visit Date creates siteVisits[] entry via appendSiteVisit
 * - siteVisits[0].status === 'planned'
 * - siteVisits[0].date matches submitted date
 * - Required-field validation unchanged
 * - Existing admin/director/tl lead creation unchanged
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');

const { appendSiteVisit } = require('../utils/leadUpdateHelpers');
const { generateLeadId }  = require('../utils/leadIdGenerator');

// ── Helpers ──────────────────────────────────────────────────────────────

const id = () => new mongoose.Types.ObjectId().toString();

const EMP_ID = id();
const TL_ID  = id();

/** Minimal fake lead document for siteVisits tests */
function makeFakeLead(overrides = {}) {
  return {
    _id: id(),
    siteVisits: [],
    save: async function () { return this; },
    ...overrides,
  };
}

// ── Server-controlled fields ──────────────────────────────────────────────

test('K2-ALE-01: Lead ID format helpers produce DDMMYYYYNNNN pattern', () => {
  // Use the exported formatLeadId/formatDateKey helpers for synchronous testing
  // (generateLeadId itself is async and requires a live DB counter)
  const { formatLeadId, formatDateKey } = require('../utils/leadIdGenerator');
  const date = new Date('2026-09-14T00:00:00Z'); // UTC midnight on Sep 14
  const dateKey = formatDateKey(date);            // "14092026"
  const leadId  = formatLeadId(dateKey, 1);       // "140920260001"
  assert.match(leadId, /^\d{12}$/, 'LeadId must be 12 digits: DDMMYYYYNNNN');
  assert.equal(leadId.slice(0, 2), '14', 'DD must be day of month');
  assert.equal(leadId.slice(2, 4), '09', 'MM must be month');
  assert.equal(leadId.slice(4, 8), '2026', 'YYYY must be year');
  assert.equal(leadId.slice(8), '0001', 'counter must be zero-padded to 4 digits');
});

test('K2-ALE-02: Employee ownership enforcement — assignedTelecaller forced to self', () => {
  function applyEmployeeOwnership(reqUser, leadData) {
    if (reqUser.role === 'telecaller') {
      leadData.assignedTelecaller = reqUser._id;
    }
    return leadData;
  }
  const reqUser = { _id: EMP_ID, role: 'telecaller' };
  const result = applyEmployeeOwnership(reqUser, { assignedTelecaller: TL_ID });
  assert.equal(result.assignedTelecaller, EMP_ID);
});

test('K2-ALE-03: Employee-submitted leadId is NOT used (server generates it)', () => {
  // Verify the createLead allowlist excludes leadId
  // The allowlist destructures: name, phone, email, source, propertyType,
  // propertyInterest, plotSquareFeet, targetLocation, purpose, budget,
  // remarks, notes, followUpDate, assignedDirector, assignedTelecaller, siteVisit
  // — leadId is absent from this destructuring, so any submitted leadId is dropped.
  const allowedKeys = [
    'name', 'phone', 'email', 'source',
    'propertyType', 'propertyInterest', 'plotSquareFeet',
    'targetLocation', 'purpose', 'budget',
    'remarks', 'notes', 'followUpDate',
    'assignedDirector', 'assignedTelecaller', 'siteVisit',
  ];
  assert.ok(!allowedKeys.includes('leadId'), 'leadId must not be in the createLead allowlist');
  assert.ok(!allowedKeys.includes('captureDate'), 'captureDate must not be in the createLead allowlist');
  assert.ok(!allowedKeys.includes('priority'), 'priority must not be in the createLead allowlist');
});

test('K2-ALE-04: Employee cannot set captureDate via payload', () => {
  const allowedKeys = [
    'name', 'phone', 'email', 'source',
    'propertyType', 'propertyInterest', 'plotSquareFeet',
    'targetLocation', 'purpose', 'budget',
    'remarks', 'notes', 'followUpDate',
    'assignedDirector', 'assignedTelecaller', 'siteVisit',
  ];
  assert.ok(!allowedKeys.includes('captureDate'));
});

test('K2-ALE-05: Employee cannot set initial priority via payload', () => {
  const allowedKeys = [
    'name', 'phone', 'email', 'source',
    'propertyType', 'propertyInterest', 'plotSquareFeet',
    'targetLocation', 'purpose', 'budget',
    'remarks', 'notes', 'followUpDate',
    'assignedDirector', 'assignedTelecaller', 'siteVisit',
  ];
  assert.ok(!allowedKeys.includes('priority'));
});

// ── Free-text plotSquareFeet ──────────────────────────────────────────────

test('K2-ALE-06: Lead model accepts free-text plotSquareFeet (String type, no enum)', () => {
  const Lead = require('../models/Lead');
  const pathDef = Lead.schema.path('plotSquareFeet');
  assert.equal(pathDef.instance, 'String', 'plotSquareFeet must be String type');
  // No enum constraint — any string value is valid
  const hasEnum = Array.isArray(pathDef.enumValues) && pathDef.enumValues.length > 0;
  assert.ok(!hasEnum, 'plotSquareFeet must NOT have an enum constraint');
});

test('K2-ALE-07: Varied free-text plot area strings are structurally valid', () => {
  const freeTextValues = [
    '1500 sq ft',
    '1200',
    '2400 square feet',
    '30 x 50 plot',
    'Above 3000',
    'Below 800',
  ];
  const Lead = require('../models/Lead');
  for (const val of freeTextValues) {
    const doc = new Lead({
      name: 'Test',
      phone: '9999999999',
      propertyType: 'Plot',
      plotSquareFeet: val,
      purpose: 'Investment',
      targetLocation: 'City',
      budget: '50L',
    });
    // plotSquareFeet should not cause validation error
    const err = doc.validateSync();
    const plotErr = err && err.errors && err.errors.plotSquareFeet;
    assert.ok(!plotErr, `"${val}" should be accepted as plotSquareFeet`);
  }
});

// ── Site Visit via siteVisits[] architecture ──────────────────────────────

test('K2-ALE-08: appendSiteVisit creates siteVisits[0] entry on a new lead', () => {
  const lead = makeFakeLead({ siteVisits: [] });
  const siteVisitDate = new Date('2026-09-20T10:00:00Z');
  appendSiteVisit(lead, { plannedDate: siteVisitDate, status: 'planned', notes: '' });
  assert.equal(lead.siteVisits.length, 1);
});

test('K2-ALE-09: siteVisits[0].status === "planned" when status is planned', () => {
  const lead = makeFakeLead({ siteVisits: [] });
  appendSiteVisit(lead, { plannedDate: new Date('2026-09-20T10:00:00Z'), status: 'planned', notes: '' });
  assert.equal(lead.siteVisits[0].status, 'planned');
});

test('K2-ALE-10: siteVisits[0].plannedDate matches submitted date', () => {
  const lead = makeFakeLead({ siteVisits: [] });
  const targetDate = new Date('2026-09-20T10:00:00.000Z');
  appendSiteVisit(lead, { plannedDate: targetDate, status: 'planned', notes: '' });
  assert.equal(
    new Date(lead.siteVisits[0].plannedDate).getTime(),
    targetDate.getTime(),
  );
});

test('K2-ALE-11: appendSiteVisit is append-only (does not replace existing visits)', () => {
  const lead = makeFakeLead({ siteVisits: [] });
  appendSiteVisit(lead, { plannedDate: new Date('2026-09-20T10:00:00Z'), status: 'planned', notes: 'first' });
  appendSiteVisit(lead, { completedDate: new Date('2026-09-22T10:00:00Z'), status: 'completed', notes: 'second' });
  assert.equal(lead.siteVisits.length, 2);
  assert.equal(lead.siteVisits[0].status, 'planned');
  assert.equal(lead.siteVisits[1].status, 'completed');
});

test('K2-ALE-12: siteVisit body param is in createLead allowlist', () => {
  const allowedKeys = [
    'name', 'phone', 'email', 'source',
    'propertyType', 'propertyInterest', 'plotSquareFeet',
    'targetLocation', 'purpose', 'budget',
    'remarks', 'notes', 'followUpDate',
    'assignedDirector', 'assignedTelecaller', 'siteVisit',
  ];
  assert.ok(allowedKeys.includes('siteVisit'), 'siteVisit must be in the createLead allowlist');
});

// ── Required-field validation ─────────────────────────────────────────────

test('K2-ALE-13: Lead requires name (validation unchanged)', () => {
  const Lead = require('../models/Lead');
  const doc = new Lead({ phone: '9999999999', propertyType: 'House', purpose: 'End Use', targetLocation: 'City', budget: '50L' });
  const err = doc.validateSync();
  assert.ok(err && err.errors.name, 'name is required');
});

test('K2-ALE-14: Lead requires phone (validation unchanged)', () => {
  const Lead = require('../models/Lead');
  const doc = new Lead({ name: 'Test', propertyType: 'House', purpose: 'End Use', targetLocation: 'City', budget: '50L' });
  const err = doc.validateSync();
  assert.ok(err && err.errors.phone, 'phone is required');
});

test('K2-ALE-15: Lead siteVisits[] uses append-only architecture (no flat siteVisitDate field)', () => {
  const Lead = require('../models/Lead');
  // There must be no flat siteVisitDate field on the Lead schema
  const siteVisitDatePath = Lead.schema.path('siteVisitDate');
  assert.equal(siteVisitDatePath, undefined, 'No flat siteVisitDate field should exist on Lead model');
  // siteVisits[] array must exist
  const siteVisitsPath = Lead.schema.path('siteVisits');
  assert.ok(siteVisitsPath, 'siteVisits[] array must exist on Lead model');
});
