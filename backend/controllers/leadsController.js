const Lead         = require('../models/Lead');
const XLSX         = require('xlsx');
const { pickNextDirector } = require('../utils/allocationEngine');
const syncToSheets = require('../utils/syncToSheets');
const { normalisePhone, normaliseForDedupe } = require('../utils/phoneUtils');
const { regenerateDirectorView } = require('../utils/syncToSheets');
const { notify }   = require('../utils/pushService');
const audit        = require('../utils/auditService');   // PHASE 10
const { generateLeadId } = require('../utils/leadIdGenerator');           // PHASE C
const { buildLeadVisibilityFilter } = require('../utils/leadVisibility'); // PHASE C
const { getISTDayBounds } = require('../utils/dateHelper'); // I2-001
const { sortLeadsByPriority } = require('../utils/priorityRanking');      // PHASE C
const { recordCallHistoryEntry, appendSiteVisit, snapshotTrackedFields } = require('../utils/leadUpdateHelpers'); // PHASE C/E
const { applyLeadBusinessRulesToPlainData } = require('../utils/leadBusinessRules'); // PHASE E
const { escapeRegex } = require('../utils/searchUtils'); // PHASE E

const LEAD_STATUSES = [
  'New','Allocated','Called','Follow Up',
  'Site Visit Planned','Site Visit Done',
  'Interested','Negotiation','Booked',
  'Wrong Number','Not Interested','Closed',
];
const LEAD_SOURCES = ['YouTube','Google Ads','Facebook','Instagram','Referral','Walk-in','Website','Other'];
const TELECALLER_ALLOWED_STATUSES = [
  'Called','Follow Up','Site Visit Planned','Site Visit Done',
  'Interested','Negotiation','Wrong Number','Not Interested',
];

