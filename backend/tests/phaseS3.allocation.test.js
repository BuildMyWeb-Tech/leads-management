/**
 * phaseS3.allocation.test.js — S.3 runtime allocation behaviour tests.
 *
 * Tests use require.cache injection to replace Mongoose model methods with
 * in-memory stubs, enabling true behavioral testing of pickNextEmployee()
 * and the createLead/importCSV logic paths without a live MongoDB.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path    = require('node:path');
const fs      = require('node:fs');

// ── Helpers ──────────────────────────────────────────────────────

// Build fake ObjectId-like objects with a consistent String representation
let idCounter = 1;
const fakeId = (label) => {
  const id = `fakeid_${String(idCounter++).padStart(6,'0')}_${label}`;
  // Behave like Mongoose ObjectId: String(id) === id
  return { _id: id, toString: () => id };
};

// Inject a fake module into require.cache so lazy require() inside
// pickNextEmployee() picks up the stub.
const injectFakeModel = (absPath, exports) => {
  require.cache[absPath] = {
    id: absPath, filename: absPath, loaded: true,
    exports,
    children: [], parent: null,
  };
};

const restoreModel = (absPath) => {
  delete require.cache[absPath];
};

const userPath       = require.resolve('../models/User');
const attendancePath = require.resolve('../models/Attendance');
const leadPath       = require.resolve('../models/Lead');

// Helper: call pickNextEmployee with mocked models
async function callPickNextEmployee(directorId, { tls = [], telecallers = [], present = [], leadCounts = [] } = {}) {
  // Build fake User.find that returns the right set based on query
  const fakeUser = {
    find: (query) => ({
      select: () => ({
        lean: async () => {
          if (query.role === 'tl') {
            // Return TLs whose managedBy matches directorId
            const dStr = String(directorId?._id ?? directorId);
            return tls.filter((t) => String(t.managedBy?._id ?? t.managedBy) === dStr);
          }
          if (query.role === 'telecaller' && query.managedBy?.$in) {
            const inIds = query.managedBy.$in.map((x) => String(x?._id ?? x));
            const activeFlag = query.isActive;
            return telecallers.filter((e) => {
              const managedByStr = String(e.managedBy?._id ?? e.managedBy);
              if (!inIds.includes(managedByStr)) return false;
              if (activeFlag !== undefined && e.isActive !== undefined) {
                if (activeFlag === true && e.isActive === false) return false;
              }
              return true;
            });
          }
          return [];
        },
      }),
    }),
  };

  // Build fake Attendance.find
  const fakeAttendance = {
    find: (query) => ({
      select: () => ({
        lean: async () => {
          const inIds = (query.employee?.$in || []).map((x) => String(x?._id ?? x));
          return present
            .filter((r) => inIds.includes(String(r.employee?._id ?? r.employee)))
            .map((r) => ({ employee: r.employee }));
        },
      }),
    }),
  };

  // Build fake Lead.aggregate
  const fakeLead = {
    aggregate: async () => {
      return leadCounts.map((lc) => ({ _id: lc.employee, count: lc.count }));
    },
  };

  injectFakeModel(userPath, fakeUser);
  injectFakeModel(attendancePath, fakeAttendance);
  injectFakeModel(leadPath, fakeLead);

  // Clear cached allocationEngine so it re-runs with fresh requires
  const enginePath = require.resolve('../utils/allocationEngine');
  delete require.cache[enginePath];

  try {
    const { pickNextEmployee } = require('../utils/allocationEngine');
    return await pickNextEmployee(directorId);
  } finally {
    restoreModel(userPath);
    restoreModel(attendancePath);
    restoreModel(leadPath);
    delete require.cache[require.resolve('../utils/allocationEngine')];
  }
}

// ── S3-AL-01: Fresh lead auto-gets Director + Present Employee ───
test('S3-AL-01: pickNextEmployee returns an employee when Director→TL→Present Employee chain exists', async () => {
  const dir1 = fakeId('dir1');
  const tl1  = fakeId('tl1');
  const emp1 = fakeId('emp1');

  const result = await callPickNextEmployee(dir1._id, {
    tls:         [{ _id: tl1._id, managedBy: dir1._id }],
    telecallers: [{ _id: emp1._id, managedBy: tl1._id, isActive: true }],
    present:     [{ employee: emp1._id }],
    leadCounts:  [],
  });

  assert.ok(result, 'pickNextEmployee must return a non-null employee id');
  assert.strictEqual(String(result), String(emp1._id));
});

// ── S3-AL-02: Absent employee is excluded ────────────────────────
test('S3-AL-02: pickNextEmployee returns null when employee is active but absent', async () => {
  const dir1 = fakeId('dir1');
  const tl1  = fakeId('tl1');
  const emp1 = fakeId('emp1');

  const result = await callPickNextEmployee(dir1._id, {
    tls:         [{ _id: tl1._id, managedBy: dir1._id }],
    telecallers: [{ _id: emp1._id, managedBy: tl1._id, isActive: true }],
    present:     [], // nobody marked present
    leadCounts:  [],
  });

  assert.strictEqual(result, null, 'Absent employee must not be selected');
});

// ── S3-AL-03: Inactive employee is excluded ──────────────────────
test('S3-AL-03: pickNextEmployee excludes inactive employees', async () => {
  const dir1 = fakeId('dir1');
  const tl1  = fakeId('tl1');
  const emp1 = fakeId('emp1');

  const result = await callPickNextEmployee(dir1._id, {
    tls:         [{ _id: tl1._id, managedBy: dir1._id }],
    telecallers: [{ _id: emp1._id, managedBy: tl1._id, isActive: false }],
    present:     [{ employee: emp1._id }],
    leadCounts:  [],
  });

  assert.strictEqual(result, null, 'Inactive employee must not be selected');
});

// ── S3-AL-04: Multiple Present Employees can receive allocations ─
test('S3-AL-04: Multiple present employees — least-loaded is selected first', async () => {
  const dir1 = fakeId('dir1');
  const tl1  = fakeId('tl1');
  const empA = fakeId('empA');
  const empB = fakeId('empB');

  // empA has 3 leads today, empB has 1 — empB should be picked
  const result = await callPickNextEmployee(dir1._id, {
    tls:         [{ _id: tl1._id, managedBy: dir1._id }],
    telecallers: [
      { _id: empA._id, managedBy: tl1._id, isActive: true },
      { _id: empB._id, managedBy: tl1._id, isActive: true },
    ],
    present:     [{ employee: empA._id }, { employee: empB._id }],
    leadCounts:  [{ employee: empA._id, count: 3 }, { employee: empB._id, count: 1 }],
  });

  assert.strictEqual(String(result), String(empB._id), 'Least-loaded employee must be picked');
});

// ── S3-AL-05: No Present Employees → null ────────────────────────
test('S3-AL-05: No present employees leaves result null (no crash)', async () => {
  const dir1 = fakeId('dir1');
  const tl1  = fakeId('tl1');
  const emp1 = fakeId('emp1');
  const emp2 = fakeId('emp2');

  const result = await callPickNextEmployee(dir1._id, {
    tls:         [{ _id: tl1._id, managedBy: dir1._id }],
    telecallers: [
      { _id: emp1._id, managedBy: tl1._id, isActive: true },
      { _id: emp2._id, managedBy: tl1._id, isActive: true },
    ],
    present:     [], // no attendance today
    leadCounts:  [],
  });

  assert.strictEqual(result, null, 'Must return null when no employees are present');
});

// ── S3-AL-06: Director 1 cannot allocate to Director 2's employees
test('S3-AL-06: Director 1 employees are isolated from Director 2', async () => {
  const dir1 = fakeId('dir1');
  const dir2 = fakeId('dir2');
  const tl2  = fakeId('tl2');
  const empD2 = fakeId('empD2');

  // Dir1 has no TLs; Dir2 has TL2→EmpD2
  // Asking for Dir1 employees must return null (not empD2)
  const result = await callPickNextEmployee(dir1._id, {
    tls:         [{ _id: tl2._id, managedBy: dir2._id }], // TL2 belongs to dir2, NOT dir1
    telecallers: [{ _id: empD2._id, managedBy: tl2._id, isActive: true }],
    present:     [{ employee: empD2._id }],
    leadCounts:  [],
  });

  assert.strictEqual(result, null, 'Dir1 must not receive an employee belonging to Dir2');
});

// ── S3-AL-07: Multiple TLs under one Director are pooled ─────────
test('S3-AL-07: Multiple TLs under Director — employees from all TLs are eligible', async () => {
  const dir1 = fakeId('dir1');
  const tl1  = fakeId('tl1');
  const tl2  = fakeId('tl2');
  const empA = fakeId('empA');
  const empB = fakeId('empB');

  // empA under tl1, empB under tl2 — both under dir1
  const result = await callPickNextEmployee(dir1._id, {
    tls: [
      { _id: tl1._id, managedBy: dir1._id },
      { _id: tl2._id, managedBy: dir1._id },
    ],
    telecallers: [
      { _id: empA._id, managedBy: tl1._id, isActive: true },
      { _id: empB._id, managedBy: tl2._id, isActive: true },
    ],
    present:    [{ employee: empA._id }, { employee: empB._id }],
    leadCounts: [],
  });

  assert.ok(
    [String(empA._id), String(empB._id)].includes(String(result)),
    'Must pick from employees across all TLs under the director'
  );
});

// ── S3-AL-08: New TL hierarchy works immediately ─────────────────
test('S3-AL-08: Newly linked TL (managedBy=director) works for allocation', async () => {
  const dir1   = fakeId('dir1');
  const newTL  = fakeId('newTL');
  const newEmp = fakeId('newEmp');

  const result = await callPickNextEmployee(dir1._id, {
    tls:         [{ _id: newTL._id, managedBy: dir1._id }],
    telecallers: [{ _id: newEmp._id, managedBy: newTL._id, isActive: true }],
    present:     [{ employee: newEmp._id }],
    leadCounts:  [],
  });

  assert.strictEqual(String(result), String(newEmp._id), 'New TL→Employee link must work immediately');
});

// ── S3-AL-09: New Employee under existing TL is eligible when present
test('S3-AL-09: Newly added employee under existing TL is eligible when present', async () => {
  const dir1   = fakeId('dir1');
  const tl1    = fakeId('tl1');
  const oldEmp = fakeId('oldEmp');
  const newEmp = fakeId('newEmp'); // just added, present today

  const result = await callPickNextEmployee(dir1._id, {
    tls:         [{ _id: tl1._id, managedBy: dir1._id }],
    telecallers: [
      { _id: oldEmp._id, managedBy: tl1._id, isActive: true },
      { _id: newEmp._id, managedBy: tl1._id, isActive: true },
    ],
    present:    [{ employee: newEmp._id }], // only newEmp present
    leadCounts: [],
  });

  assert.strictEqual(String(result), String(newEmp._id), 'New employee must be immediately eligible when present');
});

// ── S3-AL-10: Employee-created lead stays self-owned ─────────────
test('S3-AL-10: Employee-created lead is not overwritten by Phase 2', () => {
  const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
  // The guard: only calls pickNextEmployee for non-telecaller + no pre-existing assignedTelecaller
  assert.ok(
    src.includes("req.user.role !== 'telecaller' && !leadData.assignedTelecaller"),
    'Phase 2 guard must skip telecaller self-owned leads'
  );
  assert.ok(
    src.includes("leadData.assignedTelecaller = req.user._id"),
    'Telecaller self-ownership must be set before Phase 2 check'
  );
});

// ── S3-AL-11: Client cannot force assignedTelecaller ─────────────
test('S3-AL-11: Non-admin/non-telecaller client-supplied assignedTelecaller is rejected', () => {
  const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
  assert.ok(
    src.includes("req.user.role !== 'admin' && req.user.role !== 'telecaller'"),
    'Must delete client-supplied assignedTelecaller for non-admin/non-telecaller roles'
  );
  assert.ok(
    src.includes("delete leadData.assignedTelecaller"),
    'assignedTelecaller must be deleted for restricted roles'
  );
});

// ── S3-AL-12: CSV import also calls Phase 2 ──────────────────────
test('S3-AL-12: importCSV calls pickNextEmployee for automatic employee allocation', () => {
  const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
  const csvBlock = src.slice(src.indexOf('const importCSV'), src.indexOf('module.exports'));
  assert.ok(csvBlock.includes('pickNextEmployee'), 'importCSV must call pickNextEmployee');
  assert.ok(csvBlock.includes('raw.assignedTelecaller = empId'), 'importCSV must set assignedTelecaller from Phase 2');
});

// ── S3-AL-13: AQRR regression — Director sequence unchanged ──────
test('S3-AL-13: Director AQRR A=9,B=4,C=4,D=1 exact sequence is unchanged', () => {
  // Clear engine cache to get fresh require with real AllocationConfig
  delete require.cache[require.resolve('../utils/allocationEngine')];
  const { simulatePick, freshCycleRemaining } = require('../utils/allocationEngine');

  const enabled = [
    { director: 'A', sequenceOrder: 0, quota: 9 },
    { director: 'B', sequenceOrder: 1, quota: 4 },
    { director: 'C', sequenceOrder: 2, quota: 4 },
    { director: 'D', sequenceOrder: 3, quota: 1 },
  ];
  let cr = freshCycleRemaining(enabled);
  let ptr = 0;
  const seq = [];
  for (let i = 0; i < 18; i++) {
    const { directorIndex, nextCycleRemaining, nextPointer } = simulatePick(enabled, cr, ptr);
    seq.push(enabled[directorIndex].director);
    cr = nextCycleRemaining;
    ptr = nextPointer;
  }
  const expected = ['A','B','C','D','A','B','C','A','B','C','A','B','C','A','A','A','A','A'];
  assert.deepStrictEqual(seq, expected, 'AQRR sequence must be unchanged after S.3');
});

// ── S3-AL-14: bulkAssign attendance gate is intact ───────────────
test('S3-AL-14: bulkAssign attendance gate is preserved', () => {
  const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
  assert.ok(src.includes('not marked present today'), 'bulkAssign attendance gate must still be present');
});

// ── S3-AL-15 (bonus): createUser correctly validates TL.managedBy = Director ──
test('S3-AL-15: createUser validates TL managedBy must be a Director (not TL)', () => {
  const src = fs.readFileSync(require.resolve('../controllers/usersController'), 'utf8');
  assert.ok(
    src.includes("resolvedRole === 'tl'") && src.includes("manager.role !== 'director'"),
    'createUser must validate TL managedBy points to a Director'
  );
  assert.ok(
    src.includes("A Team Lead\\'s manager must be a Director") ||
    src.includes("A Team Lead's manager must be a Director"),
    'createUser must return correct error for invalid TL managedBy'
  );
});

// ── S3-AL-16 (bonus): deleteUser soft-deletes (no hard delete) ───
test('S3-AL-16: deleteUser is a soft delete (sets isActive=false, not User.deleteOne)', () => {
  const src = fs.readFileSync(require.resolve('../controllers/usersController'), 'utf8');
  assert.ok(src.includes('user.isActive = false'), 'deleteUser must soft-delete via isActive=false');
  assert.ok(!src.includes('deleteOne') && !src.includes('findByIdAndDelete'),
    'deleteUser must NOT hard-delete the user document');
});
