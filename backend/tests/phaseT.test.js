'use strict';
/**
 * phaseT.test.js — Phase T production-readiness tests
 *
 * Covers:
 *   T-1: Wrong credentials — generic 500 error message
 *   T-2: Telecaller priority update — backend authorization
 *   T-3: Dashboard stats — hotLeads / warmLeads returned, recentLeads absent
 *   T-7: TC-61 migration — isActive set on legacy documents
 */

const assert  = require('node:assert/strict');
const { test } = require('node:test');

// ── T-1: authController catch block returns generic message ──────────────────
test('T-1-01: login 500 returns generic message, not err.message', async () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/authController.js'),
    'utf8'
  );
  // Must NOT expose raw err.message in a 500 response
  assert.ok(
    !src.includes("res.status(500).json({ message: err.message })"),
    'authController must not expose err.message in 500 response'
  );
  // Must return a safe generic message
  assert.ok(
    src.includes('Something went wrong. Please try again.'),
    'authController must return safe generic 500 message'
  );
});

test('T-1-02: login still returns correct 401 message for wrong credentials', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/authController.js'),
    'utf8'
  );
  assert.ok(
    src.includes("'Invalid email or password'"),
    'login must return "Invalid email or password" for wrong credentials'
  );
});

test('T-1-03: login returns deactivated message for inactive account', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/authController.js'),
    'utf8'
  );
  assert.ok(
    src.includes('Your account has been deactivated'),
    'login must return account-deactivated message for isActive=false'
  );
});

// ── T-2: telecaller priority update ─────────────────────────────────────────
test('T-2-01: leadsController telecaller branch allows priority field', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/leadsController.js'),
    'utf8'
  );
  // The telecaller branch should now include priority update
  const telecallerSection = src.slice(
    src.indexOf("if (req.user.role === 'telecaller')"),
    src.indexOf("} else if (['admin', 'director', 'tl'].includes(req.user.role))")
  );
  assert.ok(
    telecallerSection.includes('req.body.priority'),
    'telecaller branch must handle req.body.priority'
  );
  assert.ok(
    telecallerSection.includes("lead.priority = req.body.priority"),
    "telecaller branch must assign lead.priority"
  );
});

test('T-2-02: telecaller branch validates priority against allowed values', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/leadsController.js'),
    'utf8'
  );
  const telecallerSection = src.slice(
    src.indexOf("if (req.user.role === 'telecaller')"),
    src.indexOf("} else if (['admin', 'director', 'tl'].includes(req.user.role))")
  );
  assert.ok(
    telecallerSection.includes("'Hot'") && telecallerSection.includes("'Warm'") && telecallerSection.includes("'Cold'"),
    'telecaller priority update must validate against Hot/Warm/Cold'
  );
  assert.ok(
    telecallerSection.includes('Invalid priority value'),
    'telecaller must return 400 for invalid priority'
  );
});

test('T-2-03: admin/director/tl branch also supports priority (Object.assign)', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/leadsController.js'),
    'utf8'
  );
  // admin/director/tl branch uses Object.assign(lead, rest) which includes priority
  const adminSection = src.slice(
    src.indexOf("} else if (['admin', 'director', 'tl'].includes(req.user.role))"),
    src.indexOf("} else {\n      // Fail-safe")
  );
  assert.ok(
    adminSection.includes('Object.assign(lead, rest)'),
    'admin/director/tl branch must use Object.assign for priority updates'
  );
});

// ── T-3: Dashboard stats returns hotLeads / warmLeads ────────────────────────
test('T-3-01: getDashboardStats response includes hotLeads', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/leadsController.js'),
    'utf8'
  );
  const statsSection = src.slice(src.indexOf('const getDashboardStats'));
  assert.ok(
    statsSection.includes('hotLeads'),
    'getDashboardStats must include hotLeads in response'
  );
});

test('T-3-02: getDashboardStats response includes warmLeads', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/leadsController.js'),
    'utf8'
  );
  const statsSection = src.slice(src.indexOf('const getDashboardStats'));
  assert.ok(
    statsSection.includes('warmLeads'),
    'getDashboardStats must include warmLeads in response'
  );
});

test('T-3-03: getDashboardStats no longer includes recentLeads', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/leadsController.js'),
    'utf8'
  );
  const statsSection = src.slice(src.indexOf('const getDashboardStats'));
  // recentLeads must not appear in the response json or the destructuring
  assert.ok(
    !statsSection.includes('recentLeads'),
    'getDashboardStats must NOT include recentLeads (removed in Phase T)'
  );
});

test('T-3-04: hotLeads query filters by priority Hot', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/leadsController.js'),
    'utf8'
  );
  const statsSection = src.slice(src.indexOf('const getDashboardStats'));
  assert.ok(
    statsSection.includes("priority: 'Hot'"),
    'hotLeads query must filter priority === Hot'
  );
});

test('T-3-05: warmLeads query filters by priority Warm', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/leadsController.js'),
    'utf8'
  );
  const statsSection = src.slice(src.indexOf('const getDashboardStats'));
  assert.ok(
    statsSection.includes("priority: 'Warm'"),
    'warmLeads query must filter priority === Warm'
  );
});

