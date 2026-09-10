/**
 * phaseG2.scheduler.test.js — Verification for G.2 crash-safe
 * reminder scheduler changes (P2-002).
 *
 * Tests the startup decision logic without requiring DB or timers.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Re-implement the helper functions from reminderScheduler.js
const getTodayISTString = (now = new Date()) => {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  return istNow.toISOString().slice(0, 10);
};

// After adding IST_OFFSET_MS, getUTCHours() equals the IST hour directly.
// e.g. now=03:30 UTC → istNow represents 09:00 → getUTCHours()=9.
const isPast9amIST = (now = new Date()) => {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  return istNow.getUTCHours() >= 9;
};

// Startup decision logic extracted for testing
function startupDecision(lastReminderDate, now) {
  const todayStr   = getTodayISTString(now);
  const alreadyRan = lastReminderDate === todayStr;

  if (!alreadyRan && isPast9amIST(now)) {
    return 'fire-now';    // missed run — fire immediately
  }
  return 'schedule';      // schedule for (next) 9 AM IST
}

// 2026-09-09 10:00 AM IST = 04:30 UTC (past 9 AM IST)
const PAST_9AM_IST   = new Date('2026-09-09T04:30:00Z');
// 2026-09-09 08:00 AM IST = 02:30 UTC (before 9 AM IST)
const BEFORE_9AM_IST = new Date('2026-09-09T02:30:00Z');

test('P2-002: getTodayISTString returns correct IST date string', () => {
  // UTC 2026-09-09T00:00:00Z → IST is still 2026-09-09 (05:30 IST)
  const dateStr = getTodayISTString(new Date('2026-09-09T00:00:00Z'));
  assert.equal(dateStr, '2026-09-09');
});

test('P2-002: isPast9amIST correctly identifies time after 9 AM IST', () => {
  assert.ok(isPast9amIST(PAST_9AM_IST),   '04:30 UTC should be past 9 AM IST');
  assert.ok(!isPast9amIST(BEFORE_9AM_IST),'02:30 UTC should be before 9 AM IST');
});

test('P2-002: isPast9amIST at exactly 9:00 AM IST (03:30 UTC)', () => {
  const exactly9am = new Date('2026-09-09T03:30:00Z');
  assert.ok(isPast9amIST(exactly9am), 'Exactly 9 AM IST should be considered past');
});

test('P2-002: server restarted after 9 AM IST, no prior run → fire immediately', () => {
  const decision = startupDecision(null, PAST_9AM_IST);
  assert.equal(decision, 'fire-now',
    'Should fire immediately when restarting past 9 AM without having run today');
});

test('P2-002: server restarted before 9 AM IST, no prior run → schedule', () => {
  const decision = startupDecision(null, BEFORE_9AM_IST);
  assert.equal(decision, 'schedule',
    'Should schedule for 9 AM when restarting before 9 AM');
});

test("P2-002: already ran today → don't fire again even if past 9 AM", () => {
  const todayStr = getTodayISTString(PAST_9AM_IST);
  const decision = startupDecision(todayStr, PAST_9AM_IST);
  assert.equal(decision, 'schedule',
    'Should not fire again when lastReminderDate matches today');
});

test('P2-002: ran yesterday → treat as not run today', () => {
  const yesterday = '2026-09-08';
  const decision  = startupDecision(yesterday, PAST_9AM_IST);
  assert.equal(decision, 'fire-now',
    'Yesterday string should not match today, so fire-now applies');
});

test('P2-002: idempotency — sending reminders twice on same IST day is prevented', () => {
  // Simulate two consecutive startup calls with same state
  const state = { lastReminderDate: null };

  // First startup: past 9 AM, no prior run
  const decision1 = startupDecision(state.lastReminderDate, PAST_9AM_IST);
  assert.equal(decision1, 'fire-now');

  // Simulate: fire ran, updated lastReminderDate
  state.lastReminderDate = getTodayISTString(PAST_9AM_IST);

  // Second startup: same day, already ran
  const decision2 = startupDecision(state.lastReminderDate, PAST_9AM_IST);
  assert.equal(decision2, 'schedule',
    'Second startup on same day should not fire again');
});

// ── H1-002: msUntilNext9amIST comparison fix ────────────────────────────
//
// Bug: the original code compared `next9am <= istNow` (now + 5.5h) instead
// of `next9am <= now`. In the 8:30–9:00 AM IST window (3:00–3:30 UTC),
// next9am (03:30 UTC) is correctly after now (03:00–03:30 UTC), BUT
// next9am < istNow (08:30–09:00 UTC), causing an incorrect day roll-over
// and a ~24h delay instead of ≤ 30 minutes.
//
// Fix: compare against `now` only.

const IST_OFFSET_MS_H2 = 5.5 * 60 * 60 * 1000;

// Re-implement the FIXED msUntilNext9amIST from reminderScheduler.js
function msUntilNext9amIST_fixed(now) {
  const istNow  = new Date(now.getTime() + IST_OFFSET_MS_H2);
  const next9am = new Date(istNow);
  next9am.setUTCHours(3, 30, 0, 0); // 9:00 AM IST = 03:30 UTC
  if (next9am <= now) {              // H.2 FIX: was istNow, now `now`
    next9am.setUTCDate(next9am.getUTCDate() + 1);
  }
  return next9am.getTime() - now.getTime();
}

// Also re-implement the BUGGY version for regression contrast
function msUntilNext9amIST_buggy(now) {
  const istNow  = new Date(now.getTime() + IST_OFFSET_MS_H2);
  const next9am = new Date(istNow);
  next9am.setUTCHours(3, 30, 0, 0);
  if (next9am <= istNow) {           // BUG: compares against istNow
    next9am.setUTCDate(next9am.getUTCDate() + 1);
  }
  return next9am.getTime() - now.getTime();
}

// 8:30 AM IST = 03:00 UTC
const IST_8_30AM = new Date('2026-09-09T03:00:00Z');
// 8:45 AM IST = 03:15 UTC
const IST_8_45AM = new Date('2026-09-09T03:15:00Z');
// 9:00 AM IST (exactly) = 03:30 UTC
const IST_9_00AM = new Date('2026-09-09T03:30:00Z');
// 9:01 AM IST = 03:31 UTC
const IST_9_01AM = new Date('2026-09-09T03:31:00Z');

const THIRTY_MINUTES_MS   = 30 * 60 * 1000;
const FIFTEEN_MINUTES_MS  = 15 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

test('H1-002: fixed — at 8:30 AM IST, next reminder is ≤ 30 minutes away', () => {
  const ms = msUntilNext9amIST_fixed(IST_8_30AM);
  assert.ok(ms > 0 && ms <= THIRTY_MINUTES_MS,
    `Expected ≤30 min but got ${Math.round(ms / 60000)} min`);
  assert.equal(Math.round(ms / 60000), 30, 'Should be exactly 30 minutes');
});

test('H1-002: fixed — at 8:45 AM IST, next reminder is ≤ 15 minutes away', () => {
  const ms = msUntilNext9amIST_fixed(IST_8_45AM);
  assert.ok(ms > 0 && ms <= FIFTEEN_MINUTES_MS,
    `Expected ≤15 min but got ${Math.round(ms / 60000)} min`);
  assert.equal(Math.round(ms / 60000), 15, 'Should be exactly 15 minutes');
});

test('H1-002: fixed — at 9:01 AM IST, next reminder is ~23h59m away (next day)', () => {
  const ms = msUntilNext9amIST_fixed(IST_9_01AM);
  const hours = ms / (60 * 60 * 1000);
  assert.ok(hours > 23.9 && hours < 24.1,
    `Expected ~24h but got ${hours.toFixed(2)}h`);
});

test('H1-002: fixed — the 8:30–9:00 AM IST window never rolls to next day', () => {
  // Any time strictly before 9:00 AM IST (i.e. minOffset 0–29) must return ≤ 30 minutes.
  // Exactly 9:00 AM IST (minOffset=30, now=03:30 UTC) has next9am === now, so the
  // >= comparison correctly rolls to the next day — that is correct behavior, not a bug.
  for (let minOffset = 0; minOffset < 30; minOffset++) {
    // Start at 8:30 AM IST (03:00 UTC), advance by minOffset minutes
    const t = new Date(IST_8_30AM.getTime() + minOffset * 60 * 1000);
    const ms = msUntilNext9amIST_fixed(t);
    assert.ok(ms >= 0 && ms <= THIRTY_MINUTES_MS,
      `At offset +${minOffset}min (${(30 - minOffset)}min before 9AM IST), ` +
      `expected ≤30min but got ${Math.round(ms / 60000)} min`);
  }
});

test('H1-002: buggy version incorrectly reports 24h+ delay at 8:30 AM IST (documents the bug)', () => {
  const ms = msUntilNext9amIST_buggy(IST_8_30AM);
  // The buggy version rolls over to next day, returning ~24.5h
  assert.ok(ms > TWENTY_FOUR_HOURS_MS,
    'Buggy version should return > 24h for the 8:30 AM IST case (documents original bug)');
});

test('H1-002: fixed and buggy agree for times well past 9 AM IST (no window overlap)', () => {
  // At 10 AM IST (04:30 UTC), both versions must agree: next reminder is ~23h away
  const tenAM_IST = new Date('2026-09-09T04:30:00Z');
  const fixed = msUntilNext9amIST_fixed(tenAM_IST);
  const buggy = msUntilNext9amIST_buggy(tenAM_IST);
  // Both should return ~23h (within a minute of each other)
  assert.ok(Math.abs(fixed - buggy) < 60 * 1000,
    'Fixed and buggy versions should agree outside the 8:30-9:00 AM IST window');
});

test('H1-002: source file uses correct comparison (next9am <= now)', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'reminderScheduler.js'),
    'utf8'
  );
  assert.ok(
    src.includes('next9am <= now'),
    'reminderScheduler.js must compare next9am against now (not istNow)'
  );
  assert.ok(
    !src.includes('next9am <= istNow'),
    'reminderScheduler.js must NOT compare next9am against istNow (that was the bug)'
  );
});
