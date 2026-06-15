const Lead         = require('../models/Lead');
const XLSX         = require('xlsx');
const { pickNextDirector } = require('../utils/allocationEngine');
const syncToSheets = require('../utils/syncToSheets');
const { regenerateDirectorView } = require('../utils/syncToSheets');
const { notify }   = require('../utils/pushService');
const audit        = require('../utils/auditService');   // PHASE 10

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
const getLeads = async (req, res) => {
  try {
    const { status, source, assignedDirector, assignedTelecaller, search, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (req.user.role === 'director')   filter.assignedDirector   = req.user._id;
    if (req.user.role === 'telecaller') filter.assignedTelecaller = req.user._id;
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (assignedDirector  && req.user.role === 'admin') filter.assignedDirector  = assignedDirector;
    if (assignedTelecaller && req.user.role !== 'telecaller') filter.assignedTelecaller = assignedTelecaller;
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
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
// syncToSheets 'create'). Director_View is NOT regenerated here —
// per client requirement, individual manual lead creation must not
// trigger a Director_View rebuild.
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
  } catch (err) { res.status(400).json({ message: err.message }); }
};

// ── GET /api/leads/:id ────────────────────────────────────────
const getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
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
    const prevTelecaller = lead.assignedTelecaller?.toString();

    if (req.user.role === 'telecaller') {
      if (req.body.status !== undefined) {
        if (!TELECALLER_ALLOWED_STATUSES.includes(req.body.status)) {
          return res.status(403).json({ message: `Status "${req.body.status}" not allowed for telecallers` });
        }
        lead.status = req.body.status;
      }
      if (req.body.notes        !== undefined) lead.notes        = req.body.notes;
      if (req.body.followUpDate !== undefined) lead.followUpDate = req.body.followUpDate || null;
      if (req.body.status !== undefined || req.body.notes !== undefined) {
        if (!lead.callHistory) lead.callHistory = [];
        lead.callHistory.push({ status: lead.status, notes: req.body.notes || lead.notes || '', updatedBy: req.user._id, updatedAt: new Date() });
      }
      await lead.save();
    } else if (req.user.role === 'director') {
      ['status','notes','assignedTelecaller','followUpDate'].forEach((f) => {
        if (req.body[f] !== undefined) lead[f] = req.body[f];
      });
      await lead.save();
    } else {
      const { callHistory, ...rest } = req.body;
      Object.assign(lead, rest);
      await lead.save();
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
      audit.leadUpdated(req, updated, { notes: req.body.notes, followUpDate: req.body.followUpDate });
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
      const raw = {
        name:   String(r[mapping.name]).trim(),
        phone:  String(r[mapping.phone]).trim(),
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
    const filter = {};
    if (req.user.role === 'director')   filter.assignedDirector   = req.user._id;
    if (req.user.role === 'telecaller') filter.assignedTelecaller = req.user._id;
    const [totalLeads, statusStats, sourceStats, recentLeads, directorStats] = await Promise.all([
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
    ]);
    const unassigned = await Lead.countDocuments({ ...filter, assignedDirector: null });
    res.json({ totalLeads, unassigned, statusStats, sourceStats, directorStats, recentLeads });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getLeads, createLead, getLead, updateLead, deleteLead, bulkAssign, importCSV, getDashboardStats };