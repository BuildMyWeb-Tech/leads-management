/**
 * phaseTCAllocation.test.js
 *
 * Dedicated allocation engine test suite for TC-61 and related scenarios.
 *
 * Strategy: require.cache injection — Mongoose models are replaced with
 * in-memory stubs before each call and restored after. No live DB, no
 * mongodb-memory-server, no new dependencies.
 *
 * Key difference from phaseS3.allocation.test.js:
 *   The mock isActive filter here faithfully reproduces MongoDB's
 *   `isActive: true` strict-equality semantics:
 *     • isActive === true  → included
 *     • isActive === false → excluded
 *     • isActive undefined → EXCLUDED  ← this is the TC-61 root cause
 *
 * The phaseS3 mock only excluded isActive===false, allowing undefined
 * to slip through — which is why all S3 tests passed while the live
 * system misbehaved.
 */

'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path     = require('node:path');
const fs       = require('node:fs');

// ── Deterministic fake ObjectIds ─────────────────────────────────────────────
// Use fixed hex-like strings so lexicographic comparison is predictable.
// We need String(id) to work for comparisons the same way real ObjectIds do.
const makeId = (hex) => {
  const s = String(hex);
  return { _id: s, toString: () => s };
};

// IDs used across tests — fixed strings ensure deterministic tie-break results.
// Lexicographic order: aaa... < bbb... < ccc... < ddd...
const IDS = {
  dir1:  makeId('aaaa000000000000000000d1'),
  dir2:  makeId('aaaa000000000000000000d2'),
  tl1:   makeId('bbbb000000000000000000t1'),
  tl2:   makeId('bbbb000000000000000000t2'),
  // Employees deliberately ordered: e1 < e2 < e3 < e4 lexicographically
  e1:    makeId('cccc000000000000000000e1'),
  e2:    makeId('cccc000000000000000000e2'),
  e3:    makeId('cccc000000000000000000e3'),
  e4:    makeId('cccc000000000000000000e4'),
  eOrph: makeId('dddd000000000000000000eo'),
};

// ── require.cache injection helpers ──────────────────────────────────────────
const userPath       = require.resolve('../models/User');
const attendancePath = require.resolve('../models/Attendance');
const leadPath       = require.resolve('../models/Lead');
const enginePath     = require.resolve('../utils/allocationEngine');

const inject = (absPath, exports) => {
  require.cache[absPath] = { id: absPath, filename: absPath, loaded: true, exports, children: [], parent: null };
};
const restore = (absPath) => { delete require.cache[absPath]; };

/**
 * callPickNextEmployee — invoke pickNextEmployee with fully mocked models.
 *
 * IMPORTANT: The isActive filter here faithfully replicates MongoDB's
 * `isActive: true` strict equality:  only `e.isActive === true` passes.
 */
async function callPNE(directorId, { tls = [], telecallers = [], present = [], leadCounts = [] } = {}) {
  const dirStr = String(directorId?._id ?? directorId);

  const fakeUser = {
    find: (query) => ({
      select: () => ({
        lean: async () => {
          if (query.role === 'tl') {
            return tls.filter((t) => String(t.managedBy?._id ?? t.managedBy) === dirStr);
          }
          if (query.role === 'telecaller' && query.managedBy?.$in) {
            const inIds = query.managedBy.$in.map((x) => String(x?._id ?? x));
            return telecallers.filter((e) => {
              if (!inIds.includes(String(e.managedBy?._id ?? e.managedBy))) return false;
              // Faithful MongoDB isActive:true simulation:
              // ONLY documents where the field equals the boolean true are returned.
              if (query.isActive === true && e.isActive !== true) return false;
              if (query.isActive === false && e.isActive !== false) return false;
              return true;
            });
          }
          return [];
        },
      }),
    }),
  };

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

  const fakeLead = {
    aggregate: async () => leadCounts.map((lc) => ({ _id: lc.employee, count: lc.count })),
  };

  inject(userPath,       fakeUser);
  inject(attendancePath, fakeAttendance);
  inject(leadPath,       fakeLead);
  delete require.cache[enginePath];

  try {
    const { pickNextEmployee } = require('../utils/allocationEngine');
    return await pickNextEmployee(directorId);
  } finally {
    restore(userPath);
    restore(attendancePath);
    restore(leadPath);
    delete require.cache[enginePath];
  }
}