// ── GET /api/leads ────────────────────────────────────────────
// PHASE C: base role scoping now comes from the shared
// buildLeadVisibilityFilter() helper (adds correct 'tl' scoping;
// admin/director/telecaller behaviour is unchanged from before).
// Optional `?sort=priority` requests the Phase C dashboard ordering
// (Booked > Hot > completed visit > upcoming visit > Warm > Cold,
// see priorityRanking.js) — purely additive; omitting it keeps the
// exact previous createdAt-desc behaviour. No frontend change reads
// this parameter yet.
const getLeads = async (req, res) => {
  try {
    const { status, source, assignedDirector, assignedTelecaller, search, sort, page = 1, limit = 25, priority, propertyType } = req.query;
    const filter = await buildLeadVisibilityFilter(req.user);
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (assignedDirector  && req.user.role === 'admin') filter.assignedDirector  = assignedDirector;
    if (assignedTelecaller && req.user.role !== 'telecaller') filter.assignedTelecaller = assignedTelecaller;
    // PHASE F: priority and propertyType filters (read-only; never mutate priority)
    const VALID_PRIORITIES    = ['Hot', 'Warm', 'Cold'];
    const VALID_PROPERTY_TYPES = ['Plot', 'House'];
    if (priority     && VALID_PRIORITIES.includes(priority))       filter.priority     = priority;
    if (propertyType && VALID_PROPERTY_TYPES.includes(propertyType)) filter.propertyType = propertyType;
    if (search) {
      // PHASE E: escape regex metacharacters so search text is always
      // matched literally (see utils/searchUtils.js) — behaviour for
      // ordinary text is unchanged.
      const safeSearch = escapeRegex(search);
      // PHASE F: also search by leadId
      filter.$or = [
        { name:   { $regex: safeSearch, $options: 'i' } },
        { phone:  { $regex: safeSearch, $options: 'i' } },
        { email:  { $regex: safeSearch, $options: 'i' } },
        { leadId: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    if (sort === 'priority') {
      // G.2 FIX (P1-006): DB-side sort via $addFields + $switch so only
      // the requested page is transferred from MongoDB, not the full
      // collection. Ranking order matches priorityRanking.js exactly:
      //   1 Booked, 2 Hot, 3 Completed site visit, 4 Upcoming site visit,
      //   5 Warm, 6 Cold.
      const now = new Date();
      const p = Number(page), l = Number(limit);
      const total = await Lead.countDocuments(filter);
      const rawLeads = await Lead.aggregate([
        { $match: filter },
        { $addFields: {
          _priorityRank: { $switch: {
            branches: [
              { case: { $eq: ['$status', 'Booked'] }, then: 1 },
              { case: { $eq: ['$priority', 'Hot'] },  then: 2 },
              { case: { $or: [
                { $eq: ['$status', 'Site Visit Done'] },
                { $gt: [{ $size: { $filter: {
                  input: { $ifNull: ['$siteVisits', []] },
                  as: 'sv', cond: { $eq: ['$$sv.status', 'completed'] },
                }}]}, 0] },
              ]}, then: 3 },
              { case: { $or: [
                { $eq: ['$status', 'Site Visit Planned'] },
                { $gt: [{ $size: { $filter: {
                  input: { $ifNull: ['$siteVisits', []] },
                  as: 'sv', cond: { $eq: ['$$sv.status', 'planned'] },
                }}]}, 0] },
              ]}, then: 4 },
              { case: { $eq: ['$priority', 'Warm'] }, then: 5 },
            ],
            default: 6,
          }},
          _isOverdue: { $and: [
            { $eq: ['$status', 'Follow Up'] },
            { $ne:  ['$followUpDate', null] },
            { $lt:  ['$followUpDate', now]  },
          ]},
        }},
        { $sort: { _priorityRank: 1, _isOverdue: -1, followUpDate: 1, updatedAt: -1, createdAt: -1 } },
        { $skip:  (p - 1) * l },
        { $limit: l },
        { $unset: ['_priorityRank', '_isOverdue'] },
      ]);
      const leads = await Lead.populate(rawLeads, [
        { path: 'assignedDirector',   select: 'name email' },
        { path: 'assignedTelecaller', select: 'name email' },
      ]);
      return res.json({ leads, total, page: p, pages: Math.ceil(total / l) });
    }

    const total = await Lead.countDocuments(filter);
    const leads = await Lead.find(filter)
      .populate('assignedDirector',   'name email')
      .populate('assignedTelecaller', 'name email')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ leads, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── POST /api/leads ───────────────────────────────────────────
// Manual lead creation. Auto-allocation uses the Adaptive
// Quota-Based Round Robin engine (pickNextDirector). On success,
// the new lead is appended to Operational_Leads (fast path, via
// syncToSheets 'create').
//
// Director_View IS regenerated here IF the lead was allocated to a
// director (i.e. assignedDirector is set) — so newly-created/
// allocated leads appear in the grouped report immediately, rather
// than only after a later bulkAssign/telecaller-assignment or manual
// sync. This is a low-frequency event (one regen per lead created),
// distinct from updateLead (status changes), which remains a no-op
// for Director_View since telecallers update many leads per day.
const createLead = async (req, res) => {
  try {
    const leadData = { ...req.body };
    if (!leadData.assignedDirector) {
      try {
        const pick = await pickNextDirector();
        if (pick) { leadData.assignedDirector = pick.directorId; leadData.status = 'Allocated'; }
      } catch (e) { console.warn('Auto-allocation skipped:', e.message); }
    }
    const lead = await Lead.create(leadData);
    const populated = await Lead.findById(lead._id)
      .populate('assignedDirector',   'name email')
      .populate('assignedTelecaller', 'name email');

    res.status(201).json(populated);

    // Non-fatal side effects
    audit.leadCreated(req, populated);
    if (populated.assignedDirector) {
      audit.leadAssignedDirector(req, populated, populated.assignedDirector.name);
      notify.leadAllocatedToDirector(populated.assignedDirector._id, populated.name);
    }
    if (populated.assignedTelecaller) {
      audit.leadAssignedTelecaller(req, populated, populated.assignedTelecaller.name);
      notify.leadAssignedToTelecaller(populated.assignedTelecaller._id, populated.name);
    }
    syncToSheets(populated, 'create');

    // Director_View — regenerate when a newly-created lead is
    // allocated to a director, so it appears in the grouped report
    // immediately rather than waiting for a later bulkAssign/sync.
    // Skipped if the lead has no director yet (nothing changes in
    // Director_View for an unallocated lead).
    if (populated.assignedDirector) {
      regenerateDirectorView().catch((e) =>
        console.error('[CreateLead] Director_View regen failed:', e.message)
      );
    }
  } catch (err) { res.status(400).json({ message: err.message }); }
};

// ── GET /api/leads/:id ────────────────────────────────────────
// PHASE C SECURITY FIX: this endpoint previously had NO role-based
// visibility restriction — any authenticated user could fetch any
// lead by ID regardless of role/ownership. Now scoped through the
// same centralized buildLeadVisibilityFilter() used by getLeads/
// getDashboardStats (no second/duplicate visibility implementation).
// Following the existing app convention (see
// telecallerController.updateMyLead's findOne+404 pattern): a lead
// that exists but is outside the caller's visibility returns the
// exact same 404 "Lead not found" as a genuinely missing lead, so the
// response never discloses whether an inaccessible lead exists.
const getLead = async (req, res) => {
  try {
    const filter = await buildLeadVisibilityFilter(req.user);
    const lead = await Lead.findOne({ _id: req.params.id, ...filter })
      .populate('assignedDirector',   'name email')
      .populate('assignedTelecaller', 'name email')
      .populate({ path: 'callHistory.updatedBy', select: 'name', strictPopulate: false });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json(lead);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── PUT /api/leads/:id ────────────────────────────────────────
// syncToSheets(updated, 'update') is now a no-op for
// Operational_Leads (append-only audit timeline — see
// syncToSheets.js). Director_View is left stale until the next
// regeneration trigger (Sync All / batch import / config change),
// per client confirmation that this is acceptable.
const updateLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const prevStatus     = lead.status;
    const prevPriority   = lead.priority;
    const prevTelecaller = lead.assignedTelecaller?.toString();
    let addedSiteVisit   = null;
    // PHASE E: snapshot BEFORE any field is mutated, for the generic
    // audit event's before/after pair (see auditService.leadUpdated).
    const beforeSnapshot  = snapshotTrackedFields(lead, req.body);

    // PHASE D SIGN-OFF: admin, director, and tl are ONE equivalent
    // permission tier for lead management (explicit product decision
    // — not a security gap; see Phase D final verification report).
    // telecaller remains the separate, restricted tier from Phase C.
    if (req.user.role === 'telecaller') {
      // PHASE F: enforce ownership — telecaller may only update a lead
      // assigned to them. Return 404 so callers cannot enumerate
      // other telecallers' lead IDs through error-code differences.
      if (lead.assignedTelecaller?.toString() !== req.user._id.toString()) {
        return res.status(404).json({ message: 'Lead not found' });
      }
      if (req.body.status !== undefined) {
        if (!TELECALLER_ALLOWED_STATUSES.includes(req.body.status)) {
          return res.status(403).json({ message: `Status "${req.body.status}" not allowed for telecallers` });
        }
        lead.status = req.body.status;
      }
      if (req.body.notes        !== undefined) lead.notes        = req.body.notes;
      if (req.body.remarks      !== undefined) lead.remarks      = req.body.remarks;
      if (req.body.followUpDate !== undefined) lead.followUpDate = req.body.followUpDate || null;

      if (req.body.status !== undefined || req.body.notes !== undefined) {
        recordCallHistoryEntry(lead, { status: lead.status, notes: req.body.notes || lead.notes || '', updatedBy: req.user._id });
      }
      if (req.body.siteVisit !== undefined) {
        addedSiteVisit = appendSiteVisit(lead, req.body.siteVisit);
      }
      await lead.save();
    } else if (['admin', 'director', 'tl'].includes(req.user.role)) {
      // H.2 FIX (H1-003): leadId is immutable after creation (atomic unique
      // identifier — changing it post-creation corrupts the lead ID system).
      // captureDate must not be alterable through the normal update workflow.
      // Both are silently discarded here; no legitimate management UI sends them.
      const {
        callHistory,
        siteVisits,
        siteVisit,
        leadId: _leadId,
        captureDate: _captureDate,
        ...rest
      } = req.body;
      Object.assign(lead, rest);
      // Equivalent to telecaller's own behavior: recording a
      // status/notes change also appends to callHistory and refreshes
      // lastCallDetails for admin/director/tl too (previously only
      // telecaller got this — an inconsistency, not an intentional
      // restriction, so it's closed here as part of the equivalence
      // decision).
      if (req.body.status !== undefined || req.body.notes !== undefined) {
        recordCallHistoryEntry(lead, { status: lead.status, notes: req.body.notes || lead.notes || '', updatedBy: req.user._id });
      }
      if (siteVisit !== undefined) {
        addedSiteVisit = appendSiteVisit(lead, siteVisit);
      }
      await lead.save();
    } else {
      // Fail-safe: any unrecognised role gets no write access here.
      return res.status(403).json({ message: 'Not authorized to update leads' });
    }

    const updated = await Lead.findById(lead._id)
      .populate('assignedDirector',   'name email')
      .populate('assignedTelecaller', 'name email')
      .populate({ path: 'callHistory.updatedBy', select: 'name', strictPopulate: false });

    res.json(updated);

    // Audit side effects
    if (updated.status !== prevStatus) {
      audit.leadStatusChanged(req, updated, prevStatus, updated.status);
      if (updated.assignedDirector) {
        notify.statusChanged(updated.assignedDirector._id, updated.name, prevStatus, updated.status);
      }
    } else {
      // PHASE E: real before/after values, not just "after".
      const afterSnapshot = snapshotTrackedFields(updated, req.body);
      audit.leadUpdated(req, updated, beforeSnapshot, afterSnapshot);
    }

    if (updated.priority !== prevPriority) {
      audit.leadPriorityChanged(req, updated, prevPriority, updated.priority);
    }

    if (addedSiteVisit) {
      audit.leadSiteVisitAdded(req, updated, addedSiteVisit);
    }

    const newTelecaller = updated.assignedTelecaller?._id?.toString();
    if (newTelecaller && newTelecaller !== prevTelecaller) {
      audit.leadAssignedTelecaller(req, updated, updated.assignedTelecaller.name);
      notify.leadAssignedToTelecaller(updated.assignedTelecaller._id, updated.name);
    }

    syncToSheets(updated, 'update');
  } catch (err) { res.status(400).json({ message: err.message }); }
};

// ── DELETE /api/leads/:id ─────────────────────────────────────
const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json({ message: 'Lead deleted successfully' });
    audit.leadDeleted(req, lead);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── POST /api/leads/bulk-assign ───────────────────────────────
// syncToSheets(l, 'update') calls below are no-ops for
// Operational_Leads (append-only) — kept in place (harmless) for
// future-proofing in case 'update' behaviour changes again, and
// because they still drive lastSyncAt/lastSyncStatus bookkeeping
// for 'create'-trigger leads in other code paths.
//
// Director_View IS regenerated after bulkAssign (telecaller
// assignment changes) — see the regenerateDirectorView() call at the
// end of this function. This is distinct from updateLead (status
// changes), which does NOT trigger a regen, since telecallers update
// many leads per day and that would cause excessive Sheets rewrites.
// Admins can always force a full refresh via "Sync All Leads".
const bulkAssign = async (req, res) => {
  try {
    const { leadIds, assignedDirector, assignedTelecaller } = req.body;
    if (!leadIds?.length) return res.status(400).json({ message: 'leadIds required' });
    const update = {};
    if (assignedDirector   !== undefined) update.assignedDirector   = assignedDirector   || null;
    if (assignedTelecaller !== undefined) update.assignedTelecaller = assignedTelecaller || null;
    const result = await Lead.updateMany({ _id: { $in: leadIds } }, { $set: update });
    if (assignedDirector) {
      await Lead.updateMany({ _id: { $in: leadIds }, status: 'New' }, { $set: { status: 'Allocated' } });
    }
    res.json({ message: `${result.modifiedCount} lead(s) updated`, modifiedCount: result.modifiedCount });

    // Audit + notify post-response
    const User = require('../models/User');
    let dirName = '', tcName = '';
    if (assignedDirector) {
      const dir = await User.findById(assignedDirector).select('name').lean();
      dirName = dir?.name || '';
      notify.leadAllocatedToDirector(assignedDirector, '', leadIds.length);
    }
    if (assignedTelecaller) {
      const tc = await User.findById(assignedTelecaller).select('name').lean();
      tcName = tc?.name || '';
      const leads = await Lead.find({ _id: { $in: leadIds } }).select('name').lean();
      for (const l of leads) notify.leadAssignedToTelecaller(assignedTelecaller, l.name);
    }
    audit.leadBulkAssigned(req, leadIds.length, dirName, tcName);

    // syncToSheets(l, 'update') — no-op for Operational_Leads
    // (append-only). Left in place for bookkeeping consistency;
    // see comment above the function.
    const updatedLeads = await Lead.find({ _id: { $in: leadIds } })
      .populate('assignedDirector',   'name email')
      .populate('assignedTelecaller', 'name email');
    for (const l of updatedLeads) {
      syncToSheets(l, 'update');
    }

    // Director_View — regenerate after telecaller assignment changes.
    // Per client requirement: bulkAssign (director assigning leads to
    // telecallers) is one of the explicit Director_View regeneration
    // triggers, distinct from individual status updates (updateLead),
    // which intentionally do NOT trigger a regen (telecallers update
    // many leads per day — regenerating on every status change would
    // cause excessive Sheets rewrites). Non-fatal; runs after the
    // response has been sent.
    regenerateDirectorView().catch((e) =>
      console.error('[BulkAssign] Director_View regen failed:', e.message)
    );
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── POST /api/leads/import-csv ────────────────────────────────
// CSV-imported leads use the Adaptive Quota-Based Round Robin
// engine (one pick per row, continuing the persisted cycle). On
// success, each inserted lead is appended to Operational_Leads, and
// Director_View is regenerated ONCE for the whole batch — per
// client requirement: "Regenerate Director_View automatically ...
// after CSV bulk imports complete."
const importCSV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) return res.status(400).json({ message: 'File is empty' });
    const normalize = (k) => k.toLowerCase().replace(/[\s_\-().]/g, '');
    const aliases = {
      name:   ['name','fullname','clientname','leadname','customername','contactname'],
      phone:  ['phone','mobile','contact','phonenumber','mobilenumber','cell','telephone'],
      email:  ['email','emailaddress','mail','emailid'],
      source: ['source','leadsource','channel','medium'],
      status: ['status','leadstatus','stage'],
    };
    const headers = Object.keys(rows[0]);
    const mapping = {};
    for (const [field, list] of Object.entries(aliases)) {
      const m = headers.find((h) => list.includes(normalize(h)));
      if (m) mapping[field] = m;
    }
    if (!mapping.name || !mapping.phone) {
      return res.status(400).json({ message: 'Could not detect Name or Phone columns.', detectedHeaders: headers });
    }
    const leadsToInsert = [];
    for (const r of rows.filter((r) => r[mapping.name] && r[mapping.phone])) {
      const rawPhone  = normalisePhone(String(r[mapping.phone]).trim());
      if (!rawPhone) continue; // skip rows with unparseable phone numbers
      const raw = {
        name:   String(r[mapping.name]).trim(),
        phone:  rawPhone,
        email:  mapping.email  ? String(r[mapping.email]).trim()  : '',
        source: LEAD_SOURCES.includes(String(r[mapping.source] || '').trim()) ? String(r[mapping.source]).trim() : 'Other',
        status: LEAD_STATUSES.includes(String(r[mapping.status] || '').trim()) ? String(r[mapping.status]).trim() : 'New',
      };
      try {
        // Adaptive Quota-Based Round Robin — one pick per row,
        // continuing the persisted cycleRemaining/currentPointer.
        const pick = await pickNextDirector();
        if (pick) { raw.assignedDirector = pick.directorId; raw.status = 'Allocated'; }
      } catch (_) {}
      // PHASE C: insertMany() below bypasses Lead.js's pre('save')
      // hook (that's what generates leadId for normal create/update),
      // so bulk-imported rows need it assigned explicitly here — same
      // atomic generator from Phase B, no second implementation.
      try {
        raw.leadId = await generateLeadId(new Date());
      } catch (e) {
        console.error('[CSV Import] leadId generation failed for a row:', e.message);
      }
      // PHASE E: insertMany() below bypasses Lead.js's pre('save')
      // hook, so priority escalation / plot-field cleanup — normally
      // applied there — must be applied explicitly here, using the
      // exact same rule logic (no second implementation). Matters in
      // practice for CSV rows whose Status column is 'Booked' etc.
      applyLeadBusinessRulesToPlainData(raw);
      leadsToInsert.push(raw);
    }
    if (!leadsToInsert.length) return res.status(400).json({ message: 'No valid rows found' });
    const inserted = await Lead.insertMany(leadsToInsert, { ordered: false });
    res.json({ message: `${inserted.length} lead(s) imported`, count: inserted.length });
    audit.leadImportedCSV(req, inserted.length);

    // Append each newly-inserted lead to Operational_Leads
    // (fast path, no Director_View regen per-lead).
    if (inserted.length > 0) {
      try {
        const populated = await Lead.find({ _id: { $in: inserted.map((l) => l._id) } })
          .populate('assignedDirector', 'name email')
          .populate('assignedTelecaller', 'name email');
        for (const lead of populated) {
          syncToSheets(lead, 'create');
        }
      } catch (e) {
        console.error('[CSV Import] Operational_Leads sync failed:', e.message);
      }

      // Director_View — regenerate ONCE for the whole batch.
      // Non-fatal; runs after the response has been sent.
      regenerateDirectorView().catch((e) =>
        console.error('[CSV Import] Director_View regen failed:', e.message)
      );
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── GET /api/leads/dashboard/stats ───────────────────────────
const getDashboardStats = async (req, res) => {
  try {
    // PHASE C: same shared visibility filter as getLeads — adds
    // correct 'tl' scoping; admin/director/telecaller unchanged.
    const filter = await buildLeadVisibilityFilter(req.user);
    const now = new Date();
    const [totalLeads, statusStats, sourceStats, recentLeads, directorStats, priorityStats, overdueCount, todayCount] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Lead.aggregate([{ $match: filter }, { $group: { _id: '$source',  count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Lead.find(filter).sort({ createdAt: -1 }).limit(5).populate('assignedDirector','name').populate('assignedTelecaller','name'),
      req.user.role === 'admin'
        ? Lead.aggregate([
            { $match: { assignedDirector: { $ne: null } } },
            { $group: { _id: '$assignedDirector', count: { $sum: 1 } } },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'director' } },
            { $unwind: '$director' },
            { $project: { name: '$director.name', count: 1 } },
            { $sort: { count: -1 } }, { $limit: 10 },
          ])
        : Promise.resolve([]),
      // G.2 P2-004: priority breakdown (Hot/Warm/Cold counts)
      Lead.aggregate([{ $match: filter }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      // G.2 P2-004: overdue follow-up count
      Lead.countDocuments({ ...filter, status: 'Follow Up', followUpDate: { $ne: null, $lt: now } }),
      // G.2 P2-004 / I2-001: today follow-up count — IST calendar day
      Lead.countDocuments({
        ...filter, status: 'Follow Up',
        followUpDate: (() => {
          const { start, end } = getISTDayBounds(now);
          return { $gte: start, $lt: end };
        })(),
      }),
    ]);
    const unassigned = await Lead.countDocuments({ ...filter, assignedDirector: null });
    const priorityBreakdown = Object.fromEntries(priorityStats.map((p) => [p._id, p.count]));
    res.json({
      totalLeads, unassigned, statusStats, sourceStats, directorStats, recentLeads,
      // G.2 additions
      priorityBreakdown: {
        hot:  priorityBreakdown['Hot']  || 0,
        warm: priorityBreakdown['Warm'] || 0,
        cold: priorityBreakdown['Cold'] || 0,
      },
      followUpKpis: { overdueCount, todayCount },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getLeads, createLead, getLead, updateLead, deleteLead, bulkAssign, importCSV, getDashboardStats };
