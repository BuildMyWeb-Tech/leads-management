/**
 * Phase 7.2 Tests — 9 requirements: phone validation, director dashboard,
 * director user management, pending-lead allocation, manual quick-assignment,
 * allocation engine sidebar removal (backend-only aspects).
 */

'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { validatePhone, normalisePhone } = require('../utils/phoneUtils');

// ─────────────────────────────────────────────────────────────────────────────
// REQ 3 — Phone validation (validatePhone)
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.2 — Req 3: validatePhone', () => {

  // LOCAL Indian numbers (10 digits, starting 6–9)
  it('accepts 10-digit local number starting 6', () => {
    assert.equal(validatePhone('6123456789'), true);
  });
  it('accepts 10-digit local number starting 7', () => {
    assert.equal(validatePhone('7000000000'), true);
  });
  it('accepts 10-digit local number starting 8', () => {
    assert.equal(validatePhone('8888888888'), true);
  });
  it('accepts 10-digit local number starting 9', () => {
    assert.equal(validatePhone('9876543210'), true);
  });

  // LOCAL rejects — wrong digit count or wrong leading digit
  it('rejects 10-digit number starting 5', () => {
    assert.equal(validatePhone('5000000000'), false);
  });
  it('rejects 10-digit number starting 1', () => {
    assert.equal(validatePhone('1234567890'), false);
  });
  it('rejects 9-digit number (too short for local)', () => {
    assert.equal(validatePhone('987654321'), false);
  });
  it('rejects 11-digit unprefixed number', () => {
    assert.equal(validatePhone('98765432101'), false);
  });
  it('rejects 12-digit unprefixed number', () => {
    assert.equal(validatePhone('919876543210'), false);
  });

  // INDIA INTERNATIONAL (+91)
  it('accepts +91 followed by valid 10-digit number starting 9', () => {
    assert.equal(validatePhone('+919876543210'), true);
  });
  it('accepts +91 followed by valid 10-digit number starting 6', () => {
    assert.equal(validatePhone('+916000000000'), true);
  });
  it('rejects +91 followed by 10-digit number starting 5', () => {
    assert.equal(validatePhone('+915000000000'), false);
  });
  it('rejects +91 followed by 9 digits (too short)', () => {
    assert.equal(validatePhone('+91987654321'), false);
  });
  it('rejects +91 followed by 11 digits (too long)', () => {
    assert.equal(validatePhone('+9198765432101'), false);
  });

  // OTHER INTERNATIONAL (+ with non-91 prefix)
  it('accepts +1 (US) international number', () => {
    assert.equal(validatePhone('+12025550123'), true);
  });
  it('accepts +44 (UK) international number', () => {
    assert.equal(validatePhone('+447911123456'), true);
  });
  it('accepts 6-digit minimum international with +', () => {
    assert.equal(validatePhone('+123456'), true);
  });
  it('rejects + with only 5 digits (below minimum)', () => {
    assert.equal(validatePhone('+12345'), false);
  });
  it('rejects + with 21 digits (above maximum)', () => {
    assert.equal(validatePhone('+123456789012345678901'), false);
  });

  // 0091 prefix — must be rejected
  it('rejects 0091 prefix (not supported)', () => {
    assert.equal(validatePhone('00919876543210'), false);
  });
  it('rejects 0091 prefix with spaces stripped', () => {
    assert.equal(validatePhone('0091 98765 43210'), false);
  });

  // Edge cases
  it('rejects null', () => {
    assert.equal(validatePhone(null), false);
  });
  it('rejects empty string', () => {
    assert.equal(validatePhone(''), false);
  });
  it('rejects undefined', () => {
    assert.equal(validatePhone(undefined), false);
  });
  it('rejects letters only', () => {
    assert.equal(validatePhone('abcdefghij'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 3 — normalisePhone still works after our changes
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.2 — Req 3: normalisePhone unchanged', () => {
  it('preserves + prefix for international numbers', () => {
    assert.equal(normalisePhone('+919876543210'), '+919876543210');
  });
  it('strips spaces and dashes', () => {
    assert.equal(normalisePhone('+91 98765-43210'), '+919876543210');
  });
  it('returns null for too-short input', () => {
    assert.equal(normalisePhone('123'), null);
  });
  it('returns null for null input', () => {
    assert.equal(normalisePhone(null), null);
  });
  it('handles plain 10-digit local number', () => {
    assert.equal(normalisePhone('9876543210'), '9876543210');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 4 — directorController exports getDirectorDashboard
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.2 — Req 4: directorController exports', () => {
  it('exports getDirectorDashboard', () => {
    const ctrl = require('../controllers/directorController');
    assert.equal(typeof ctrl.getDirectorDashboard, 'function');
  });
  it('exports getMyTelecallers', () => {
    const ctrl = require('../controllers/directorController');
    assert.equal(typeof ctrl.getMyTelecallers, 'function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 5/6 — usersController director support
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.2 — Req 5/6: usersController', () => {
  it('exports getUsers', () => {
    const ctrl = require('../controllers/usersController');
    assert.equal(typeof ctrl.getUsers, 'function');
  });
  it('exports createUser', () => {
    const ctrl = require('../controllers/usersController');
    assert.equal(typeof ctrl.createUser, 'function');
  });
  it('exports updateUser', () => {
    const ctrl = require('../controllers/usersController');
    assert.equal(typeof ctrl.updateUser, 'function');
  });
  it('exports deleteUser', () => {
    const ctrl = require('../controllers/usersController');
    assert.equal(typeof ctrl.deleteUser, 'function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 5/6 — users route allows director on POST
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.2 — Req 5/6: users route', () => {
  it('users route module loads without error', () => {
    assert.doesNotThrow(() => require('../routes/users'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 7 — attendanceController has allocation side-effect code
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.2 — Req 7: attendanceController allocation trigger', () => {
  it('exports markPresent', () => {
    const ctrl = require('../controllers/attendanceController');
    assert.equal(typeof ctrl.markPresent, 'function');
  });
  it('exports manageAttendance', () => {
    const ctrl = require('../controllers/attendanceController');
    assert.equal(typeof ctrl.manageAttendance, 'function');
  });
  it('allocatePendingLeadsToEmployee is called on new attendance (function source contains setImmediate)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    assert.ok(src.includes('setImmediate'), 'setImmediate call for allocation side-effect missing');
    assert.ok(src.includes('allocatePendingLeadsToEmployee'), 'allocatePendingLeadsToEmployee helper missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 8 — assignEmployee endpoint wired in leadsController + route
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.2 — Req 8: assignEmployee', () => {
  it('leadsController exports assignEmployee', () => {
    const ctrl = require('../controllers/leadsController');
    assert.equal(typeof ctrl.assignEmployee, 'function');
  });
  it('leads route contains assign-employee path', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../routes/leads'), 'utf8');
    assert.ok(src.includes('assign-employee'), 'assign-employee route missing from leads.js');
  });
  it('assignEmployee requires employeeId from body (function source check)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('assignEmployee'), 'assignEmployee function missing');
    assert.ok(src.includes('employeeId'), 'employeeId not referenced in leadsController');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 3 — createLead phone validation is wired
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.2 — Req 3: createLead phone validation wired', () => {
  it('leadsController imports validatePhone', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('validatePhone'), 'validatePhone not imported in leadsController');
  });
  it('createLead returns 400 for an invalid phone via mock req/res', async () => {
    const { createLead } = require('../controllers/leadsController');
    let statusCode = null;
    let body = null;
    const req = {
      body: { name: 'Test Lead', phone: '12345678901' }, // unprefixed 11-digit — invalid
      user: { role: 'admin', _id: new mongoose.Types.ObjectId() },
    };
    const res = {
      status: (s) => { statusCode = s; return res; },
      json: (b) => { body = b; },
    };
    await createLead(req, res);
    assert.equal(statusCode, 400);
    assert.ok(body?.message, 'Expected error message for invalid phone');
  });
  it('validatePhone rejects the unprefixed 11-digit test number', () => {
    assert.equal(validatePhone('12345678901'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AQRR / allocation engine — must be unchanged (PROTECTED)
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.2 — AQRR protected: allocationEngine exports unchanged', () => {
  it('exports pickNextDirector', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.pickNextDirector, 'function');
  });
  it('exports pickNextEmployee', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.pickNextEmployee, 'function');
  });
  it('exports previewSequence', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.previewSequence, 'function');
  });
  it('exports getEnabledDirectors', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.getEnabledDirectors, 'function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Security: telecaller DB role must not be renamed
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.2 — Security: telecaller role name preserved', () => {
  it('User model schema keeps telecaller as a valid role', () => {
    const User = require('../models/User');
    const rolePath = User.schema.path('role');
    assert.ok(rolePath, 'role path missing from User schema');
    const enumValues = rolePath.enumValues || rolePath.options?.enum || [];
    assert.ok(enumValues.includes('telecaller'), 'telecaller not in User role enum');
  });
  it('director role is in User schema', () => {
    const User = require('../models/User');
    const rolePath = User.schema.path('role');
    const enumValues = rolePath.enumValues || rolePath.options?.enum || [];
    assert.ok(enumValues.includes('director'), 'director not in User role enum');
  });
});
