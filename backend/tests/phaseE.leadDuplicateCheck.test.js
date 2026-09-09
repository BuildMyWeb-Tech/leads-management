/**
 * phaseE.leadDuplicateCheck.test.js — bounded OCR duplicate-check
 * query. Verifies findExistingLeadsByPhones() queries ONLY candidate
 * phone variants via `phone: { $in: [...] }`, never `find({})`, using
 * a fake Mongoose-model-shaped object (no live DB).
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { phoneLookupVariants, findExistingLeadsByPhones } = require('../utils/leadDuplicateCheck');

test('phoneLookupVariants returns the digit-only key and a +prefixed variant', () => {
  assert.deepEqual(phoneLookupVariants('+91 98765 43210'), ['919876543210', '+919876543210']);
  assert.deepEqual(phoneLookupVariants('9876543210'), ['9876543210', '+9876543210']);
});

test('phoneLookupVariants returns an empty array for unparseable input', () => {
  assert.deepEqual(phoneLookupVariants(''), []);
  assert.deepEqual(phoneLookupVariants(null), []);
});

test('findExistingLeadsByPhones queries only candidate variants via $in, never the whole collection', async () => {
  let capturedQuery = null;
  const fakeLeadModel = {
    find(query) {
      capturedQuery = query;
      return {
        select() { return this; },
        populate() { return this; },
        lean: async () => [],
      };
    },
  };

  await findExistingLeadsByPhones(fakeLeadModel, ['9876543210', '+911234567890']);

  assert.ok(capturedQuery.phone, 'query must filter on phone');
  assert.ok(Array.isArray(capturedQuery.phone.$in), 'must use $in, not an unbounded {}');
  assert.ok(capturedQuery.phone.$in.length > 0);
  assert.ok(capturedQuery.phone.$in.length < 100, 'must be bounded by candidate count, not the whole collection');
  // The old, unbounded query shape would have been {} — assert this is not that.
  assert.notDeepEqual(capturedQuery, {});
});

test('findExistingLeadsByPhones returns [] without querying when there are no valid candidates', async () => {
  let called = false;
  const fakeLeadModel = { find() { called = true; return { select: () => this, populate: () => this, lean: async () => [] }; } };
  const result = await findExistingLeadsByPhones(fakeLeadModel, ['', null]);
  assert.deepEqual(result, []);
  assert.equal(called, false, 'should not query the database for an empty candidate set');
});

test('findExistingLeadsByPhones matches a lead stored with or without a leading +', async () => {
  const storedLeads = [
    { _id: '1', name: 'A', phone: '9876543210', status: 'New', assignedDirector: null },
    { _id: '2', name: 'B', phone: '+919876500000', status: 'New', assignedDirector: null },
  ];
  const fakeLeadModel = {
    find(query) {
      const variants = query.phone.$in;
      const matched = storedLeads.filter((l) => variants.includes(l.phone));
      const chain = { select() { return chain; }, populate() { return chain; }, lean: async () => matched };
      return chain;
    },
  };
  const result = await findExistingLeadsByPhones(fakeLeadModel, ['9876543210', '919876500000']);
  assert.equal(result.length, 2);
});
