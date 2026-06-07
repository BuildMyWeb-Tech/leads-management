const Lead = require('../models/Lead');
const XLSX = require('xlsx');
const { pickNextDirector } = require('../utils/allocationEngine');

const LEAD_STATUSES = [
  'New','Allocated','Called','Follow Up',
  'Site Visit Planned','Site Visit Done',
  'Interested','Negotiation','Booked',
  'Wrong Number','Not Interested','Closed',
];

const LEAD_SOURCES = [
  'YouTube','Google Ads','Facebook','Instagram',
  'Referral','Walk-in','Website','Other',
];

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
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/leads ───────────────────────────────────────────
const createLead = async (req, res) => {
  try {
    const leadData = { ...req.body };

    if (!leadData.assignedDirector) {
      try {
        const pick = await pickNextDirector();
        if (pick) {
          leadData.assignedDirector = pick.directorId;
          leadData.status = 'Allocated';
        }
      } catch (e) { console.warn('Auto-allocation skipped:', e.message); }
    }

    const lead = await Lead.create(leadData);
    const populated = await Lead.findById(lead._id)
      .populate('assignedDirector',   'name email')
      .populate('assignedTelecaller', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── GET /api/leads/:id ────────────────────────────────────────
const getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedDirector',   'name email')
      .populate('assignedTelecaller', 'name email');
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PUT /api/leads/:id ────────────────────────────────────────
const updateLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    // ── Telecaller: status (restricted) + notes + followUpDate ──
    if (req.user.role === 'telecaller') {
      if (req.body.status !== undefined) {
        if (!TELECALLER_ALLOWED_STATUSES.includes(req.body.status)) {
          return res.status(403).json({ message: `Telecallers cannot set status to "${req.body.status}"` });
        }
        lead.status = req.body.status;
      }
      if (req.body.notes        !== undefined) lead.notes        = req.body.notes;
      // PHASE 5: telecaller can set/clear follow-up date
      if (req.body.followUpDate !== undefined) lead.followUpDate = req.body.followUpDate || null;
      await lead.save();
    }

    // ── Director: status + notes + followUpDate + assignedTelecaller ──
    else if (req.user.role === 'director') {
      ['status','notes','followUpDate','assignedTelecaller'].forEach((f) => {
        if (req.body[f] !== undefined) lead[f] = req.body[f] || null;
      });
      await lead.save();
    }

    // ── Admin: full access ──
    else {
      Object.assign(lead, req.body);
      await lead.save();
    }

    const updated = await Lead.findById(lead._id)
      .populate('assignedDirector',   'name email')
      .populate('assignedTelecaller', 'name email');
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── DELETE /api/leads/:id ─────────────────────────────────────
const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json({ message: 'Lead deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/leads/bulk-assign ───────────────────────────────
const bulkAssign = async (req, res) => {
  try {
    const { leadIds, assignedDirector, assignedTelecaller } = req.body;
    if (!leadIds?.length) return res.status(400).json({ message: 'leadIds array is required' });

    const update = {};
    if (assignedDirector  !== undefined) update.assignedDirector  = assignedDirector  || null;
    if (assignedTelecaller !== undefined) update.assignedTelecaller = assignedTelecaller || null;

    const result = await Lead.updateMany({ _id: { $in: leadIds } }, { $set: update });
    if (assignedDirector) {
      await Lead.updateMany({ _id: { $in: leadIds }, status: 'New' }, { $set: { status: 'Allocated' } });
    }
    res.json({ message: `${result.modifiedCount} lead(s) updated`, modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/leads/import-csv ────────────────────────────────
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

    const leads = rows
      .filter((r) => r[mapping.name] && r[mapping.phone])
      .map((r) => ({
        name:   String(r[mapping.name]).trim(),
        phone:  String(r[mapping.phone]).trim(),
        email:  mapping.email  ? String(r[mapping.email]).trim()  : '',
        source: LEAD_SOURCES.includes(String(r[mapping.source] || '').trim()) ? String(r[mapping.source]).trim() : 'Other',
        status: LEAD_STATUSES.includes(String(r[mapping.status] || '').trim()) ? String(r[mapping.status]).trim() : 'New',
      }));

    if (!leads.length) return res.status(400).json({ message: 'No valid rows found' });

    const leadsToInsert = [];
    for (const leadData of leads) {
      try {
        const pick = await pickNextDirector();
        if (pick) { leadData.assignedDirector = pick.directorId; leadData.status = 'Allocated'; }
      } catch (_) {}
      leadsToInsert.push(leadData);
    }

    const inserted = await Lead.insertMany(leadsToInsert, { ordered: false });
    res.json({ message: `${inserted.length} lead(s) imported`, count: inserted.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/leads/dashboard/stats ───────────────────────────
const getDashboardStats = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'director')   filter.assignedDirector   = req.user._id;
    if (req.user.role === 'telecaller') filter.assignedTelecaller = req.user._id;

    const [totalLeads, statusStats, sourceStats, recentLeads, directorStats] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.aggregate([{ $match: filter },{ $group: { _id: '$status', count: { $sum: 1 } } },{ $sort: { count: -1 } }]),
      Lead.aggregate([{ $match: filter },{ $group: { _id: '$source',  count: { $sum: 1 } } },{ $sort: { count: -1 } }]),
      Lead.find(filter).sort({ createdAt: -1 }).limit(5)
        .populate('assignedDirector','name').populate('assignedTelecaller','name'),
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
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getLeads, createLead, getLead, updateLead,
  deleteLead, bulkAssign, importCSV, getDashboardStats,
};