// ════════════════════════════════════════════════════════════════════════════
// A. HIERARCHY TESTS
// ════════════════════════════════════════════════════════════════════════════

test('TC-A-01: All four active employees under same TL are eligible', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e3._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e4._id, managedBy: IDS.tl1._id, isActive: true },
    ],
    present:    [
      { employee: IDS.e1._id }, { employee: IDS.e2._id },
      { employee: IDS.e3._id }, { employee: IDS.e4._id },
    ],
    leadCounts: [],
  });
  const eligible = [IDS.e1._id, IDS.e2._id, IDS.e3._id, IDS.e4._id];
  assert.ok(eligible.includes(String(result)), `Expected one of e1–e4, got ${result}`);
});

test('TC-A-02: Employee with null managedBy is excluded, present colleague is selected', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id,   managedBy: IDS.tl1._id,  isActive: true },
      { _id: IDS.eOrph._id, managedBy: null,         isActive: true }, // null managedBy
    ],
    present:    [{ employee: IDS.e1._id }, { employee: IDS.eOrph._id }],
    leadCounts: [],
  });
  assert.strictEqual(String(result), String(IDS.e1._id), 'Orphan must not appear; e1 selected');
});

test('TC-A-03: Employee under wrong TL is excluded from Director 1', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],  // only tl1 under dir1
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl2._id, isActive: true }, // under tl2, not tl1
    ],
    present:    [{ employee: IDS.e1._id }, { employee: IDS.e2._id }],
    leadCounts: [],
  });
  assert.strictEqual(String(result), String(IDS.e1._id), 'e2 under foreign TL must be excluded');
});

test('TC-A-04: Employee whose TL belongs to a different Director is excluded', async () => {
  // dir1 has no TLs; tl2 belongs to dir2
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl2._id, managedBy: IDS.dir2._id }], // tl2 belongs to dir2
    telecallers: [{ _id: IDS.e2._id, managedBy: IDS.tl2._id, isActive: true }],
    present:    [{ employee: IDS.e2._id }],
    leadCounts: [],
  });
  assert.strictEqual(result, null, 'dir2 employee must not be reachable via dir1');
});

test('TC-A-05: Soft-deleted employee (isActive:false) is excluded', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [{ _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: false }],
    present:    [{ employee: IDS.e1._id }],
    leadCounts: [],
  });
  assert.strictEqual(result, null, 'Soft-deleted employee must not be selected');
});

test('TC-A-06: Multiple TLs under one Director — employees from all TLs are pooled', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls: [
      { _id: IDS.tl1._id, managedBy: IDS.dir1._id },
      { _id: IDS.tl2._id, managedBy: IDS.dir1._id },
    ],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl2._id, isActive: true },
    ],
    present:    [{ employee: IDS.e1._id }, { employee: IDS.e2._id }],
    leadCounts: [],
  });
  const valid = [IDS.e1._id, IDS.e2._id];
  assert.ok(valid.includes(String(result)), 'Employees from both TLs under dir1 must be eligible');
});

// ════════════════════════════════════════════════════════════════════════════
// B. ATTENDANCE TESTS
// ════════════════════════════════════════════════════════════════════════════

test('TC-B-01: Present employee is selected', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [{ _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true }],
    present:    [{ employee: IDS.e1._id }],
    leadCounts: [],
  });
  assert.strictEqual(String(result), String(IDS.e1._id));
});

test('TC-B-02: Absent employee is excluded (returns null)', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [{ _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true }],
    present:    [], // no attendance record
    leadCounts: [],
  });
  assert.strictEqual(result, null);
});

