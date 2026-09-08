/**
 * leadIdBulk.test.js — Phase C: Lead ID assignment for bulk-creation
 * paths (CSV import, OCR import) that use insertMany() and therefore
 * bypass Lead.js's pre('save') hook.
 *
 * leadsController.importCSV and ocrController.importOcrLeads both
 * call `generateLeadId(new Date())` once per row, sequentially,
 * before insertMany — this test simulates exactly that loop shape
 * using the same Phase B generator (via an injected fake counter, no
 * live DB) to prove the bulk path produces the same
 * DDMMYYYYNNNN sequencing and uniqueness guarantees as single-lead
 * creation, without a second/duplicate generator implementation.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { nextSequenceForDate, formatDateKey, formatLeadId } = require('../utils/leadIdGenerator');

const makeFakeCounterModel = () => {
  const store = new Map();
  return {
    async findOneAndUpdate(query, update) {
      const id = query._id;
      const current = store.get(id) || { _id: id, seq: 0 };
      const next = { _id: id, seq: current.seq + update.$inc.seq };
      store.set(id, next);
      return { ...next };
    },
  };
};

// Mirrors the exact loop shape used in leadsController.importCSV /
// ocrController.importOcrLeads: N rows, one `await` per row, same day.
const simulateBulkImportRow = async (date, fakeCounter, rowCount) => {
  const ids = [];
  for (let i = 0; i < rowCount; i++) {
    const seq = await nextSequenceForDate(date, fakeCounter);
    ids.push(formatLeadId(formatDateKey(date), seq));
  }
  return ids;
};

test('a CSV/OCR-style bulk import of multiple rows produces sequential, unique IDs', async () => {
  const fakeCounter = makeFakeCounterModel();
  const date = new Date(2026, 8, 8);
  const ids = await simulateBulkImportRow(date, fakeCounter, 5);
  assert.deepEqual(ids, [
    '080920260001', '080920260002', '080920260003', '080920260004', '080920260005',
  ]);
  assert.equal(new Set(ids).size, 5, 'no duplicate IDs within a bulk batch');
});

test('a bulk import continues the same day sequence as a prior single-lead creation', async () => {
  const fakeCounter = makeFakeCounterModel();
  const date = new Date(2026, 8, 8);

  // Simulate one earlier manual single-lead creation (e.g. via the
  // normal create-lead pre-save hook path) using the same counter.
  const manualSeq = await nextSequenceForDate(date, fakeCounter);
  const manualId = formatLeadId(formatDateKey(date), manualSeq);
  assert.equal(manualId, '080920260001');

  // Now a 3-row bulk import on the same day must continue from 2, not restart at 1.
  const bulkIds = await simulateBulkImportRow(date, fakeCounter, 3);
  assert.deepEqual(bulkIds, ['080920260002', '080920260003', '080920260004']);
});

test('two concurrent bulk import batches on the same day never collide', async () => {
  const fakeCounter = makeFakeCounterModel();
  const date = new Date(2026, 8, 8);

  const [batchA, batchB] = await Promise.all([
    simulateBulkImportRow(date, fakeCounter, 10),
    simulateBulkImportRow(date, fakeCounter, 10),
  ]);

  const all = [...batchA, ...batchB];
  assert.equal(new Set(all).size, 20, 'all 20 IDs across both concurrent batches must be unique');
});

test('a next-day bulk import resets its sequence independently of the previous day', async () => {
  const fakeCounter = makeFakeCounterModel();
  const day1 = new Date(2026, 8, 8);
  const day2 = new Date(2026, 8, 9);

  await simulateBulkImportRow(day1, fakeCounter, 3);
  const day2Ids = await simulateBulkImportRow(day2, fakeCounter, 2);

  assert.deepEqual(day2Ids, ['090920260001', '090920260002']);
});
