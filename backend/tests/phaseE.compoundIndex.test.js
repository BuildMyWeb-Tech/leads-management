/**
 * phaseE.compoundIndex.test.js — verifies the {status, followUpDate}
 * compound index is declared on the Lead schema. Checking
 * schema.indexes() (in-memory, no DB) confirms the declaration is
 * present; actual index creation happens against a live MongoDB and
 * isn't re-verified here.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Lead = require('../models/Lead');

test('Lead schema declares a compound index on {status, followUpDate}', () => {
  const indexes = Lead.schema.indexes(); // array of [fields, options]
  const hasCompound = indexes.some(([fields]) =>
    fields.status === 1 && fields.followUpDate === 1 && Object.keys(fields).length === 2
  );
  assert.ok(hasCompound, 'expected a compound index on {status:1, followUpDate:1}');
});

test('existing single-field indexes are still present (not removed)', () => {
  const indexes = Lead.schema.indexes();
  const singleFieldIndexed = (field) =>
    indexes.some(([fields]) => Object.keys(fields).length === 1 && fields[field] === 1);

  for (const field of ['phone', 'assignedDirector', 'assignedTelecaller', 'status', 'followUpDate', 'priority', 'captureDate']) {
    assert.ok(singleFieldIndexed(field), `expected existing single-field index on "${field}" to remain`);
  }
});

test('the unique sparse leadId index is still present (not removed)', () => {
  const indexes = Lead.schema.indexes();
  const leadIdIndex = indexes.find(([fields]) => Object.keys(fields).length === 1 && fields.leadId === 1);
  assert.ok(leadIdIndex, 'expected a leadId index');
  const [, options] = leadIdIndex;
  assert.equal(options.unique, true);
  assert.equal(options.sparse, true);
});
