const Lead = require('../models/Lead');
const XLSX = require('xlsx');

// @route  GET /api/leads
// @access Private - All roles (scoped by role)
const getLeads = async (req, res) => {
  try {
    const { status, source, assignedManager, assignedEmployee, search, page = 1, limit = 50 } = req.query;
    const filter = {};

    // Role-based data scoping
    if (req.user.role === 'manager') {
      filter.assignedManager = req.user._id;
    } else if (req.user.role === 'employee') {
      filter.assignedEmployee = req.user._id;
    }

    // Optional filters (admin only for manager filter)
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (assignedManager && req.user.role === 'admin') filter.assignedManager = assignedManager;
    if (assignedEmployee) filter.assignedEmployee = assignedEmployee;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Lead.countDocuments(filter);
    const leads = await Lead.find(filter)
      .populate('assignedManager', 'name email')
      .populate('assignedEmployee', 'name email')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ leads, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route  POST /api/leads
// @access Private - Admin, Manager
const createLead = async (req, res) => {
  try {
    const lead = await Lead.create(req.body);
    res.status(201).json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route  GET /api/leads/:id
// @access Private
const getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedManager', 'name email')
      .populate('assignedEmployee', 'name email');

    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route  PUT /api/leads/:id
// @access Private - All roles (employees: status + notes only)
const updateLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    // Employee can only update status and notes
    if (req.user.role === 'employee') {
      if (req.body.status !== undefined) lead.status = req.body.status;
      if (req.body.notes !== undefined) lead.notes = req.body.notes;
      await lead.save();
      const updated = await Lead.findById(lead._id)
        .populate('assignedManager', 'name email')
        .populate('assignedEmployee', 'name email');
      return res.json(updated);
    }

    // Admin / Manager can update all fields
    Object.assign(lead, req.body);
    await lead.save();

    const updated = await Lead.findById(lead._id)
      .populate('assignedManager', 'name email')
      .populate('assignedEmployee', 'name email');

    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @route  DELETE /api/leads/:id
// @access Private - Admin only
const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json({ message: 'Lead deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route  POST /api/leads/bulk-assign
// @access Private - Admin, Manager
const bulkAssign = async (req, res) => {
  try {
    const { leadIds, assignedManager, assignedEmployee } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ message: 'leadIds array is required' });
    }

    const update = {};
    if (assignedManager !== undefined) update.assignedManager = assignedManager || null;
    if (assignedEmployee !== undefined) update.assignedEmployee = assignedEmployee || null;

    const result = await Lead.updateMany(
      { _id: { $in: leadIds } },
      { $set: update }
    );

    res.json({
      message: `${result.modifiedCount} lead(s) updated successfully`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route  POST /api/leads/import-csv
// @access Private - Admin only
const importCSV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) return res.status(400).json({ message: 'File is empty or has no data rows' });

    // Auto-map columns by normalizing header names
    const normalize = (key) => key.toLowerCase().replace(/[\s_\-().]/g, '');
    const fieldAliases = {
      name: ['name', 'fullname', 'clientname', 'leadname', 'customername', 'contactname'],
      phone: ['phone', 'mobile', 'contact', 'phonenumber', 'mobilenumber', 'cell', 'telephone'],
      email: ['email', 'emailaddress', 'mail', 'emailid'],
      source: ['source', 'leadsource', 'channel', 'medium'],
      status: ['status', 'leadstatus', 'stage'],
    };

    const headers = Object.keys(rows[0]);
    const mapping = {};
    for (const [field, aliases] of Object.entries(fieldAliases)) {
      const matched = headers.find((h) => aliases.includes(normalize(h)));
      if (matched) mapping[field] = matched;
    }

    if (!mapping.name || !mapping.phone) {
      return res.status(400).json({
        message: 'Could not detect Name or Phone columns. Please check your file headers.',
        detectedHeaders: headers,
        tip: 'Expected headers like: Name, Phone, Email, Source, Status',
      });
    }

    const validStatuses = ['New', 'Contacted', 'Interested', 'Not Interested', 'Closed'];
    const validSources = ['YouTube', 'Google Ads', 'Facebook', 'Instagram', 'Referral', 'Walk-in', 'Website', 'Other'];

    const leads = rows
      .filter((row) => row[mapping.name] && row[mapping.phone])
      .map((row) => {
        const rawStatus = mapping.status ? String(row[mapping.status]).trim() : '';
        const rawSource = mapping.source ? String(row[mapping.source]).trim() : '';
        return {
          name: String(row[mapping.name]).trim(),
          phone: String(row[mapping.phone]).trim(),
          email: mapping.email ? String(row[mapping.email]).trim() : '',
          source: validSources.includes(rawSource) ? rawSource : 'Other',
          status: validStatuses.includes(rawStatus) ? rawStatus : 'New',
        };
      });

    if (!leads.length) {
      return res.status(400).json({ message: 'No valid rows found (Name and Phone are required)' });
    }

    const inserted = await Lead.insertMany(leads, { ordered: false });

    res.json({
      message: `${inserted.length} lead(s) imported successfully`,
      count: inserted.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @route  GET /api/leads/dashboard/stats
// @access Private - All roles
const getDashboardStats = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'manager') filter.assignedManager = req.user._id;
    if (req.user.role === 'employee') filter.assignedEmployee = req.user._id;

    const [totalLeads, statusStats, sourceStats, recentLeads, managerStats] = await Promise.all([
      Lead.countDocuments(filter),

      Lead.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      Lead.aggregate([
        { $match: filter },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      Lead.find(filter)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('assignedManager', 'name')
        .populate('assignedEmployee', 'name'),

      req.user.role === 'admin'
        ? Lead.aggregate([
            { $match: { assignedManager: { $ne: null } } },
            { $group: { _id: '$assignedManager', count: { $sum: 1 } } },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'manager' } },
            { $unwind: '$manager' },
            { $project: { name: '$manager.name', count: 1 } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ])
        : Promise.resolve([]),
    ]);

    const unassigned = await Lead.countDocuments({ ...filter, assignedManager: null });

    res.json({ totalLeads, unassigned, statusStats, sourceStats, managerStats, recentLeads });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getLeads,
  createLead,
  getLead,
  updateLead,
  deleteLead,
  bulkAssign,
  importCSV,
  getDashboardStats,
};