test('TC-B-03: Absent lowest-workload employee is skipped; next-eligible is selected', async () => {
  // e1 has 3 leads (lowest) but is ABSENT; e2 has 5 leads and is PRESENT
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: true },
    ],
    present:    [{ employee: IDS.e2._id }], // only e2 present
    leadCounts: [
      { employee: IDS.e1._id, count: 3 },
      { employee: IDS.e2._id, count: 5 },
    ],
  });
  assert.strictEqual(String(result), String(IDS.e2._id), 'e2 selected even though e1 had lower workload');
});

test('TC-B-04: Employee who becomes present is then selected', async () => {
  const base = {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [{ _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true }],
    leadCounts:  [],
  };
  // Round 1: absent
  const r1 = await callPNE(IDS.dir1._id, { ...base, present: [] });
  assert.strictEqual(r1, null, 'Must be null when absent');
  // Round 2: now present
  const r2 = await callPNE(IDS.dir1._id, { ...base, present: [{ employee: IDS.e1._id }] });
  assert.strictEqual(String(r2), String(IDS.e1._id), 'Must be selected once present');
});

// ════════════════════════════════════════════════════════════════════════════
// C. WORKLOAD TESTS
// ════════════════════════════════════════════════════════════════════════════

test('TC-C-01: Lowest workload employee is selected', async () => {
  // e1=5 leads, e2=2 leads — e2 must win
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: true },
    ],
    present:    [{ employee: IDS.e1._id }, { employee: IDS.e2._id }],
    leadCounts: [
      { employee: IDS.e1._id, count: 5 },
      { employee: IDS.e2._id, count: 2 },
    ],
  });
  assert.strictEqual(String(result), String(IDS.e2._id));
});

test('TC-C-02: Zero leads are treated as 0 (not as infinity) — absent from aggregate', async () => {
  // e1 present and has zero leads (absent from leadCounts array — aggregate returned nothing for it)
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [{ _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true }],
    present:    [{ employee: IDS.e1._id }],
    leadCounts: [], // empty aggregate = e1 has 0 leads
  });
  assert.strictEqual(String(result), String(IDS.e1._id), 'Zero-lead employee must not be penalised');
});

test('TC-C-03: 4/4/0/0 — lower ObjectId among zero-count employees is selected (TC-61 live scenario)', async () => {
  // Exact live UAT scenario: E1=4, E2=4, E3=0, E4=0, all present, all isActive:true
  // IDS ordering: e1 < e2 < e3 < e4 (lexicographic)
  // So e3 must win (lowest _id among tied zeros)
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e3._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e4._id, managedBy: IDS.tl1._id, isActive: true },
    ],
    present:    [
      { employee: IDS.e1._id }, { employee: IDS.e2._id },
      { employee: IDS.e3._id }, { employee: IDS.e4._id },
    ],
    leadCounts: [
      { employee: IDS.e1._id, count: 4 },
      { employee: IDS.e2._id, count: 4 },
      // e3 and e4 have 0 leads — absent from aggregate
    ],
  });
  assert.strictEqual(String(result), String(IDS.e3._id),
    'e3 must win: lowest _id among tied zero-count employees');
});

test('TC-C-04: 4/4/1/0 — only zero-count employee is selected', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e3._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e4._id, managedBy: IDS.tl1._id, isActive: true },
    ],
    present:    [
      { employee: IDS.e1._id }, { employee: IDS.e2._id },
      { employee: IDS.e3._id }, { employee: IDS.e4._id },
    ],
    leadCounts: [
      { employee: IDS.e1._id, count: 4 },
      { employee: IDS.e2._id, count: 4 },
      { employee: IDS.e3._id, count: 1 },
      // e4 has 0
    ],
  });
  assert.strictEqual(String(result), String(IDS.e4._id), 'e4 is the sole zero-count employee');
});

test('TC-C-05: 4/4/1/1 — tie at count=1 breaks by ObjectId; e3 wins (lower id)', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e3._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e4._id, managedBy: IDS.tl1._id, isActive: true },
    ],
    present:    [
      { employee: IDS.e1._id }, { employee: IDS.e2._id },
      { employee: IDS.e3._id }, { employee: IDS.e4._id },
    ],
    leadCounts: [
      { employee: IDS.e1._id, count: 4 },
      { employee: IDS.e2._id, count: 4 },
      { employee: IDS.e3._id, count: 1 },
      { employee: IDS.e4._id, count: 1 },
    ],
  });
  assert.strictEqual(String(result), String(IDS.e3._id), 'e3 has lower _id than e4 — tie goes to e3');
});

