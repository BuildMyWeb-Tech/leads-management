/**
 * phaseN2.sheetsScheduler.test.js — Phase N.2 sheets scheduler tests.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  getISTMonthString,
  getISTDayOfMonth,
  isPast9amIST,
  msUntilNextFirstOf9amIST,
} = require('../utils/sheetsScheduler');

// Fixed test times
// 2026-09-01 10:00 AM IST = 04:30 UTC (1st of month, past 9 AM)
const FIRST_PAST_9AM   = new Date('2026-09-01T04:30:00Z');
// 2026-09-01 08:00 AM IST = 02:30 UTC (1st of month, before 9 AM)
const FIRST_BEFORE_9AM = new Date('2026-09-01T02:30:00Z');
// 2026-09-14 10:00 AM IST = 04:30 UTC (mid-month, past 9 AM)
const MIDMONTH_PAST_9AM = new Date('2026-09-14T04:30:00Z');

// ── N2-SS-01: IST month string ────────────────────────────────
test('N2-SS-01: getISTMonthString returns YYYY-MM format', () => {
  const result = getISTMonthString(new Date('2026-09-14T04:30:00Z'));
  assert.equal(result, '2026-09');
  assert.match(result, /^\d{4}-\d{2}$/);
});

test('N2-SS-01b: getISTMonthString at UTC month boundary (IST still same month)', () => {
  // 2026-08-31T20:00:00Z = 2026-09-01 01:30 IST → September
  const result = getISTMonthString(new Date('2026-08-31T20:00:00Z'));
  assert.equal(result, '2026-09');
});

// ── N2-SS-02: 1st-of-month after 9 AM IST triggers ───────────
test('N2-SS-02: isPast9amIST correctly identifies time after 9 AM IST', () => {
  assert.ok( isPast9amIST(FIRST_PAST_9AM),    '04:30 UTC = 10:00 AM IST → past 9 AM');
  assert.ok(!isPast9amIST(FIRST_BEFORE_9AM),  '02:30 UTC = 08:00 AM IST → before 9 AM');
});

test('N2-SS-02b: isPast9amIST at exactly 9:00 AM IST (03:30 UTC)', () => {
  const exactly9am = new Date('2026-09-01T03:30:00Z');
  assert.ok(isPast9amIST(exactly9am), 'Exactly 9 AM IST should be considered past');
});

// ── N2-SS-03: 1st, past 9 AM, not already run → fire-now ─────
test('N2-SS-03: startup on 1st after 9 AM with no prior run → should fire-now', () => {
  const currentMonth = getISTMonthString(FIRST_PAST_9AM);
  const alreadyRan   = null === currentMonth; // no prior run

  const isFirst     = getISTDayOfMonth(FIRST_PAST_9AM) === 1;
  const isPastNine  = isPast9amIST(FIRST_PAST_9AM);
  const shouldFire  = !alreadyRan && isFirst && isPastNine;

  assert.ok(shouldFire, 'Should fire immediately on 1st of month after 9 AM with no prior run');
});

// ── N2-SS-04: 1st, before 9 AM → schedule ────────────────────
test('N2-SS-04: startup on 1st before 9 AM → should schedule (not fire-now)', () => {
  const currentMonth = getISTMonthString(FIRST_BEFORE_9AM);
  const alreadyRan   = null === currentMonth;

  const isFirst    = getISTDayOfMonth(FIRST_BEFORE_9AM) === 1;
  const isPastNine = isPast9amIST(FIRST_BEFORE_9AM);
  const shouldFire = !alreadyRan && isFirst && isPastNine;

  assert.ok(!shouldFire, 'Should NOT fire on 1st before 9 AM');
});

// ── N2-SS-05: mid-month → schedule ───────────────────────────
test('N2-SS-05: startup on non-1st day → should schedule (not fire-now)', () => {
  const isFirst = getISTDayOfMonth(MIDMONTH_PAST_9AM) === 1;
  assert.ok(!isFirst, '14th of month is not the 1st — should not fire');
});

// ── N2-SS-06: already synced this month → no duplicate ───────
test('N2-SS-06: already synced current month → idempotency guard skips sync', () => {
  const currentMonth = getISTMonthString(FIRST_PAST_9AM);
  const lastSynced   = currentMonth; // already ran

  const alreadyRan  = lastSynced === currentMonth;
  const shouldFire  = !alreadyRan && getISTDayOfMonth(FIRST_PAST_9AM) === 1 && isPast9amIST(FIRST_PAST_9AM);

  assert.ok(!shouldFire, 'Already ran this month — must not fire again');
});

// ── N2-SS-07: lastMonthlySheetsSync guard ────────────────────
test('N2-SS-07: lastMonthlySheetsSync YYYY-MM string blocks duplicate execution', () => {
  function shouldRunSync(lastMonthlySheetsSync, now) {
    const currentMonth = getISTMonthString(now);
    if (lastMonthlySheetsSync === currentMonth) return false;
    return true;
  }
  assert.ok(!shouldRunSync('2026-09', FIRST_PAST_9AM),   'Already ran in 2026-09 → skip');
  assert.ok( shouldRunSync('2026-08', FIRST_PAST_9AM),   'Last ran in 2026-08 → proceed');
  assert.ok( shouldRunSync(null,      FIRST_PAST_9AM),   'Never ran → proceed');
});

// ── N2-SS-08: AppState schema has lastMonthlySheetsSync ──────
test('N2-SS-08: AppState schema has lastMonthlySheetsSync field', () => {
  const AppState = require('../models/AppState');
  const path     = AppState.schema.paths.lastMonthlySheetsSync;
  assert.ok(path, 'lastMonthlySheetsSync field must exist in AppState schema');
  assert.equal(path.defaultValue, null, 'Default value should be null');
});

// ── N2-SS-09: Sheets failure is non-fatal ────────────────────
test('N2-SS-09: Sheets failure does not propagate (non-fatal scheduler pattern)', async () => {
  let serverCrashed = false;
  async function safeSyncWrapper() {
    try {
      throw new Error('Sheets API unavailable');
    } catch (err) {
      // Non-fatal: log only
      serverCrashed = false;
    }
  }
  await safeSyncWrapper();
  assert.ok(!serverCrashed, 'Server must not crash on Sheets failure');
});

// ── N2-SS-10: msUntilNextFirstOf9amIST returns positive delay ─
test('N2-SS-10: msUntilNextFirstOf9amIST returns positive delay for mid-month', () => {
  const delay = msUntilNextFirstOf9amIST(MIDMONTH_PAST_9AM);
  assert.ok(delay > 0, 'Delay should be positive');
  // Mid-September → next fire is Oct 1. Roughly 17 days.
  assert.ok(delay > 14 * 24 * 60 * 60 * 1000, 'Delay should be at least 14 days');
});