test('T-3-06: hotLeads and warmLeads use buildLeadVisibilityFilter (spread filter)', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../controllers/leadsController.js'),
    'utf8'
  );
  const statsSection = src.slice(src.indexOf('const getDashboardStats'));
  // Both queries should spread ...filter to apply visibility scoping
  const hotIdx  = statsSection.indexOf("priority: 'Hot'");
  const warmIdx = statsSection.indexOf("priority: 'Warm'");
  assert.ok(hotIdx  > -1, 'hotLeads query must exist');
  assert.ok(warmIdx > -1, 'warmLeads query must exist');
  // Check ...filter spread is present in the stats section
  assert.ok(
    statsSection.includes('...filter'),
    'hotLeads/warmLeads must spread visibility filter'
  );
});

// ── T-7: TC-61 migration in server.js ────────────────────────────────────────
test('T-7-01: server.js contains isActive migration on connectDB().then()', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../server.js'),
    'utf8'
  );
  assert.ok(
    src.includes('isActive: { $exists: false }'),
    'server.js must run isActive migration for absent-field documents'
  );
  assert.ok(
    src.includes("$set: { isActive: true }"),
    'server.js migration must set isActive=true'
  );
});

test('T-7-02: migration is chained on connectDB().then() not blocking startup', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../server.js'),
    'utf8'
  );
  assert.ok(
    src.includes('connectDB().then('),
    'migration must be chained on connectDB().then() so startup is non-blocking'
  );
});

test('T-7-03: migration has error handling to avoid crashing server', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../server.js'),
    'utf8'
  );
  assert.ok(
    src.includes('.catch('),
    'connectDB().then chain must have .catch() to prevent unhandled rejection'
  );
});

// ── T-4: PWA infrastructure already in place ─────────────────────────────────
test('T-4-01: App.jsx includes InstallPrompt component', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../frontend/src/App.jsx'),
    'utf8'
  );
  assert.ok(
    src.includes('<InstallPrompt />'),
    'App.jsx must render <InstallPrompt />'
  );
  assert.ok(
    src.includes("import InstallPrompt"),
    'App.jsx must import InstallPrompt'
  );
});

test('T-4-02: manifest.json exists with required PWA fields', () => {
  const manifest = JSON.parse(
    require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../frontend/public/manifest.json'),
      'utf8'
    )
  );
  assert.ok(manifest.name,       'manifest.json must have name');
  assert.ok(manifest.short_name, 'manifest.json must have short_name');
  assert.ok(manifest.start_url,  'manifest.json must have start_url');
  assert.strictEqual(manifest.display, 'standalone', 'manifest.json must have display=standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest.json must have icons');
});

test('T-4-03: service worker file exists', () => {
  const exists = require('node:fs').existsSync(
    require('node:path').join(__dirname, '../../frontend/public/sw.js')
  );
  assert.ok(exists, 'sw.js must exist in public/');
});

// ── T-6: Leads.jsx state persistence ─────────────────────────────────────────
test('T-6-01: Leads.jsx persists state to localStorage', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../frontend/src/pages/Leads.jsx'),
    'utf8'
  );
  assert.ok(
    src.includes('localStorage.setItem'),
    'Leads.jsx must save state to localStorage'
  );
  assert.ok(
    src.includes('localStorage.getItem'),
    'Leads.jsx must load state from localStorage'
  );
});

test('T-6-02: Leads.jsx uses user-scoped localStorage key', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../frontend/src/pages/Leads.jsx'),
    'utf8'
  );
  assert.ok(
    src.includes('leads_state_${user._id}') || src.includes("leads_state_${user._id}"),
    'Leads.jsx must scope localStorage key to user._id'
  );
});

test('T-6-03: Leads.jsx wraps localStorage in try/catch for resilience', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../frontend/src/pages/Leads.jsx'),
    'utf8'
  );
  // Count try/catch blocks around localStorage calls
  const tryCount = (src.match(/try \{/g) || []).length;
  assert.ok(
    tryCount >= 2,
    'Leads.jsx must wrap localStorage access in try/catch blocks'
  );
});

// ── T-2b: KanbanBoard includes telecaller in canDrag ─────────────────────────
test('T-2b-01: KanbanBoard canDrag includes telecaller role', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../frontend/src/components/leads/KanbanBoard.jsx'),
    'utf8'
  );
  assert.ok(
    src.includes("'telecaller'") && src.includes('canDrag'),
    'KanbanBoard must include telecaller in canDrag'
  );
  const canDragLine = src.split('\n').find(l => l.includes('canDrag') && l.includes('includes'));
  assert.ok(
    canDragLine && canDragLine.includes('telecaller'),
    'canDrag filter must include telecaller'
  );
});

test('T-2b-02: KanbanBoard applies touchAction none to draggable items', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../frontend/src/components/leads/KanbanBoard.jsx'),
    'utf8'
  );
  assert.ok(
    src.includes("touchAction: 'none'"),
    'KanbanBoard draggable must set touchAction: none for mobile touch support'
  );
});