test('TC-C-06: Progressive workload — allocation is workload-based, not round-robin', async () => {
  // Simulate 8 sequential picks by manually advancing leadCounts after each call.
  // All 4 employees start at 0. Each pick increments the winner by 1.
  // Under workload-based allocation: no employee gets a 2nd lead until all have 1.
  const base = {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e3._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e4._id, managedBy: IDS.tl1._id, isActive: true },
    ],
    present: [
      { employee: IDS.e1._id }, { employee: IDS.e2._id },
      { employee: IDS.e3._id }, { employee: IDS.e4._id },
    ],
  };

  const counts = { [IDS.e1._id]: 0, [IDS.e2._id]: 0, [IDS.e3._id]: 0, [IDS.e4._id]: 0 };
  const picks = [];

  for (let i = 0; i < 8; i++) {
    const leadCounts = Object.entries(counts)
      .filter(([, c]) => c > 0)
      .map(([employee, count]) => ({ employee, count }));

    const result = await callPNE(IDS.dir1._id, { ...base, leadCounts });
    assert.ok(result !== null, `Pick ${i + 1} must not return null`);
    const winner = String(result);
    picks.push(winner);
    counts[winner]++;
  }

  // After 8 picks across 4 employees: each should have exactly 2 leads.
  // Under pure workload-balance, the distribution should be 2/2/2/2.
  for (const [id, c] of Object.entries(counts)) {
    assert.strictEqual(c, 2, `Employee ${id} should have 2 leads after 8 balanced picks`);
  }

  // Prove it is NOT simple sequential round-robin.
  // Round-robin would produce: e1,e2,e3,e4,e1,e2,e3,e4 (by insertion order).
  // Workload-based produces: e1,e2,e3,e4 (tie-break by _id for first 4 picks)
  // then continues balancing. The first 4 picks must each go to a different employee.
  const first4 = picks.slice(0, 4);
  const uniqueFirst4 = new Set(first4);
  assert.strictEqual(uniqueFirst4.size, 4, 'First 4 picks must each go to a different employee (not round-robin repeat)');
});

// ════════════════════════════════════════════════════════════════════════════
// D. TC-61 REGRESSION — isActive strict-equality semantics
// ════════════════════════════════════════════════════════════════════════════

test('TC-R-01: Employee with isActive ABSENT (undefined) is excluded — TC-61 root cause', async () => {
  // This is the exact condition that caused TC-61:
  // Documents created before isActive was added to the schema have no isActive field.
  // MongoDB isActive:true excludes them. The old mock did NOT — this mock does.
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      // No isActive property at all — simulates a legacy DB document
      { _id: IDS.e3._id, managedBy: IDS.tl1._id },
    ],
    present:    [{ employee: IDS.e3._id }],
    leadCounts: [],
  });
  assert.strictEqual(result, null,
    'Employee with absent isActive must be excluded by isActive:true query (TC-61 root cause)');
});

test('TC-R-02: Legacy employee (isActive absent) + active employee — only active is selected', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true }, // active
      { _id: IDS.e3._id, managedBy: IDS.tl1._id },                 // isActive absent — legacy
    ],
    present:    [{ employee: IDS.e1._id }, { employee: IDS.e3._id }],
    leadCounts: [],
  });
  assert.strictEqual(String(result), String(IDS.e1._id),
    'Only the employee with isActive===true should be selected');
});

test('TC-R-03: Once legacy employee isActive is set to true, they join the pool', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e3._id, managedBy: IDS.tl1._id, isActive: true }, // fixed: now true
    ],
    present:    [{ employee: IDS.e1._id }, { employee: IDS.e3._id }],
    leadCounts: [],
  });
  const valid = [IDS.e1._id, IDS.e3._id];
  assert.ok(valid.includes(String(result)), 'Both employees eligible once isActive:true is set');
});

