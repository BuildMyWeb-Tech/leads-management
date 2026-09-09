const Lead = require('../models/Lead');
const audit = require('../utils/auditService');                             // PHASE C
const { recordCallHistoryEntry, appendSiteVisit, snapshotTrackedFields } = require('../utils/leadUpdateHelpers'); // PHASE C/E
const { buildOverdueFollowUpQuery } = require('../utils/followUpHelper');    // PHASE E

// ─────────────────────────────────────────────────────────────
// GET /api/telecaller/dashboard
// KPIs + today's follow-ups for the logged-in telecaller
// ─────────────────────────────────────────────────────────────
const getTelecallerDashboard = async (req, res) => {
  try {
    const tcId = req.user._id;
    const base = { assignedTelecaller: tcId };

    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const weekStart  = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6);

    const [
      totalLeads,
      statusBreakdown,
      todayFollowUps,
      overdueFollowUps,
      recentActivity,
      weekLeads,
    ] = await Promise.all([
      Lead.countDocuments(base),

      Lead.aggregate([
        { $match: base },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Follow-ups due today
      Lead.find({
        ...base,
        status: 'Follow Up',
        followUpDate: { $gte: todayStart, $lt: todayEnd },
      }).sort({ followUpDate: 1 }).limit(20),

      // PHASE E FIX: was treating followUpDate:null as overdue,
      // disagreeing with the canonical isFollowUpOverdue() definition
      // used everywhere else (FollowUpBadge, priorityRanking). Now
      // built from the same single source of truth.
      Lead.find(buildOverdueFollowUpQuery(base, now))
        .sort({ updatedAt: 1 }).limit(10),

      // Recently updated leads (my activity)
      Lead.find(base)
        .sort({ updatedAt: -1 })
        .limit(10)
        .populate('assignedDirector', 'name'),

      Lead.countDocuments({ ...base, createdAt: { $gte: weekStart } }),
    ]);

    const sm            = Object.fromEntries(statusBreakdown.map((s) => [s._id, s.count]));
    const called        = sm['Called']            || 0;
    const followUp      = sm['Follow Up']         || 0;
    const interested    = sm['Interested']        || 0;
    const booked        = sm['Booked']            || 0;
    const notInterested = sm['Not Interested']    || 0;
    const siteVisit     = (sm['Site Visit Planned'] || 0) + (sm['Site Visit Done'] || 0);
    const conversionRate = totalLeads > 0 ? ((booked / totalLeads) * 100).toFixed(1) : '0.0';

    res.json({
      kpis: {
        totalLeads, called, followUp, interested,
        booked, notInterested, siteVisit, weekLeads, conversionRate,
      },
      statusBreakdown,
      todayFollowUps,
      overdueFollowUps,
      recentActivity,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/telecaller/leads/:id
// Update status + notes + followUpDate, appends to callHistory
// ─────────────────────────────────────────────────────────────
const updateMyLead = async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      assignedTelecaller: req.user._id,
    });

    if (!lead) return res.status(404).json({ message: 'Lead not found or not assigned to you' });

    const ALLOWED = [
      'Called','Follow Up','Site Visit Planned','Site Visit Done',
      'Interested','Negotiation','Wrong Number','Not Interested',
    ];

    const { status, notes, remarks, followUpDate, siteVisit } = req.body;

    // Track previous status/priority for audit
    const prevStatus   = lead.status;
    const prevPriority = lead.priority;
    let addedSiteVisit = null;
    // PHASE E: snapshot BEFORE mutation for the generic audit event's
    // before/after pair.
    const beforeSnapshot = snapshotTrackedFields(lead, req.body);

    if (status !== undefined) {
      if (!ALLOWED.includes(status)) {
        return res.status(403).json({ message: `Status "${status}" is not allowed for telecallers` });
      }
      lead.status = status;
    }
    if (notes        !== undefined) lead.notes        = notes;
    if (remarks      !== undefined) lead.remarks      = remarks;         // PHASE C
    if (followUpDate !== undefined) lead.followUpDate = followUpDate || null;

    // Append to call history whenever status or notes change — also
    // refreshes lastCallDetails (PHASE C). callHistory itself is only
    // ever appended to, never overwritten.
    if (status !== undefined || notes !== undefined) {
      recordCallHistoryEntry(lead, { status: lead.status, notes: notes || lead.notes || '', updatedBy: req.user._id });
    }

    // PHASE C: append-only site visit entry (planned/completed) —
    // never replaces the array, so reschedules keep history.
    if (siteVisit !== undefined) {
      addedSiteVisit = appendSiteVisit(lead, siteVisit);
    }

    await lead.save();

    const updated = await Lead.findById(lead._id)
      .populate('assignedDirector',   'name email')
      .populate('assignedTelecaller', 'name email')
      .populate({ path: 'callHistory.updatedBy', select: 'name', strictPopulate: false });

    res.json(updated);

    // PHASE C audit side effects (mirrors leadsController.updateLead)
    if (updated.status !== prevStatus) {
      audit.leadStatusChanged(req, updated, prevStatus, updated.status);
    } else if (notes !== undefined || remarks !== undefined || followUpDate !== undefined) {
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
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = { getTelecallerDashboard, updateMyLead };