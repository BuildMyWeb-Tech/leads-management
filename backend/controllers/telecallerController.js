const Lead = require('../models/Lead');

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

      // Follow-ups overdue (followUpDate in past OR null with status Follow Up)
      Lead.find({
        ...base,
        status: 'Follow Up',
        $or: [
          { followUpDate: { $lt: todayStart } },
          { followUpDate: null },
        ],
      }).sort({ updatedAt: 1 }).limit(10),

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

    const { status, notes, followUpDate } = req.body;

    // Track previous status for history
    const prevStatus = lead.status;

    if (status !== undefined) {
      if (!ALLOWED.includes(status)) {
        return res.status(403).json({ message: `Status "${status}" is not allowed for telecallers` });
      }
      lead.status = status;
    }
    if (notes      !== undefined) lead.notes      = notes;
    if (followUpDate !== undefined) lead.followUpDate = followUpDate || null;

    // Append to call history whenever status or notes change
    if (status !== undefined || notes !== undefined) {
      if (!lead.callHistory) lead.callHistory = [];
      lead.callHistory.push({
        status:    lead.status,
        notes:     notes || lead.notes || '',
        updatedBy: req.user._id,
        updatedAt: new Date(),
      });
    }

    await lead.save();

    const updated = await Lead.findById(lead._id)
      .populate('assignedDirector',   'name email')
      .populate('assignedTelecaller', 'name email')
      .populate({ path: 'callHistory.updatedBy', select: 'name', strictPopulate: false });

    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = { getTelecallerDashboard, updateMyLead };