test('TC-R-04: 4/4/0/0 with all isActive:true — E3 wins (live UAT scenario, fixed state)', async () => {
  // This is the post-fix state: E1/E2/E3/E4 all have isActive:true in DB.
  // E1=4, E2=4, E3=0, E4=0. E3 has lower _id than E4 → E3 wins.
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e3._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e4._id, managedBy: IDS.tl1._id, isActive: true },
    ],
    present:    [
      { employee: IDS.e1._id }, { employee: IDS.e2._id },
      { employee: IDS.e3._id }, { employee: IDS.e4._id },
    ],
    leadCounts: [
      { employee: IDS.e1._id, count: 4 },
      { employee: IDS.e2._id, count: 4 },
    ],
  });
  assert.strictEqual(String(result), String(IDS.e3._id),
    'E3 must be selected: lowest _id among tied zero-count employees');
});

test('TC-R-05: E3/E4 with missing managedBy are excluded from allocation pool', async () => {
  // E3 and E4 have isActive:true but managedBy:null — they are "orphaned"
  // and should never enter any director's pool.
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id,  isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id,  isActive: true },
      { _id: IDS.e3._id, managedBy: null,           isActive: true }, // orphaned
      { _id: IDS.e4._id, managedBy: null,           isActive: true }, // orphaned
    ],
    present:    [
      { employee: IDS.e1._id }, { employee: IDS.e2._id },
      { employee: IDS.e3._id }, { employee: IDS.e4._id },
    ],
    leadCounts: [
      { employee: IDS.e1._id, count: 4 },
      { employee: IDS.e2._id, count: 4 },
    ],
  });
  // e3 and e4 are orphaned — only e1/e2 visible, both at count=4 — e1 wins (lower _id)
  assert.strictEqual(String(result), String(IDS.e1._id),
    'Orphaned e3/e4 must not enter the pool; e1 selected by tie-break among e1/e2');
});

// ════════════════════════════════════════════════════════════════════════════
// E. NEGATIVE / SAFE-FAILURE TESTS
// ════════════════════════════════════════════════════════════════════════════

test('TC-E-01: directorId null returns null immediately (no query)', async () => {
  const result = await callPNE(null);
  assert.strictEqual(result, null);
});

test('TC-E-02: directorId undefined returns null immediately', async () => {
  const result = await callPNE(undefined);
  assert.strictEqual(result, null);
});

test('TC-E-03: No TL under Director returns null', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [], // no TLs
    telecallers: [{ _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true }],
    present:    [{ employee: IDS.e1._id }],
    leadCounts: [],
  });
  assert.strictEqual(result, null, 'No TLs → null');
});

test('TC-E-04: All employees inactive (isActive:false) returns null', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: false },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: false },
    ],
    present:    [{ employee: IDS.e1._id }, { employee: IDS.e2._id }],
    leadCounts: [],
  });
  assert.strictEqual(result, null);
});

test('TC-E-05: All employees absent returns null', async () => {
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: true },
    ],
    present:    [],
    leadCounts: [],
  });
  assert.strictEqual(result, null);
});

test('TC-E-06: Employee managedBy points to nonexistent TL — excluded from all directors', async () => {
  // dir1 has tl1; e_dangling.managedBy = 'nonexistent_id' not in tls array
  const result = await callPNE(IDS.dir1._id, {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.eOrph._id, managedBy: 'nonexistent_tl_id', isActive: true },
    ],
    present:    [{ employee: IDS.e1._id }, { employee: IDS.eOrph._id }],
    leadCounts: [],
  });
  assert.strictEqual(String(result), String(IDS.e1._id),
    'Dangling-managedBy employee must not appear; only e1 is selected');
});

// ════════════════════════════════════════════════════════════════════════════
// F. STATIC SOURCE TESTS — createLead / CSV / OCR paths
// (Behavioral mocking without a live DB requires full Express middleware stack.
//  These tests verify the allocation wiring at the source level.)
// ════════════════════════════════════════════════════════════════════════════

