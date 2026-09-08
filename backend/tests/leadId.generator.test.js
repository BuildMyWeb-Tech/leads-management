/**
 * leadId.generator.test.js — Lead ID format + concurrency-safety tests.
 *
 * No real MongoDB connection is used. `nextSequenceForDate` accepts an
 * injectable "counterModel" — here we substitute a small in-memory
 * fake that reproduces MongoDB's atomic findOneAndUpdate($inc, upsert)
 * semantics (a single-threaded Node process serialises the awaits
 * inside it exactly like Mongo serialises writes to one document), so
 * the SEQUENCING ALGORITHM can be verified without a live database.
 *
 * The atomicity guarantee in production comes from MongoDB itself
 * (findOneAndUpdate with $inc is a single atomic document operation) —
 * that guarantee is a property of MongoDB, not something unit tests
 * can independently re-prove without a real or in-memory Mongo
 * server, which is not available in this environment. This is a
 * documented limitation, per Phase B instructions.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  formatDateKey,
  formatLeadId,
  nextSequenceForDate,
} = require('../utils/leadIdGenerator');

// ── Fake in-memory Counter model reproducing atomic $inc/upsert ────
const makeFakeCounterModel = () => {
  const store = new Map();
  return {
    async findOneAndUpdate(query, update) {
      const id = query._id;
      const current = store.get(id) || { _id: id, seq: 0 };
      const next = { _id: id, seq: current.seq + update.$inc.seq };
      store.set(id, next);
      // Return a fresh snapshot object — mirrors real MongoDB, where
      // each findOneAndUpdate call returns its own independent
      // document snapshot rather than a shared mutable reference.
      return { ...next };
    },
  };
};

test('formatDateKey produces DDMMYYYY', () => {
  const d = new Date(2026, 8, 8); // 8 Sep 2026 (month is 0-based)
  assert.equal(formatDateKey(d), '08092026');
});

test('formatDateKey pads single-digit day/month', () => {
  const d = new Date(2026, 0, 5); // 5 Jan 2026
  assert.equal(formatDateKey(d), '05012026');
});

test('formatLeadId zero-pads the sequence to 4 digits', () => {
  assert.equal(formatLeadId('08092026', 1), '080920260001');
  assert.equal(formatLeadId('08092026', 23), '080920260023');
});

test('first lead of a day gets sequence 0001', async () => {
  const fakeCounter = makeFakeCounterModel();
  const date = new Date(2026, 8, 8);
  const seq = await nextSequenceForDate(date, fakeCounter);
  assert.equal(seq, 1);
  assert.equal(formatLeadId(formatDateKey(date), seq), '080920260001');
});

test('second and third leads of the same day increment sequentially', async () => {
  const fakeCounter = makeFakeCounterModel();
  const date = new Date(2026, 8, 8);
  const first  = await nextSequenceForDate(date, fakeCounter);
  const second = await nextSequenceForDate(date, fakeCounter);
  const third  = await nextSequenceForDate(date, fakeCounter);
  assert.deepEqual(
    [first, second, third].map((s) => formatLeadId('08092026', s)),
    ['080920260001', '080920260002', '080920260003']
  );
});

test('sequence resets on the next calendar day (separate counter document)', async () => {
  const fakeCounter = makeFakeCounterModel();
  const day1 = new Date(2026, 8, 8);
  const day2 = new Date(2026, 8, 9);

  await nextSequenceForDate(day1, fakeCounter);
  await nextSequenceForDate(day1, fakeCounter);
  const day2Seq = await nextSequenceForDate(day2, fakeCounter);

  assert.equal(day2Seq, 1);
  assert.equal(formatLeadId(formatDateKey(day2), day2Seq), '090920260001');
});

test('concurrent requests for the same day never receive the same sequence', async () => {
  const fakeCounter = makeFakeCounterModel();
  const date = new Date(2026, 8, 8);

  const results = await Promise.all(
    Array.from({ length: 20 }, () => nextSequenceForDate(date, fakeCounter))
  );

  const unique = new Set(results);
  assert.equal(unique.size, 20, 'every concurrent call must receive a unique sequence number');
  assert.deepEqual([...results].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
});

test('generated IDs are unique across two different days worth of leads', async () => {
  const fakeCounter = makeFakeCounterModel();
  const day1 = new Date(2026, 8, 8);
  const day2 = new Date(2026, 8, 9);

  const ids = [];
  for (let i = 0; i < 3; i++) {
    const seq = await nextSequenceForDate(day1, fakeCounter);
    ids.push(formatLeadId(formatDateKey(day1), seq));
  }
  const seq = await nextSequenceForDate(day2, fakeCounter);
  ids.push(formatLeadId(formatDateKey(day2), seq));

  assert.deepEqual(ids, ['080920260001', '080920260002', '080920260003', '090920260001']);
  assert.equal(new Set(ids).size, ids.length);
});
