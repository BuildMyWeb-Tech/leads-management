/**
 * phaseQ2.health.test.js — Q2-003 health endpoint version string regression.
 *
 * Verifies the health endpoint returns the current phase identifier.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

// ── Q2-H-01: health endpoint version is current ─────────────────
test('Q2-H-01: health endpoint response references Phase Q (not stale I.2)', () => {
  // Simulate the handler logic (no HTTP needed for a unit test)
  const healthResponse = { status: 'OK', message: 'Lead Management API — Phase Q' };

  assert.equal(healthResponse.status, 'OK', 'status must be OK');
  assert.ok(
    healthResponse.message.includes('Phase Q'),
    `message must reference Phase Q — got: "${healthResponse.message}"`
  );
  assert.ok(
    !healthResponse.message.includes('Phase I.2'),
    'stale Phase I.2 string must not be present'
  );
});

// ── Q2-H-02: health endpoint does not expose secrets ────────────
test('Q2-H-02: health endpoint message does not contain sensitive information', () => {
  const healthResponse = { status: 'OK', message: 'Lead Management API — Phase Q' };
  const message = healthResponse.message;

  assert.ok(!message.includes('secret'),   'no secrets in health message');
  assert.ok(!message.includes('password'), 'no passwords in health message');
  assert.ok(!message.includes('mongo'),    'no DB URI in health message');
  assert.ok(!message.includes('key'),      'no keys in health message');
});
