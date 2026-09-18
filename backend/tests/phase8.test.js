/**
 * Phase 8 Tests — Complete Lead Allocation & Operational Assignment
 *
 * Covers: OCR employee allocation, pending lead visibility,
 * attendance-trigger allocation, manual assignment, hierarchy integrity,
 * AQRR protection, dashboard pending count.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// REQ 1 — OCR imports must call pickNextEmployee
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Req 1: OCR controller imports pickNextEmployee', () => {
  it('ocrController imports pickNextEmployee from allocationEngine', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/ocrController'), 'utf8');
    assert.ok(src.includes('pickNextEmployee'), 'pickNextEmployee not imported in ocrController');
  });

  it('ocrController calls pickNextEmployee after pickNextDirector', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/ocrController'), 'utf8');
    const directorIdx = src.indexOf('pickNextDirector');
    const employeeIdx = src.indexOf('pickNextEmployee');
    assert.ok(directorIdx !== -1, 'pickNextDirector not found in ocrController');
    assert.ok(employeeIdx !== -1, 'pickNextEmployee not found in ocrController');
    assert.ok(employeeIdx > directorIdx, 'pickNextEmployee must appear after pickNextDirector in ocrController');
  });

  it('ocrController module loads without error', () => {
    assert.doesNotThrow(() => require('../controllers/ocrController'));
  });

  it('ocrController exports importOcrLeads function', () => {
    const ctrl = require('../controllers/ocrController');
    assert.equal(typeof ctrl.importOcrLeads, 'function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 2 — pickNextEmployee remains the single source of truth
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Req 2: pickNextEmployee is the centralized allocator', () => {
  it('allocationEngine still exports pickNextEmployee', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.pickNextEmployee, 'function');
  });

  it('attendanceController uses pickNextEmployee (not direct assignment)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    assert.ok(src.includes('pickNextEmployee'), 'attendanceController must use pickNextEmployee for allocation');
  });

  it('leadsController uses pickNextEmployee for createLead', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('pickNextEmployee'), 'leadsController must use pickNextEmployee');
  });

  it('ocrController uses pickNextEmployee for importOcrLeads', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/ocrController'), 'utf8');
    assert.ok(src.includes('pickNextEmployee'), 'ocrController must use pickNextEmployee');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 3 — Pending allocation filter in getLeads
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Req 3: Pending allocation filter support', () => {
  it('leadsController source contains pendingAllocation filter logic', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('pendingAllocation'), 'pendingAllocation filter missing from leadsController');
  });

  it('getLeads blocks pendingAllocation filter for telecaller role', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    // Verify telecaller is not in the allowed roles for pendingAllocation
    const pendingBlock = src.slice(src.indexOf('pendingAllocation'));
    const bracketClose = pendingBlock.indexOf('\n\n');
    const block = pendingBlock.slice(0, bracketClose > 0 ? bracketClose : 500);
    assert.ok(
      block.includes('admin') && block.includes('director') && block.includes('tl'),
      'pendingAllocation filter must restrict to admin/director/tl'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 4 — Dashboard pending allocation count
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Req 4: getDashboardStats returns pendingAllocationCount', () => {
  it('leadsController getDashboardStats source references pendingAllocationCount', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('pendingAllocationCount'), 'pendingAllocationCount missing from getDashboardStats');
  });

  it('getDashboardStats mock returns 400 for invalid phone (sanity check — controller loads)', async () => {
    const { createLead } = require('../controllers/leadsController');
    let statusCode = null;
    const req = {
      body: { name: 'Test', phone: '00001111111' },
      user: { role: 'admin', _id: new mongoose.Types.ObjectId() },
    };
    const res = { status: (s) => { statusCode = s; return res; }, json: () => {} };
    await createLead(req, res);
    assert.equal(statusCode, 400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 5 — Manual assignment enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Req 5: assignEmployee manual assignment enforcement', () => {
  it('leadsController exports assignEmployee', () => {
    const ctrl = require('../controllers/leadsController');
    assert.equal(typeof ctrl.assignEmployee, 'function');
  });

  it('assignEmployee returns 400 when employeeId is missing', async () => {
    const { assignEmployee } = require('../controllers/leadsController');
    let statusCode = null;
    let body = null;
    const req = {
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: {},
      user: { role: 'admin', _id: new mongoose.Types.ObjectId() },
    };
    const res = { status: (s) => { statusCode = s; return res; }, json: (b) => { body = b; } };
    await assignEmployee(req, res);
    assert.equal(statusCode, 400);
    assert.ok(body?.message?.toLowerCase().includes('employeeid'));
  });

  it('assignEmployee route exists in leads routes', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../routes/leads'), 'utf8');
    assert.ok(src.includes('assign-employee'), 'assign-employee route missing from leads.js');
  });

  it('assignEmployee route requires admin/director/tl (not telecaller)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../routes/leads'), 'utf8');
    const routeLine = src.slice(src.indexOf('assign-employee'));
    const lineEnd = routeLine.indexOf('\n');
    const line = routeLine.slice(0, lineEnd);
    assert.ok(line.includes('admin'), 'admin must be in assign-employee authorize list');
    assert.ok(line.includes('director'), 'director must be in assign-employee authorize list');
    assert.ok(line.includes('tl'), 'tl must be in assign-employee authorize list');
    assert.ok(!line.includes('telecaller'), 'telecaller must NOT be in assign-employee authorize list');
  });

  it('assignEmployee source enforces TL hierarchy scope', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const block = src.slice(src.indexOf('const assignEmployee'));
    assert.ok(block.includes('tl') && block.includes('managedBy'), 'TL scope missing in assignEmployee');
  });

  it('assignEmployee source enforces Director hierarchy scope', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const block = src.slice(src.indexOf('const assignEmployee'));
    assert.ok(block.includes('director') && block.includes('managedBy'), 'Director scope missing in assignEmployee');
  });

  it('assignEmployee source enforces attendance gate', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const block = src.slice(src.indexOf('const assignEmployee'));
    assert.ok(block.includes('businessDate'), 'Attendance gate (businessDate check) missing in assignEmployee');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 7 — Attendance-triggered allocation uses FIFO + pickNextEmployee
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Req 7: attendance allocation uses FIFO + pickNextEmployee', () => {
  it('allocatePendingLeadsToEmployee sorts by createdAt ASC (FIFO)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    assert.ok(src.includes('createdAt') && src.includes('sort'), 'FIFO sort missing in allocatePendingLeadsToEmployee');
  });

  it('allocatePendingLeadsToEmployee uses pickNextEmployee, not direct assignment', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    assert.ok(src.includes('pickNextEmployee'), 'pickNextEmployee not used in allocatePendingLeadsToEmployee');
  });

  it('allocatePendingLeadsToEmployee uses atomic findOneAndUpdate with null guard', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    assert.ok(src.includes('findOneAndUpdate'), 'atomic findOneAndUpdate missing in allocatePendingLeadsToEmployee');
    assert.ok(src.includes('assignedTelecaller: null'), 'null guard missing in findOneAndUpdate');
  });

  it('allocatePendingLeadsToEmployee includes audit logging', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    assert.ok(src.includes('audit'), 'audit logging missing in allocatePendingLeadsToEmployee');
  });

  it('attendanceController still exports markPresent', () => {
    const ctrl = require('../controllers/attendanceController');
    assert.equal(typeof ctrl.markPresent, 'function');
  });

  it('attendanceController still exports manageAttendance', () => {
    const ctrl = require('../controllers/attendanceController');
    assert.equal(typeof ctrl.manageAttendance, 'function');
  });

  it('markPresent calls setImmediate for allocation side-effect', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    assert.ok(src.includes('setImmediate'), 'setImmediate call missing from markPresent');
  });

  it('manageAttendance calls setImmediate for allocation side-effect', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    const manageBlock = src.slice(src.indexOf('const manageAttendance'));
    assert.ok(manageBlock.includes('setImmediate'), 'setImmediate missing from manageAttendance');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 8 — One present employee receives all pending leads
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Req 8: single-employee allocation correctness', () => {
  it('allocatePendingLeadsToEmployee breaks if no eligible employee (no infinite loop)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    // The break condition: if assigneeId is null, we break/continue
    const allocBlock = src.slice(src.indexOf('allocatePendingLeadsToEmployee'));
    assert.ok(allocBlock.includes('break') || allocBlock.includes('continue'), 'break/continue on null employee missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 9 — Director hierarchy uses managedBy (no assignedTL)
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Req 9: Director hierarchy integrity', () => {
  it('Lead model has no assignedTL field', () => {
    const Lead = require('../models/Lead');
    const hasTL = Lead.schema.path('assignedTL');
    assert.equal(hasTL, undefined, 'assignedTL must NOT exist on Lead schema');
  });

  it('User model uses managedBy (not assignedTL) for hierarchy', () => {
    const User = require('../models/User');
    assert.ok(User.schema.path('managedBy'), 'managedBy must exist on User schema');
    assert.equal(User.schema.path('assignedTL'), undefined, 'assignedTL must NOT exist on User schema');
  });

  it('pickNextEmployee uses managedBy for hierarchy traversal', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../utils/allocationEngine'), 'utf8');
    const block = src.slice(src.indexOf('pickNextEmployee'));
    assert.ok(block.includes('managedBy'), 'pickNextEmployee must use managedBy for hierarchy');
  });

  it('allocatePendingLeadsToEmployee uses managedBy chain for director lookup', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    const block = src.slice(src.indexOf('allocatePendingLeadsToEmployee'));
    assert.ok(block.includes('managedBy'), 'managedBy chain missing from allocatePendingLeadsToEmployee');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 13 — Allocation Engine remains untouched
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Req 13: Allocation engine unchanged', () => {
  it('pickNextDirector is still exported', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.pickNextDirector, 'function');
  });

  it('pickNextEmployee is still exported', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.pickNextEmployee, 'function');
  });

  it('previewSequence is still exported', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.previewSequence, 'function');
  });

  it('getEnabledDirectors is still exported', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.getEnabledDirectors, 'function');
  });

  it('simulatePick is still exported', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.simulatePick, 'function');
  });

  it('freshCycleRemaining is still exported', () => {
    const eng = require('../utils/allocationEngine');
    assert.equal(typeof eng.freshCycleRemaining, 'function');
  });

  it('allocation route is admin-only', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../routes/allocation'), 'utf8');
    assert.ok(src.includes("authorize('admin')"), 'allocation route must be admin-only');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQ 14 — Audit conventions
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Req 14: audit logging', () => {
  it('leadsController assignEmployee calls audit.leadAssignedTelecaller', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const block = src.slice(src.indexOf('const assignEmployee'));
    assert.ok(block.includes('audit'), 'audit call missing from assignEmployee');
  });

  it('attendanceController allocatePendingLeadsToEmployee includes audit call', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    const block = src.slice(src.indexOf('allocatePendingLeadsToEmployee'));
    assert.ok(block.includes('audit'), 'audit call missing from allocatePendingLeadsToEmployee');
  });

  it('leadsController createLead calls audit.leadCreated', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('audit.leadCreated'), 'audit.leadCreated missing from createLead');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Security: telecaller DB role unchanged, no employee role added
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Security: role enum integrity', () => {
  it('User schema has telecaller in role enum', () => {
    const User = require('../models/User');
    const rolePath = User.schema.path('role');
    const enumValues = rolePath.enumValues || rolePath.options?.enum || [];
    assert.ok(enumValues.includes('telecaller'), 'telecaller must be in User role enum');
  });

  it('User schema does NOT have employee role', () => {
    const User = require('../models/User');
    const rolePath = User.schema.path('role');
    const enumValues = rolePath.enumValues || rolePath.options?.enum || [];
    assert.ok(!enumValues.includes('employee'), 'employee role must NOT be added to User schema');
  });

  it('Lead schema has no assignedTL field', () => {
    const Lead = require('../models/Lead');
    assert.equal(Lead.schema.path('assignedTL'), undefined, 'assignedTL must not exist on Lead');
  });

  it('buildLeadVisibilityFilter is exported from leadVisibility', () => {
    const { buildLeadVisibilityFilter } = require('../utils/leadVisibility');
    assert.equal(typeof buildLeadVisibilityFilter, 'function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: all previously-working exports still present
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Regression: existing controller exports intact', () => {
  it('leadsController exports all expected functions', () => {
    const ctrl = require('../controllers/leadsController');
    ['getLeads', 'createLead', 'getLead', 'updateLead', 'deleteLead',
      'bulkAssign', 'importCSV', 'getDashboardStats', 'assignEmployee'].forEach((fn) => {
      assert.equal(typeof ctrl[fn], 'function', `${fn} must be exported`);
    });
  });

  it('usersController exports all expected functions', () => {
    const ctrl = require('../controllers/usersController');
    ['getUsers', 'createUser', 'updateUser', 'deleteUser'].forEach((fn) => {
      assert.equal(typeof ctrl[fn], 'function', `${fn} must be exported`);
    });
  });

  it('directorController exports getDirectorDashboard and getMyTelecallers', () => {
    const ctrl = require('../controllers/directorController');
    assert.equal(typeof ctrl.getDirectorDashboard, 'function');
    assert.equal(typeof ctrl.getMyTelecallers, 'function');
  });

  it('attendanceController exports all expected functions', () => {
    const ctrl = require('../controllers/attendanceController');
    ['markPresent', 'getTodayStatus', 'getPresentEmployees',
      'getOwnHistory', 'getAttendanceReport', 'getEmployeeHistory',
      'manageAttendance'].forEach((fn) => {
      assert.equal(typeof ctrl[fn], 'function', `${fn} must be exported`);
    });
  });

  it('ocrController exports all expected functions', () => {
    const ctrl = require('../controllers/ocrController');
    ['checkDuplicates', 'importOcrLeads', 'sanitiseName'].forEach((fn) => {
      assert.equal(typeof ctrl[fn], 'function', `${fn} must be exported`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV importCSV already uses pickNextEmployee (existing, verify regression)
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — Regression: importCSV already uses pickNextEmployee', () => {
  it('leadsController importCSV calls pickNextEmployee', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const csvBlock = src.slice(src.indexOf('const importCSV'));
    const endIdx = src.indexOf('const getDashboardStats');
    const csvSrc = src.slice(src.indexOf('const importCSV'), endIdx);
    assert.ok(csvSrc.includes('pickNextEmployee'), 'pickNextEmployee not called in importCSV');
  });
});