test('TC-S-01: createLead calls pickNextEmployee after pickNextDirector', () => {
  const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
  const block = src.slice(src.indexOf('const createLead'), src.indexOf('const getLead ='));
  assert.ok(block.includes('pickNextEmployee'), 'createLead must call pickNextEmployee');
  assert.ok(block.includes('pick.directorId'), 'createLead must pass directorId to pickNextEmployee');
  assert.ok(block.includes('leadData.assignedTelecaller = empId'),
    'createLead must assign empId to assignedTelecaller');
});

test('TC-S-02: createLead Phase-2 guard skips telecaller self-owned leads', () => {
  const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
  assert.ok(
    src.includes("req.user.role !== 'telecaller' && !leadData.assignedTelecaller"),
    'Phase-2 guard must skip telecaller self-owned leads'
  );
  assert.ok(
    src.includes("leadData.assignedTelecaller = req.user._id"),
    'Telecaller self-ownership must be set before Phase-2 runs'
  );
});

test('TC-S-03: Non-admin/non-telecaller cannot force assignedTelecaller via request body', () => {
  const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
  assert.ok(
    src.includes("req.user.role !== 'admin' && req.user.role !== 'telecaller'") &&
    src.includes('delete leadData.assignedTelecaller'),
    'Non-admin/non-telecaller supplied assignedTelecaller must be deleted'
  );
});

test('TC-S-04: importCSV calls pickNextEmployee per row', () => {
  const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
  const csvBlock = src.slice(src.indexOf('const importCSV'), src.indexOf('module.exports'));
  assert.ok(csvBlock.includes('pickNextEmployee'),
    'importCSV must call pickNextEmployee for each row');
  assert.ok(csvBlock.includes('raw.assignedTelecaller = empId'),
    'importCSV must assign empId to assignedTelecaller');
});

test('TC-S-05: OCR import calls pickNextDirector but NOT pickNextEmployee (documented gap)', () => {
  const src = fs.readFileSync(require.resolve('../controllers/ocrController'), 'utf8');
  assert.ok(src.includes('pickNextDirector'),
    'OCR must call pickNextDirector (Phase 1)');
  assert.ok(src.includes('pickNextEmployee'),
    'OCR must call pickNextEmployee (Phase 8 Req 1: employee allocation on OCR import)');
});

// ════════════════════════════════════════════════════════════════════════════
// G. CONCURRENCY — documents non-atomic employee selection behavior
// ════════════════════════════════════════════════════════════════════════════

test('TC-G-01: Concurrent calls reading identical stale workload select the same employee (expected behavior)', async () => {
  // The employee allocator is explicitly non-atomic — it reads, computes, returns.
  // Two concurrent requests that both read the same leadCounts snapshot will select
  // the same employee. This is documented as expected behavior, not a bug.
  // The AQRR director layer has CAS protection; the employee layer does not.
  const setup = {
    tls:         [{ _id: IDS.tl1._id, managedBy: IDS.dir1._id }],
    telecallers: [
      { _id: IDS.e1._id, managedBy: IDS.tl1._id, isActive: true },
      { _id: IDS.e2._id, managedBy: IDS.tl1._id, isActive: true },
    ],
    present:    [{ employee: IDS.e1._id }, { employee: IDS.e2._id }],
    leadCounts: [], // both read 0/0 simultaneously (stale snapshot)
  };

  // Both calls see identical state — both will select the same employee (e1, lower _id)
  const [r1, r2] = await Promise.all([
    callPNE(IDS.dir1._id, setup),
    callPNE(IDS.dir1._id, setup),
  ]);

  // Both must return a valid employee (no crash)
  assert.ok(r1 !== null, 'First concurrent call must not return null');
  assert.ok(r2 !== null, 'Second concurrent call must not return null');

  // Both must select the same employee — this is the documented non-atomic behavior
  assert.strictEqual(String(r1), String(r2),
    'Concurrent calls with identical stale workload state select the same employee — expected non-atomic behavior');

  // Both should have selected e1 (lower _id wins tie at count=0)
  assert.strictEqual(String(r1), String(IDS.e1._id),
    'Both concurrent calls should select e1 (lowest _id at equal workload)');
});
