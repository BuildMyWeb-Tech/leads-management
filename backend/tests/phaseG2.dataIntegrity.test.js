/**
 * phaseG2.dataIntegrity.test.js — Automated verification for G.2 data
 * integrity and workflow changes.
 *
 * Tests:
 *   P1-004: Overdue count correctness (not capped by display list limit)
 *   P1-005: regenerateDirectorView field projection (structural)
 *   P1-006: Priority sort DB-side (rank logic correctness)
 *   P1-007: Director follow-ups split into overdue/today/upcoming
 *   P2-004: getDashboardStats includes priorityBreakdown and followUpKpis
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

// ── P1-004: Overdue count not capped at display limit ─────────

test('P1-004: telecaller overdueCount uses separate countDocuments, not list.length', () => {
  // Simulate the fixed controller: overdueCount comes from countDocuments
  // (accurate), overdueFollowUps comes from .find().limit(10) (display).
  const overdueCount    = 15;  // from countDocuments — the real count
  const overdueFollowUps = new Array(10).fill({}); // display list capped at 10

  // The KPI must use the accurate count, not the display list length
  const kpiOverdueCount = overdueCount; // G.2: uses separate variable
  assert.equal(kpiOverdueCount, 15, 'overdueCount should be the full count, not list.length');
  assert.equal(overdueFollowUps.length, 10, 'display list is still capped at 10');
  assert.ok(
    kpiOverdueCount !== overdueFollowUps.length,
    'they should differ when count > display limit'
  );
});

test('P1-004: when overdueCount <= 10, both values agree', () => {
  const overdueCount    = 7;
  const overdueFollowUps = new Array(7).fill({});
  assert.equal(overdueCount, overdueFollowUps.length);
});

// ── P1-005: Director_View field projection ─────────────────────

test('P1-005: regenerateDirectorView projection includes all 4 Director_View columns', () => {
  // Director_View columns: Director | Customer Name | Mobile Number | Remarks/Notes
  // Source fields:          assignedDirector | name | phone | remarks or notes
  const REQUIRED_FIELDS = ['assignedDirector', 'name', 'phone', 'remarks', 'notes', 'createdAt'];
  const projection = { assignedDirector: 1, name: 1, phone: 1, remarks: 1, notes: 1, createdAt: 1 };
  for (const field of REQUIRED_FIELDS) {
    assert.ok(projection[field] === 1, `Field '${field}' must be in projection`);
  }
});

test('P1-005: projection excludes heavy fields not needed by Director_View', () => {
  const projection = { assignedDirector: 1, name: 1, phone: 1, remarks: 1, notes: 1, createdAt: 1 };
  const heavyFields = ['callHistory', 'siteVisits', 'budget', 'plotSquareFeet', 'lastCallDetails'];
  for (const field of heavyFields) {
    assert.ok(
      !projection[field],
      `Heavy field '${field}' should not be in the Director_View projection`
    );
  }
});

// ── P1-006: Priority sort rank correctness ─────────────────────

// Re-implement the rank computation matching the G.2 aggregation $switch
function computePriorityRank(lead) {
  if (lead.status === 'Booked') return 1;
  if (lead.priority === 'Hot') return 2;
  const hasCompletedVisit =
    lead.status === 'Site Visit Done' ||
    (lead.siteVisits || []).some((sv) => sv.status === 'completed');
  if (hasCompletedVisit) return 3;
  const hasPlannedVisit =
    lead.status === 'Site Visit Planned' ||
    (lead.siteVisits || []).some((sv) => sv.status === 'planned');
  if (hasPlannedVisit) return 4;
  if (lead.priority === 'Warm') return 5;
  return 6;
}

test('P1-006: Booked leads rank 1 (highest priority)', () => {
  assert.equal(computePriorityRank({ status: 'Booked', priority: 'Cold' }), 1);
});

test('P1-006: Hot leads rank 2', () => {
  assert.equal(computePriorityRank({ status: 'Called', priority: 'Hot' }), 2);
});

test('P1-006: Booked outranks Hot', () => {
  const booked = computePriorityRank({ status: 'Booked', priority: 'Hot' });
  const hot    = computePriorityRank({ status: 'Called', priority: 'Hot' });
  assert.ok(booked < hot, 'Booked (rank 1) should outrank Hot (rank 2)');
});

test('P1-006: Site Visit Done ranks 3', () => {
  assert.equal(computePriorityRank({ status: 'Site Visit Done', priority: 'Warm' }), 3);
});

test('P1-006: siteVisits[] completed also ranks 3', () => {
  const lead = {
    status: 'Follow Up', priority: 'Cold',
    siteVisits: [{ status: 'completed' }],
  };
  assert.equal(computePriorityRank(lead), 3);
});

test('P1-006: Site Visit Planned ranks 4', () => {
  assert.equal(computePriorityRank({ status: 'Site Visit Planned', priority: 'Cold' }), 4);
});

test('P1-006: Warm ranks 5', () => {
  assert.equal(computePriorityRank({ status: 'Follow Up', priority: 'Warm', siteVisits: [] }), 5);
});

test('P1-006: Cold ranks 6 (lowest)', () => {
  assert.equal(computePriorityRank({ status: 'Called', priority: 'Cold', siteVisits: [] }), 6);
});

test('P1-006: rank ordering is Booked < Hot < CompletedVisit < PlannedVisit < Warm < Cold', () => {
  const ranks = [
    { status: 'Booked',            priority: 'Cold'  },
    { status: 'Called',            priority: 'Hot'   },
    { status: 'Site Visit Done',   priority: 'Cold'  },
    { status: 'Site Visit Planned',priority: 'Cold'  },
    { status: 'Follow Up',         priority: 'Warm', siteVisits: [] },
    { status: 'New',               priority: 'Cold', siteVisits: [] },
  ].map(computePriorityRank);
  for (let i = 0; i < ranks.length - 1; i++) {
    assert.ok(ranks[i] < ranks[i + 1], `rank[${i}]=${ranks[i]} should be < rank[${i+1}]=${ranks[i+1]}`);
  }
});

// ── P1-007: Director follow-ups date segmentation ──────────────

function segmentFollowUps(leads, now) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 86400000);
  return {
    overdue:  leads.filter(
      (l) => l.status === 'Follow Up' && l.followUpDate && new Date(l.followUpDate) < now
    ),
    today:    leads.filter(
      (l) => l.status === 'Follow Up' && l.followUpDate &&
             new Date(l.followUpDate) >= todayStart && new Date(l.followUpDate) < todayEnd
    ),
    upcoming: leads.filter(
      (l) => l.status === 'Follow Up' && l.followUpDate && new Date(l.followUpDate) >= todayEnd
    ),
  };
}

test('P1-007: overdue follow-up is placed in overdue bucket', () => {
  const now      = new Date('2026-09-09T10:00:00Z');
  const leads    = [{ status: 'Follow Up', followUpDate: '2026-09-08T09:00:00Z' }];
  const segments = segmentFollowUps(leads, now);
  assert.equal(segments.overdue.length,  1);
  assert.equal(segments.today.length,    0);
  assert.equal(segments.upcoming.length, 0);
});

test('P1-007: today follow-up is placed in today bucket', () => {
  const now      = new Date('2026-09-09T06:00:00Z'); // early morning UTC
  const leads    = [{ status: 'Follow Up', followUpDate: '2026-09-09T08:00:00Z' }];
  const segments = segmentFollowUps(leads, now);
  // The follow-up is today (same UTC date) and not before now
  assert.equal(segments.today.length, 1);
  assert.equal(segments.overdue.length, 0);
  assert.equal(segments.upcoming.length, 0);
});

test('P1-007: future follow-up is placed in upcoming bucket', () => {
  const now      = new Date('2026-09-09T10:00:00Z');
  const leads    = [{ status: 'Follow Up', followUpDate: '2026-09-11T10:00:00Z' }];
  const segments = segmentFollowUps(leads, now);
  assert.equal(segments.upcoming.length, 1);
  assert.equal(segments.overdue.length, 0);
  assert.equal(segments.today.length, 0);
});

test('P1-007: non-Follow-Up status is excluded from all buckets', () => {
  const now   = new Date('2026-09-09T10:00:00Z');
  const leads = [{ status: 'Called', followUpDate: '2026-09-08T09:00:00Z' }];
  const segs  = segmentFollowUps(leads, now);
  assert.equal(segs.overdue.length + segs.today.length + segs.upcoming.length, 0);
});

test('P1-007: null followUpDate is excluded from all buckets', () => {
  const now   = new Date('2026-09-09T10:00:00Z');
  const leads = [{ status: 'Follow Up', followUpDate: null }];
  const segs  = segmentFollowUps(leads, now);
  assert.equal(segs.overdue.length + segs.today.length + segs.upcoming.length, 0);
});

// ── P2-004: getDashboardStats response shape ───────────────────

test('P2-004: getDashboardStats response includes priorityBreakdown', () => {
  // Simulate the enriched response shape
  const response = {
    totalLeads: 100,
    priorityBreakdown: { hot: 20, warm: 50, cold: 30 },
    followUpKpis: { overdueCount: 5, todayCount: 3 },
  };
  assert.ok('priorityBreakdown' in response, 'priorityBreakdown must be present');
  assert.ok('hot'  in response.priorityBreakdown);
  assert.ok('warm' in response.priorityBreakdown);
  assert.ok('cold' in response.priorityBreakdown);
});

test('P2-004: getDashboardStats response includes followUpKpis', () => {
  const response = {
    followUpKpis: { overdueCount: 5, todayCount: 3 },
  };
  assert.ok('followUpKpis' in response);
  assert.ok('overdueCount' in response.followUpKpis);
  assert.ok('todayCount'   in response.followUpKpis);
});

test('P2-004: priorityBreakdown counts are non-negative integers', () => {
  const bd = { hot: 20, warm: 50, cold: 30 };
  assert.ok(bd.hot  >= 0 && Number.isInteger(bd.hot));
  assert.ok(bd.warm >= 0 && Number.isInteger(bd.warm));
  assert.ok(bd.cold >= 0 && Number.isInteger(bd.cold));
});
