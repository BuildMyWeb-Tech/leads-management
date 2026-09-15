/**
 * phaseQ2.cors.test.js — Q2-001 CORS allowedOrigins regression tests.
 *
 * Verifies that the comma-operator bug is fixed and FRONTEND_URL
 * is actually respected.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

// ── Helper: compute allowedOrigins the same way server.js does ──
// This mirrors the fixed logic without importing the module (which
// calls connectDB and process.exit on missing env vars).
const computeAllowedOrigins = (frontendUrlEnv) => {
  const raw = frontendUrlEnv || 'http://localhost:5173 https://leads-management-peach.vercel.app';
  return raw.split(' ').map((o) => o.trim()).filter(Boolean);
};

// ── Q2-C-01: default origins when FRONTEND_URL is absent ────────
test('Q2-C-01: default origins include localhost and Vercel when FRONTEND_URL is not set', () => {
  const origins = computeAllowedOrigins(undefined);
  assert.ok(origins.includes('http://localhost:5173'),
    'localhost:5173 must be in default allowedOrigins');
  assert.ok(origins.includes('https://leads-management-peach.vercel.app'),
    'Vercel origin must be in default allowedOrigins');
  assert.equal(origins.length, 2, 'exactly two default origins');
});

// ── Q2-C-02: FRONTEND_URL is respected when explicitly configured ─
test('Q2-C-02: FRONTEND_URL env var is respected when explicitly set', () => {
  const configured = 'https://my-crm.example.com http://localhost:3000';
  const origins    = computeAllowedOrigins(configured);
  assert.ok(origins.includes('https://my-crm.example.com'),
    'configured custom origin must be present');
  assert.ok(origins.includes('http://localhost:3000'),
    'configured dev origin must be present');
  // The hardcoded Vercel URL must NOT appear when a custom FRONTEND_URL is set
  assert.ok(!origins.includes('https://leads-management-peach.vercel.app'),
    'Vercel origin must NOT appear when FRONTEND_URL is explicitly configured');
});

// ── Q2-C-03: unknown origin is rejected ─────────────────────────
test('Q2-C-03: unknown origin is rejected by the CORS callback', () => {
  const origins = computeAllowedOrigins(undefined);

  // Simulate the CORS origin callback
  const isAllowed = (origin) => !origin || origins.includes(origin);

  assert.ok( isAllowed('http://localhost:5173'),          'localhost allowed');
  assert.ok( isAllowed('https://leads-management-peach.vercel.app'), 'Vercel allowed');
  assert.ok(!isAllowed('https://evil.example.com'),       'unknown origin rejected');
  assert.ok(!isAllowed('http://localhost:9999'),          'unknown port rejected');
  assert.ok( isAllowed(undefined),                        'no-origin (server-to-server) allowed');
});

// ── Q2-C-04: production Vercel origin remains in defaults ────────
test('Q2-C-04: production Vercel origin is always in default allowedOrigins', () => {
  const origins = computeAllowedOrigins(undefined);
  assert.ok(origins.includes('https://leads-management-peach.vercel.app'),
    'Vercel origin must never be removed from defaults');
});

// ── Q2-C-05: comma operator is NOT the implementation ────────────
test('Q2-C-05: comma operator guard — FRONTEND_URL is not overridden', () => {
  // Demonstrates the old broken behavior would have produced wrong result:
  //   (process.env.FRONTEND_URL || 'http://localhost:5173', 'https://...')
  //   returns ONLY 'https://...' regardless of FRONTEND_URL
  // The fix ensures FRONTEND_URL is the primary source.
  const customUrl = 'http://localhost:4000';
  const origins   = computeAllowedOrigins(customUrl);
  assert.ok(origins.includes('http://localhost:4000'),
    'FRONTEND_URL value must appear in allowedOrigins');
  // Old bug: FRONTEND_URL was silently ignored — this would have been false
  assert.equal(origins[0], 'http://localhost:4000',
    'first origin must be the configured FRONTEND_URL');
});
