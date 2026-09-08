/**
 * leadBusinessRules.test.js — Phase C priority escalation + plot
 * cross-field cleanup. Uses in-memory Mongoose documents only
 * (validateSync/isModified work without a DB connection); no live
 * database is used.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Lead = require('../models/Lead');
const { applyLeadBusinessRules, applyPriorityEscalation, clearPlotSquareFeetIfNotPlot } = require('../utils/leadBusinessRules');

const baseLead = (overrides = {}) => new Lead({ name: 'Test', phone: '9876543210', ...overrides });

test('priority defaults to Cold on a brand new lead', () => {
  const lead = baseLead();
  assert.equal(lead.priority, 'Cold');
});

test('Cold lead escalates to Hot when status becomes Site Visit Planned', () => {
  const lead = baseLead({ status: 'Site Visit Planned' });
  applyLeadBusinessRules(lead);
  assert.equal(lead.priority, 'Hot');
});

test('Cold lead escalates to Hot when status becomes Site Visit Done', () => {
  const lead = baseLead({ status: 'Site Visit Done' });
  applyLeadBusinessRules(lead);
  assert.equal(lead.priority, 'Hot');
});

test('Cold lead escalates to Hot when status becomes Booked', () => {
  const lead = baseLead({ status: 'Booked' });
  applyLeadBusinessRules(lead);
  assert.equal(lead.priority, 'Hot');
});

test('Cold lead escalates to Hot when a planned site visit is added via siteVisits', () => {
  const lead = baseLead();
  lead.siteVisits.push({ status: 'planned', plannedDate: new Date('2026-10-01') });
  applyLeadBusinessRules(lead);
  assert.equal(lead.priority, 'Hot');
});

test('Cold lead escalates to Hot when a completed site visit is added via siteVisits', () => {
  const lead = baseLead();
  lead.siteVisits.push({ status: 'completed', completedDate: new Date('2026-09-01') });
  applyLeadBusinessRules(lead);
  assert.equal(lead.priority, 'Hot');
});

test('Hot lead does NOT downgrade when status later changes to a non-trigger status', () => {
  const lead = baseLead({ status: 'Booked' });
  applyLeadBusinessRules(lead); // -> Hot
  assert.equal(lead.priority, 'Hot');

  // Simulate a later, separate save() where status moves elsewhere.
  lead.status = 'Not Interested';
  applyPriorityEscalation(lead); // escalation-only rule must never touch an already-Hot lead
  assert.equal(lead.priority, 'Hot', 'priority must never be automatically downgraded');
});

test('a lead explicitly created as Warm is not silently escalated by an unrelated status', () => {
  const lead = baseLead({ status: 'Called', priority: 'Warm' });
  applyLeadBusinessRules(lead);
  assert.equal(lead.priority, 'Warm', 'Called is not a Hot-trigger status');
});

test('priority is a separate concept from status — Booked status does not itself change status', () => {
  const lead = baseLead({ status: 'Booked' });
  applyLeadBusinessRules(lead);
  assert.equal(lead.status, 'Booked'); // untouched
  assert.equal(lead.priority, 'Hot');  // only priority reacts
});

test('plotSquareFeet is cleared when propertyType is House', () => {
  const lead = baseLead({ propertyType: 'House', plotSquareFeet: '1200' });
  clearPlotSquareFeetIfNotPlot(lead);
  assert.equal(lead.plotSquareFeet, null);
});

test('plotSquareFeet is cleared when propertyType is absent', () => {
  const lead = baseLead({ plotSquareFeet: 'Above 1200' });
  clearPlotSquareFeetIfNotPlot(lead);
  assert.equal(lead.plotSquareFeet, null);
});

test('plotSquareFeet is preserved when propertyType is Plot', () => {
  const lead = baseLead({ propertyType: 'Plot', plotSquareFeet: 'Below 1200' });
  clearPlotSquareFeetIfNotPlot(lead);
  assert.equal(lead.plotSquareFeet, 'Below 1200');
});

test('legacy lead with no Phase B/C fields at all is unaffected by business rules', () => {
  const lead = new Lead({ name: 'Legacy', phone: '9998887776', status: 'Follow Up' });
  applyLeadBusinessRules(lead);
  assert.equal(lead.priority, 'Cold');
  assert.equal(lead.plotSquareFeet, null);
  assert.equal(lead.validateSync(), undefined);
});
