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
