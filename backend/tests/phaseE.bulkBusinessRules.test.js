/**
 * phaseE.bulkBusinessRules.test.js — business rules applied to
 * bulk-insert (CSV/OCR) plain-object lead data, closing the
 * documented Phase C gap (insertMany bypasses pre('save')).
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { applyLeadBusinessRulesToPlainData } = require('../utils/leadBusinessRules');

test('a bulk row imported with status Booked escalates to priority Hot', () => {
  const row = { name: 'A', phone: '111', status: 'Booked' };
  applyLeadBusinessRulesToPlainData(row);
  assert.equal(row.priority, 'Hot');
});

test('a bulk row imported with status Site Visit Planned escalates to priority Hot', () => {
  const row = { name: 'A', phone: '111', status: 'Site Visit Planned' };
  applyLeadBusinessRulesToPlainData(row);
  assert.equal(row.priority, 'Hot');
});

test('a bulk row imported with a completed siteVisits entry escalates to priority Hot', () => {
  const row = { name: 'A', phone: '111', status: 'New', siteVisits: [{ status: 'completed' }] };
  applyLeadBusinessRulesToPlainData(row);
  assert.equal(row.priority, 'Hot');
});

test('a normal bulk row (status New) keeps default priority untouched', () => {
  const row = { name: 'A', phone: '111', status: 'New' };
  applyLeadBusinessRulesToPlainData(row);
  assert.equal(row.priority, undefined, 'schema default (Cold) applies at insertMany construction time, not here');
});

test('an already-Hot row is never downgraded by the plain-data rule', () => {
  const row = { name: 'A', phone: '111', status: 'New', priority: 'Hot' };
  applyLeadBusinessRulesToPlainData(row);
  assert.equal(row.priority, 'Hot');
});

test('House property type clears a stray plotSquareFeet on a bulk row', () => {
  const row = { name: 'A', phone: '111', propertyType: 'House', plotSquareFeet: '1200' };
  applyLeadBusinessRulesToPlainData(row);
  assert.equal(row.plotSquareFeet, null);
});

test('Plot property type preserves a valid plotSquareFeet on a bulk row', () => {
  const row = { name: 'A', phone: '111', propertyType: 'Plot', plotSquareFeet: 'Below 1200' };
  applyLeadBusinessRulesToPlainData(row);
  assert.equal(row.plotSquareFeet, 'Below 1200');
});

test('no propertyType at all also clears a stray plotSquareFeet on a bulk row', () => {
  const row = { name: 'A', phone: '111', plotSquareFeet: 'Above 1200' };
  applyLeadBusinessRulesToPlainData(row);
  assert.equal(row.plotSquareFeet, null);
});
