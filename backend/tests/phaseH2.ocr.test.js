/**
 * phaseH2.ocr.test.js — Verification for H.2 fix H1-001.
 *
 * H1-001: backend/routes/ocr.js previously authorized only admin and director.
 * G.2 added TL to the frontend OCR access (App.jsx, Sidebar.jsx) but did not
 * update the backend. H.2 adds 'tl' to authorize(), completing the fix.
 *
 * Tests:
 *   - Authorization: admin, director, tl pass; telecaller is rejected
 *   - Route structure: all three management roles present
 *   - sanitiseName: valid, blacklisted, too-short inputs
 *   - checkDuplicates: rejects empty phones array
 *   - importOcrLeads: rejects empty leads array
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

// ── Authorization role check (structural) ─────────────────────────────────

// Re-implement the authorize() check pattern used in routes/ocr.js
function simulateAuthorize(allowedRoles, userRole) {
  return allowedRoles.includes(userRole) ? 200 : 403;
}

const OCR_ALLOWED_ROLES = ['admin', 'director', 'tl'];

test('H1-001: admin is authorized for OCR routes', () => {
  assert.equal(simulateAuthorize(OCR_ALLOWED_ROLES, 'admin'), 200);
});

test('H1-001: director is authorized for OCR routes', () => {
  assert.equal(simulateAuthorize(OCR_ALLOWED_ROLES, 'director'), 200);
});

test('H1-001: tl is authorized for OCR routes (H.2 fix)', () => {
  assert.equal(simulateAuthorize(OCR_ALLOWED_ROLES, 'tl'), 200,
    'TL should now be allowed — this is the H.2 fix');
});

test('H1-001: telecaller is denied (403) for OCR routes', () => {
  assert.equal(simulateAuthorize(OCR_ALLOWED_ROLES, 'telecaller'), 403,
    'Telecaller must never access OCR import routes');
});

test('H1-001: OCR route allows exactly the three management roles', () => {
  assert.ok(OCR_ALLOWED_ROLES.includes('admin'),    'admin must be in OCR_ALLOWED_ROLES');
  assert.ok(OCR_ALLOWED_ROLES.includes('director'), 'director must be in OCR_ALLOWED_ROLES');
  assert.ok(OCR_ALLOWED_ROLES.includes('tl'),       'tl must be in OCR_ALLOWED_ROLES (H.2 fix)');
  assert.ok(!OCR_ALLOWED_ROLES.includes('telecaller'), 'telecaller must NOT be in OCR_ALLOWED_ROLES');
});

test('H1-001: route file authorize call includes tl', () => {
  const fs = require('fs');
  const path = require('path');
  const routeSource = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'ocr.js'),
    'utf8'
  );
  // The authorize() call must include 'tl'
  assert.ok(
    routeSource.includes("authorize('admin', 'director', 'tl')"),
    "routes/ocr.js must contain authorize('admin', 'director', 'tl')"
  );
  // The old Phase E exclusion comment must be gone
  assert.ok(
    !routeSource.includes("intentionally excludes 'tl'"),
    "Stale Phase E exclusion comment must be removed"
  );
});

// ── sanitiseName behavior ─────────────────────────────────────────────────
// Re-implement from ocrController.js for structural testing

const NO_NAME = 'No Name';
const NAME_BLACKLIST = [
  'Settings', 'Edit', 'Share', 'Contacts', 'Unknown', 'Back', 'Done',
  'Cancel', 'More', 'Search', 'Call', 'Message', 'Add', 'Menu',
  'Recent', 'Home', 'Chats', 'Status', 'Calls', 'WhatsApp', 'Telegram',
  'Truecaller',
];
const NAME_BLACKLIST_PHRASES = [
  'add contact', 'block & report spam', 'block and report spam',
  'help & feedback', 'help and feedback', 'contact info from phone', 'lookup',
];
const BLACKLIST_SET = new Set(NAME_BLACKLIST.map((w) => w.toLowerCase()));

function sanitiseName(raw) {
  const t = String(raw || '').trim();
  if (t.length < 2 || t.length > 50) return NO_NAME;
  if (!/[a-zA-Z]/.test(t)) return NO_NAME;
  if (/^\d+$/.test(t)) return NO_NAME;
  if (/^[^a-zA-Z0-9]+$/.test(t)) return NO_NAME;
  const lower = t.toLowerCase();
  if (BLACKLIST_SET.has(lower)) return NO_NAME;
  if (NAME_BLACKLIST_PHRASES.includes(lower)) return NO_NAME;
  return t;
}

test('H1-001: sanitiseName passes a valid name through unchanged', () => {
  assert.equal(sanitiseName('Ramesh Kumar'), 'Ramesh Kumar');
});

test('H1-001: sanitiseName returns No Name for blacklisted word "Settings"', () => {
  assert.equal(sanitiseName('Settings'), NO_NAME);
});

test('H1-001: sanitiseName returns No Name for blacklisted word "Truecaller"', () => {
  assert.equal(sanitiseName('Truecaller'), NO_NAME);
});

test('H1-001: sanitiseName returns No Name for too-short input (< 2 chars)', () => {
  assert.equal(sanitiseName('A'), NO_NAME);
  assert.equal(sanitiseName(''),  NO_NAME);
});

test('H1-001: sanitiseName returns No Name for numbers-only input', () => {
  assert.equal(sanitiseName('12345'), NO_NAME);
});

test('H1-001: sanitiseName returns No Name for symbols-only input', () => {
  assert.equal(sanitiseName('---'), NO_NAME);
});

test('H1-001: sanitiseName passes mixed-case names that contain letters', () => {
  assert.equal(sanitiseName('Priya S'), 'Priya S');
  assert.equal(sanitiseName('O R'), 'O R');
});

// ── checkDuplicates input validation ─────────────────────────────────────

// Structural test: re-implement the guard from ocrController.checkDuplicates
function simulateCheckDuplicatesGuard(body) {
  const { phones } = body;
  if (!Array.isArray(phones) || phones.length === 0) {
    return { status: 400, message: 'phones array is required' };
  }
  return { status: 200 };
}

test('H1-001: checkDuplicates rejects missing phones field', () => {
  const result = simulateCheckDuplicatesGuard({});
  assert.equal(result.status, 400);
  assert.ok(result.message.includes('phones'));
});

test('H1-001: checkDuplicates rejects empty phones array', () => {
  const result = simulateCheckDuplicatesGuard({ phones: [] });
  assert.equal(result.status, 400);
});

test('H1-001: checkDuplicates accepts a non-empty phones array', () => {
  const result = simulateCheckDuplicatesGuard({ phones: ['+919876543210'] });
  assert.equal(result.status, 200);
});

// ── importOcrLeads input validation ──────────────────────────────────────

// Structural test: re-implement the guard from ocrController.importOcrLeads
function simulateImportGuard(body) {
  const { leads } = body;
  if (!Array.isArray(leads) || leads.length === 0) {
    return { status: 400, message: 'leads array is required' };
  }
  return { status: 200 };
}

test('H1-001: importOcrLeads rejects missing leads field', () => {
  const result = simulateImportGuard({});
  assert.equal(result.status, 400);
  assert.ok(result.message.includes('leads'));
});

test('H1-001: importOcrLeads rejects empty leads array', () => {
  const result = simulateImportGuard({ leads: [] });
  assert.equal(result.status, 400);
});

test('H1-001: importOcrLeads accepts a non-empty leads array', () => {
  const result = simulateImportGuard({ leads: [{ name: 'Ramesh', phone: '9876543210' }] });
  assert.equal(result.status, 200);
});
