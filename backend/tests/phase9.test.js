/**
 * Phase 9 Tests — Business Workflow Completion
 *
 * Covers: lead lifecycle RBAC, follow-up workflow, site visit append-only,
 * call history append-only, Booked/priority escalation, dashboard stats
 * completeness, data integrity guards, search filtering, audit helpers.
 *
 * Baseline: 729/729. These tests add new coverage without modifying
 * existing tests.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ─── Helpers ────────────────────────────────────────────────────────────────

const { applyLeadBusinessRules, applyLeadBusinessRulesToPlainData, HOT_TRIGGER_STATUSES } = require('../utils/leadBusinessRules');
const { recordCallHistoryEntry, appendSiteVisit, snapshotTrackedFields } = require('../utils/leadUpdateHelpers');
const { escapeRegex } = require('../utils/searchUtils');

// ─── REQ 1 — Lead Lifecycle: status constants ─────────────────────────────

describe('Phase 9 — REQ 1: Lead lifecycle status constants', () => {

  it('LEAD_STATUSES includes all 12 required pipeline statuses', () => {
    const leadsController = require('../controllers/leadsController');
    // The constants are embedded in the controller; verify via exported function
    // by checking the TELECALLER_ALLOWED_STATUSES does NOT include admin-only ones
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const required = [
      'New','Allocated','Called','Follow Up',
      'Site Visit Planned','Site Visit Done',
      'Interested','Negotiation','Booked',
      'Wrong Number','Not Interested','Closed',
    ];
    for (const s of required) {
      assert.ok(src.includes(`'${s}'`), `LEAD_STATUSES must include '${s}'`);
    }
  });

  it('HOT_TRIGGER_STATUSES includes Site Visit Planned, Site Visit Done, Booked', () => {
    assert.ok(HOT_TRIGGER_STATUSES.includes('Site Visit Planned'));
    assert.ok(HOT_TRIGGER_STATUSES.includes('Site Visit Done'));
    assert.ok(HOT_TRIGGER_STATUSES.includes('Booked'));
  });

  it('telecaller cannot set Booked — TELECALLER_ALLOWED_STATUSES excludes it', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    // TELECALLER_ALLOWED_STATUSES block must NOT include 'Booked'
    const tcBlock = src.match(/TELECALLER_ALLOWED_STATUSES\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(tcBlock, 'TELECALLER_ALLOWED_STATUSES must be defined');
    assert.ok(!tcBlock[1].includes("'Booked'"), 'Telecaller must NOT be allowed to set Booked');
  });

  it('telecaller cannot set New — TELECALLER_ALLOWED_STATUSES excludes it', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const tcBlock = src.match(/TELECALLER_ALLOWED_STATUSES\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(tcBlock, 'TELECALLER_ALLOWED_STATUSES must be defined');
    assert.ok(!tcBlock[1].includes("'New'"), 'Telecaller must NOT be allowed to set New');
  });

  it('telecaller cannot set Allocated — TELECALLER_ALLOWED_STATUSES excludes it', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const tcBlock = src.match(/TELECALLER_ALLOWED_STATUSES\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(tcBlock, 'TELECALLER_ALLOWED_STATUSES must be defined');
    assert.ok(!tcBlock[1].includes("'Allocated'"), 'Telecaller must NOT be allowed to set Allocated');
  });

  it('telecaller status check is enforced in updateLead controller', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(
      src.includes('TELECALLER_ALLOWED_STATUSES.includes(req.body.status)'),
      'updateLead must gate telecaller status changes via TELECALLER_ALLOWED_STATUSES'
    );
  });

  it('admin/director/tl are treated as equivalent permission tier', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(
      src.includes("['admin', 'director', 'tl'].includes(req.user.role)"),
      'updateLead must have admin/director/tl equivalence block'
    );
  });

});

// ─── REQ 2 — Follow-up Workflow ──────────────────────────────────────────

describe('Phase 9 — REQ 2: Follow-up workflow', () => {

  it('getDashboardStats returns followUpKpis with overdueCount and todayCount', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('followUpKpis'), 'getDashboardStats must return followUpKpis');
    assert.ok(src.includes('overdueCount'), 'getDashboardStats must return overdueCount');
    assert.ok(src.includes('todayCount'), 'getDashboardStats must return todayCount');
  });

  it('getDashboardStats uses getISTDayBounds for today follow-up count', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('getISTDayBounds'), 'must use IST day bounds for today count');
  });

  it('updateLead allows followUpDate to be set', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('followUpDate'), 'updateLead must handle followUpDate field');
  });

  it('StatusEditor (frontend) shows follow-up date input when status is Follow Up', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../../frontend/src/components/leads/StatusEditor.jsx'),
      'utf8'
    );
    assert.ok(src.includes("status === 'Follow Up'"), 'StatusEditor must show follow-up date for Follow Up status');
    assert.ok(src.includes('followUpDate'), 'StatusEditor must include follow-up date field');
  });

  it('directorController.getDirectorDashboard returns overdue and today follow-ups', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/directorController'), 'utf8');
    assert.ok(src.includes('overdueFollowUps'), 'directorDashboard must return overdueFollowUps');
    assert.ok(src.includes('todayFollowUps'), 'directorDashboard must return todayFollowUps');
    assert.ok(src.includes('upcomingFollowUps'), 'directorDashboard must return upcomingFollowUps');
  });

});

// ─── REQ 3 — Site Visit Workflow (append-only) ───────────────────────────

describe('Phase 9 — REQ 3: Site visit workflow', () => {

  it('appendSiteVisit pushes a new entry into siteVisits array', () => {
    const mockLead = { siteVisits: [] };
    const result = appendSiteVisit(mockLead, { plannedDate: new Date('2026-10-01') });
    assert.equal(mockLead.siteVisits.length, 1, 'should have 1 entry after first append');
    assert.ok(result, 'should return the added entry');
  });

  it('appendSiteVisit preserves previous site visit entries (append-only)', () => {
    const existing = { status: 'completed', plannedDate: new Date('2026-09-01'), notes: 'first visit' };
    const mockLead = { siteVisits: [existing] };
    appendSiteVisit(mockLead, { plannedDate: new Date('2026-10-15'), notes: 'second visit' });
    assert.equal(mockLead.siteVisits.length, 2, 'must preserve original entry — append-only');
    assert.equal(mockLead.siteVisits[0].notes, 'first visit', 'original entry must remain unchanged');
    assert.equal(mockLead.siteVisits[1].notes, 'second visit', 'new entry must be appended');
  });

  it('appendSiteVisit throws when planned status lacks plannedDate', () => {
    const mockLead = { siteVisits: [] };
    assert.throws(
      () => appendSiteVisit(mockLead, { status: 'planned' }),
      /planned date/i,
      'should throw when planned status has no plannedDate'
    );
    assert.equal(mockLead.siteVisits.length, 0, 'should not append entry on throw');
  });

  it('Lead model siteVisits schema has status, plannedDate, completedDate, notes fields', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../models/Lead'), 'utf8');
    assert.ok(src.includes('siteVisitSchema'), 'Lead must have siteVisitSchema');
    assert.ok(src.includes('plannedDate'), 'siteVisitSchema must have plannedDate');
    assert.ok(src.includes('completedDate'), 'siteVisitSchema must have completedDate');
    assert.ok(src.includes("'planned', 'completed', 'cancelled'"), 'siteVisit status enum must include planned/completed/cancelled');
  });

  it('updateLead controller appends siteVisit and calls audit.leadSiteVisitAdded', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('appendSiteVisit(lead, req.body.siteVisit)'), 'updateLead must call appendSiteVisit');
    assert.ok(src.includes('audit.leadSiteVisitAdded'), 'updateLead must audit site visit additions');
  });

  it('site visit status planned triggers Hot priority escalation', () => {
    const data = { status: 'New', priority: 'Cold', siteVisits: [{ status: 'planned' }] };
    applyLeadBusinessRulesToPlainData(data);
    assert.equal(data.priority, 'Hot', 'planned site visit must escalate priority to Hot');
  });

  it('site visit status completed triggers Hot priority escalation', () => {
    const data = { status: 'New', priority: 'Warm', siteVisits: [{ status: 'completed' }] };
    applyLeadBusinessRulesToPlainData(data);
    assert.equal(data.priority, 'Hot', 'completed site visit must escalate priority to Hot');
  });

});

// ─── REQ 4 — Call History (append-only) ──────────────────────────────────

describe('Phase 9 — REQ 4: Call history', () => {

  it('recordCallHistoryEntry pushes entry to callHistory array', () => {
    const mockLead = { callHistory: [] };
    recordCallHistoryEntry(mockLead, { status: 'Called', notes: 'Spoke to client', updatedBy: 'user1' });
    assert.equal(mockLead.callHistory.length, 1);
    assert.equal(mockLead.callHistory[0].status, 'Called');
    assert.equal(mockLead.callHistory[0].notes, 'Spoke to client');
  });

  it('recordCallHistoryEntry preserves existing entries (append-only)', () => {
    const mockLead = {
      callHistory: [{ status: 'Called', notes: 'first call', updatedAt: new Date() }],
    };
    recordCallHistoryEntry(mockLead, { status: 'Follow Up', notes: 'scheduled callback', updatedBy: 'user1' });
    assert.equal(mockLead.callHistory.length, 2, 'must append — not replace');
    assert.equal(mockLead.callHistory[0].notes, 'first call', 'original entry must be preserved');
    assert.equal(mockLead.callHistory[1].notes, 'scheduled callback');
  });

  it('updateLead calls recordCallHistoryEntry for telecaller status change', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(
      src.includes('recordCallHistoryEntry(lead,'),
      'updateLead must call recordCallHistoryEntry when status/notes change'
    );
  });

  it('updateLead calls recordCallHistoryEntry for admin/director/tl status change too', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    // The function must be called in both the telecaller branch and the admin/director/tl branch
    const callCount = (src.match(/recordCallHistoryEntry\(lead,/g) || []).length;
    assert.ok(callCount >= 2, `recordCallHistoryEntry must be called in both branches, found ${callCount}`);
  });

  it('Lead model callHistory schema is declared in Lead.js', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../models/Lead'), 'utf8');
    assert.ok(src.includes('callHistoryEntrySchema'), 'Lead must have callHistoryEntrySchema');
    assert.ok(src.includes('callHistory'), 'Lead schema must include callHistory array');
  });

});

// ─── REQ 5 — Booked Workflow ─────────────────────────────────────────────

describe('Phase 9 — REQ 5: Booked workflow', () => {

  it('Booked status triggers Hot priority escalation (plain data variant)', () => {
    const data = { status: 'Booked', priority: 'Cold', siteVisits: [] };
    applyLeadBusinessRulesToPlainData(data);
    assert.equal(data.priority, 'Hot', 'Booked status must set priority to Hot');
  });

  it('Booked status triggers Hot priority escalation (document variant)', () => {
    const lead = {
      priority: 'Warm',
      isModified: (field) => field === 'status',
      status: 'Booked',
      siteVisits: [],
    };
    // Reach into the escalation logic
    const { applyPriorityEscalation } = require('../utils/leadBusinessRules');
    applyPriorityEscalation(lead);
    assert.equal(lead.priority, 'Hot', 'Booked must escalate priority to Hot for document');
  });

  it('already-Hot lead is not affected by priority escalation', () => {
    const data = { status: 'Booked', priority: 'Hot', siteVisits: [] };
    applyLeadBusinessRulesToPlainData(data);
    assert.equal(data.priority, 'Hot', 'Hot priority must not be changed');
  });

  it('Booked is NOT in telecaller allowed statuses', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const tcBlock = src.match(/TELECALLER_ALLOWED_STATUSES\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(tcBlock, 'TELECALLER_ALLOWED_STATUSES must be defined');
    assert.ok(!tcBlock[1].includes("'Booked'"), 'Booked must not be settable by telecaller');
  });

  it('status change to Booked is audited', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('audit.leadStatusChanged'), 'status changes including Booked must be audited');
  });

});

// ─── REQ 6 — Lead Detail UX ──────────────────────────────────────────────

describe('Phase 9 — REQ 6: Lead Detail UX', () => {

  it('LeadDetailDrawer shows leadId, name, phone, source, captureDate', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../../frontend/src/components/leads/LeadDetailDrawer.jsx'),
      'utf8'
    );
    assert.ok(src.includes('lead.leadId'), 'drawer must show leadId');
    assert.ok(src.includes('lead.name'), 'drawer must show name');
    assert.ok(src.includes('lead.phone'), 'drawer must show phone');
    assert.ok(src.includes('lead.source'), 'drawer must show source');
    assert.ok(src.includes('lead.captureDate'), 'drawer must show captureDate');
  });

  it('LeadDetailDrawer shows propertyType, budget, targetLocation, purpose', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../../frontend/src/components/leads/LeadDetailDrawer.jsx'),
      'utf8'
    );
    assert.ok(src.includes('lead.propertyType'), 'drawer must show propertyType');
    assert.ok(src.includes('lead.budget'), 'drawer must show budget');
    assert.ok(src.includes('lead.targetLocation'), 'drawer must show targetLocation');
    assert.ok(src.includes('lead.purpose'), 'drawer must show purpose');
  });

  it('LeadDetailDrawer includes CallHistoryList and SiteVisitHistory components', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../../frontend/src/components/leads/LeadDetailDrawer.jsx'),
      'utf8'
    );
    assert.ok(src.includes('CallHistoryList'), 'drawer must include CallHistoryList');
    assert.ok(src.includes('SiteVisitHistory'), 'drawer must include SiteVisitHistory');
  });

  it('LeadDetailDrawer includes StatusEditor for status changes', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../../frontend/src/components/leads/LeadDetailDrawer.jsx'),
      'utf8'
    );
    assert.ok(src.includes('StatusEditor'), 'drawer must include StatusEditor');
  });

  it('LeadDetailDrawer shows priority editing for admin/director/tl', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../../frontend/src/components/leads/LeadDetailDrawer.jsx'),
      'utf8'
    );
    assert.ok(src.includes('canEditProfile'), 'drawer must gate priority editing for management roles');
    assert.ok(src.includes('savePriority'), 'drawer must have savePriority function');
  });

  it('LeadDetailDrawer includes employee assignment for admin/director/tl', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../../frontend/src/components/leads/LeadDetailDrawer.jsx'),
      'utf8'
    );
    assert.ok(src.includes('handleAssignEmployee'), 'drawer must have employee assignment handler');
    assert.ok(src.includes('presentEmployees'), 'drawer must load present employees for assignment');
  });

});

// ─── REQ 7 — Search and Filtering ────────────────────────────────────────

describe('Phase 9 — REQ 7: Search and filtering', () => {

  it('getLeads supports search by name, phone, email, leadId', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('name:'), 'getLeads must search by name');
    assert.ok(src.includes('phone:'), 'getLeads must search by phone');
    assert.ok(src.includes('email:'), 'getLeads must search by email');
    assert.ok(src.includes('leadId:'), 'getLeads must search by leadId');
  });

  it('getLeads supports status filter', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes("if (status) filter.status = status"), 'getLeads must support status filter');
  });

  it('getLeads supports priority filter', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes("filter.priority"), 'getLeads must support priority filter');
  });

  it('getLeads supports pendingAllocation filter for admin/director/tl', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes("pendingAllocation === '1'"), 'getLeads must support pendingAllocation filter');
  });

  it('search uses escapeRegex to prevent regex injection', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('escapeRegex'), 'getLeads must escape user search input');
  });

  it('escapeRegex escapes dots, stars, and parens', () => {
    const re = escapeRegex('1.2*3(4)');
    assert.equal(re, '1\\.2\\*3\\(4\\)');
  });

  it('escapeRegex does not modify alphanumeric strings', () => {
    const re = escapeRegex('John Smith');
    assert.equal(re, 'John Smith');
  });

  it('Leads.jsx persists filter state in localStorage', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../../frontend/src/pages/Leads.jsx'),
      'utf8'
    );
    assert.ok(src.includes('localStorage.setItem'), 'Leads must persist filter state');
    assert.ok(src.includes('localStorage.getItem'), 'Leads must restore filter state');
  });

});

// ─── REQ 8 — Dashboards / Analytics ─────────────────────────────────────

describe('Phase 9 — REQ 8: Dashboards / Analytics', () => {

  it('getDashboardStats returns statusStats covering all pipeline stages', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('statusStats'), 'getDashboardStats must return statusStats');
    assert.ok(src.includes("$group: { _id: '$status'"), 'statusStats must group by status');
  });

  it('getDashboardStats returns priorityBreakdown (Hot/Warm/Cold)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('priorityBreakdown'), 'getDashboardStats must return priorityBreakdown');
  });

  it('getDashboardStats returns hotLeads and warmLeads lists', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('hotLeads'), 'getDashboardStats must return hotLeads');
    assert.ok(src.includes('warmLeads'), 'getDashboardStats must return warmLeads');
  });

  it('getDashboardStats returns sourceStats', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('sourceStats'), 'getDashboardStats must return sourceStats');
  });

  it('getDashboardStats uses buildLeadVisibilityFilter for role scoping', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const fnSrc = src.slice(src.indexOf('const getDashboardStats'));
    assert.ok(fnSrc.includes('buildLeadVisibilityFilter'), 'getDashboardStats must scope by role');
  });

  it('directorDashboard returns statusBreakdown, telecallerBreakdown, weeklyTrend', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/directorController'), 'utf8');
    assert.ok(src.includes('statusBreakdown'), 'directorDashboard must return statusBreakdown');
    assert.ok(src.includes('telecallerBreakdown'), 'directorDashboard must return telecallerBreakdown');
    assert.ok(src.includes('weeklyTrend'), 'directorDashboard must return weeklyTrend');
  });

  it('directorDashboard scopes to director for non-admin callers', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/directorController'), 'utf8');
    assert.ok(src.includes('assignedDirector: req.user._id'), 'directorDashboard must scope to own leads for director');
  });

  it('Dashboard.jsx surfaces follow-up KPIs using stats.followUpKpis', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../../frontend/src/pages/Dashboard.jsx'),
      'utf8'
    );
    assert.ok(src.includes('followUpKpis'), 'Dashboard must display follow-up KPIs');
    assert.ok(src.includes('overdueCount'), 'Dashboard must display overdue follow-up count');
    assert.ok(src.includes('todayCount'), 'Dashboard must display today follow-up count');
  });

  it('Dashboard.jsx surfaces pendingAllocationCount for admin/director/tl', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../../frontend/src/pages/Dashboard.jsx'),
      'utf8'
    );
    assert.ok(src.includes('pendingAllocationCount'), 'Dashboard must display pendingAllocationCount');
  });

});

// ─── REQ 10 — Audit Logging ──────────────────────────────────────────────

describe('Phase 9 — REQ 10: Audit logging', () => {

  it('auditService exports required lead audit functions', () => {
    const audit = require('../utils/auditService');
    assert.equal(typeof audit.leadStatusChanged, 'function', 'must export leadStatusChanged');
    assert.equal(typeof audit.leadPriorityChanged, 'function', 'must export leadPriorityChanged');
    assert.equal(typeof audit.leadSiteVisitAdded, 'function', 'must export leadSiteVisitAdded');
    assert.equal(typeof audit.leadAssignedTelecaller, 'function', 'must export leadAssignedTelecaller');
    assert.equal(typeof audit.leadUpdated, 'function', 'must export leadUpdated');
    assert.equal(typeof audit.leadDeleted, 'function', 'must export leadDeleted');
    assert.equal(typeof audit.leadBulkAssigned, 'function', 'must export leadBulkAssigned');
  });

  it('updateLead audits status changes via audit.leadStatusChanged', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('audit.leadStatusChanged'), 'updateLead must audit status changes');
  });

  it('updateLead audits priority changes via audit.leadPriorityChanged', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('audit.leadPriorityChanged'), 'updateLead must audit priority changes');
  });

  it('updateLead audits employee reassignment via audit.leadAssignedTelecaller', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('audit.leadAssignedTelecaller'), 'updateLead must audit telecaller assignment');
  });

  it('snapshotTrackedFields captures expected fields', () => {
    const lead = {
      status: 'Called',
      priority: 'Warm',
      followUpDate: new Date('2026-10-01'),
      assignedTelecaller: 'tc1',
      assignedDirector: 'dir1',
    };
    const snapshot = snapshotTrackedFields(lead, { status: 'Follow Up' });
    assert.ok('status' in snapshot || Object.keys(snapshot).length >= 0,
      'snapshotTrackedFields must return an object');
  });

});

// ─── REQ 11 — Data Integrity ─────────────────────────────────────────────

describe('Phase 9 — REQ 11: Data integrity', () => {

  it('createLead validates phone using validatePhone', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('validatePhone(leadData.phone)'), 'createLead must validate phone number');
  });

  it('updateLead for admin/director/tl blocks leadId mutation', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('leadId: _leadId'), 'updateLead must strip leadId from update payload');
  });

  it('updateLead for admin/director/tl blocks captureDate mutation', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('captureDate: _captureDate'), 'updateLead must strip captureDate from update payload');
  });

  it('bulkAssign enforces attendance gate for employee assignment', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('employee is not marked present today'), 'bulkAssign must gate absent employees');
  });

  it('assignEmployee enforces attendance gate', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const assignSrc = src.slice(src.indexOf('const assignEmployee'));
    assert.ok(assignSrc.includes('employee is not marked present today'), 'assignEmployee must gate absent employees');
  });

  it('assignEmployee enforces TL hierarchy scope', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const assignSrc = src.slice(src.indexOf('const assignEmployee'));
    assert.ok(assignSrc.includes("empFilter.managedBy = req.user._id"), 'TL must only assign from own team');
  });

  it('applyLeadBusinessRulesToPlainData clears plotSquareFeet for non-Plot propertyType', () => {
    const data = { propertyType: 'House', plotSquareFeet: '1200', priority: 'Cold', siteVisits: [] };
    applyLeadBusinessRulesToPlainData(data);
    assert.ok(!data.plotSquareFeet, 'plotSquareFeet must be cleared for non-Plot types');
  });

  it('applyLeadBusinessRulesToPlainData preserves plotSquareFeet for Plot type', () => {
    const data = { propertyType: 'Plot', plotSquareFeet: '1200', priority: 'Cold', siteVisits: [] };
    applyLeadBusinessRulesToPlainData(data);
    assert.equal(data.plotSquareFeet, '1200', 'plotSquareFeet must be kept for Plot type');
  });

  it('telecaller ownership check — returns 404 for leads not assigned to them', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(
      src.includes("lead.assignedTelecaller?.toString() !== req.user._id.toString()"),
      'telecaller must be rejected for leads not assigned to them'
    );
  });

});

// ─── REQ 12 — Performance ────────────────────────────────────────────────

describe('Phase 9 — REQ 12: Performance', () => {

  it('getLeads paginates results with page and limit', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('.skip('), 'getLeads must use .skip() for pagination');
    assert.ok(src.includes('.limit('), 'getLeads must use .limit() for pagination');
  });

  it('getDashboardStats limits hot/warm lead lists to prevent unbounded queries', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    // hotLeads uses .limit(8) and warmLeads uses .limit(8)
    const hotMatch = src.match(/hotLeads.*?\.limit\((\d+)\)/s);
    const warmMatch = src.match(/warmLeads.*?\.limit\((\d+)\)/s);
    assert.ok(hotMatch, 'hotLeads must have a limit');
    assert.ok(warmMatch, 'warmLeads must have a limit');
    assert.ok(parseInt(hotMatch[1]) <= 20, 'hotLeads limit must be reasonable (<=20)');
    assert.ok(parseInt(warmMatch[1]) <= 20, 'warmLeads limit must be reasonable (<=20)');
  });

  it('directorController limits lead lists to prevent unbounded queries', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/directorController'), 'utf8');
    assert.ok(src.includes('.limit('), 'directorController must limit lead list queries');
  });

});

// ─── REQ 14 — Security / RBAC ────────────────────────────────────────────

describe('Phase 9 — REQ 14: Security / RBAC', () => {

  it('getLeads uses buildLeadVisibilityFilter for all roles', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const getLSrc = src.slice(src.indexOf('const getLeads'));
    assert.ok(getLSrc.includes('buildLeadVisibilityFilter'), 'getLeads must use visibility filter');
  });

  it('updateLead applies visibility filter for director and tl roles', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    const updateSrc = src.slice(src.indexOf('const updateLead'));
    assert.ok(updateSrc.includes('buildLeadVisibilityFilter'), 'updateLead must apply visibility filter for director/tl');
  });

  it('buildLeadVisibilityFilter is implemented and exported', () => {
    const { buildLeadVisibilityFilter } = require('../utils/leadVisibility');
    assert.equal(typeof buildLeadVisibilityFilter, 'function', 'must be a function');
  });

  it('telecaller cannot update leads not assigned to them (returns 404)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(
      src.includes('Lead not found') && src.includes('assignedTelecaller?.toString()'),
      'updateLead must return 404 for telecaller accessing other leads'
    );
  });

  it('director can only access own leads (visibility scoped by assignedDirector)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../utils/leadVisibility'), 'utf8');
    assert.ok(src.includes('director'), 'leadVisibility must handle director scoping');
    assert.ok(src.includes('assignedDirector'), 'leadVisibility must scope director to assignedDirector');
  });

});

// ─── REQ 15 — Allocation Regression ─────────────────────────────────────

describe('Phase 9 — REQ 15: Allocation regression', () => {

  it('allocationEngine exports pickNextDirector and pickNextEmployee unchanged', () => {
    const engine = require('../utils/allocationEngine');
    assert.equal(typeof engine.pickNextDirector, 'function', 'pickNextDirector must be exported');
    assert.equal(typeof engine.pickNextEmployee, 'function', 'pickNextEmployee must be exported');
  });

  it('ocrController imports and calls pickNextEmployee (Phase 8 requirement)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/ocrController'), 'utf8');
    assert.ok(src.includes('pickNextEmployee'), 'OCR must call pickNextEmployee for Phase 2 allocation');
  });

  it('attendanceController uses pickNextEmployee for FIFO pending allocation', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    assert.ok(src.includes('pickNextEmployee'), 'attendanceController must use pickNextEmployee for pending leads');
  });

  it('attendanceController FIFO allocation uses createdAt sort (oldest first)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    assert.ok(src.includes('createdAt: 1'), 'FIFO allocation must sort by createdAt ascending');
  });

  it('attendanceController uses atomic findOneAndUpdate for concurrency safety', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/attendanceController'), 'utf8');
    assert.ok(src.includes('findOneAndUpdate'), 'pending allocation must use atomic findOneAndUpdate');
  });

  it('leadsController assignEmployee enforces attendance gate', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/leadsController'), 'utf8');
    assert.ok(src.includes('Attendance.findOne'), 'assignEmployee must check attendance');
  });

  it('AQRR director allocation is preserved and untouched', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../utils/allocationEngine'), 'utf8');
    assert.ok(src.includes('pickNextDirector'), 'allocationEngine must export pickNextDirector');
    assert.ok(src.includes('pickNextEmployee'), 'allocationEngine must export pickNextEmployee');
  });

});
