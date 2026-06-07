const Lead = require('../models/Lead');

// ─────────────────────────────────────────────────────────────
// GET /api/telecaller/dashboard
// KPI summary for the logged-in telecaller
// ─────────────────────────────────────────────────────────────
const getTelecallerDashboard = async (req, res) => {
  try {
    const tcId = req.user._id;
    const base = { assignedTelecaller: tcId };

    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const weekStart  = new Date(todayStart); weekStart.setDate(todayStart.getDate() - 6);

    const [
      totalLeads,
      todayFollowUps,
      overdueFollowUps,
      statusBreakdown,
      recentActivity,
      upcomingFollowUps,
    ] = await Promise.all([

      Lead.countDocuments(base),

      // Follow-ups due today
      Lead.countDocuments({
        ...base,
        followUpDate: { $gte: todayStart, $lt: todayEnd },
      }),

      // Overdue follow-ups (date in the past, status still Follow Up)
      Lead.countDocuments({
        ...base,
        status: 'Follow Up',
        followUpDate: { $lt: todayStart, $ne: null },
      }),

      // Status breakdown
      Lead.aggregate([
        { $match: base },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Recently updated leads (last 5)
      Lead.find(base)
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate('assignedDirector', 'name'),

      // Upcoming follow-ups (next 7 days, sorted by date)
      Lead.find({
        ...base,
        followUpDate: { $gte: todayStart },
      })
        .sort({ followUpDate: 1 })
        .limit(15)
        .populate('assignedDirector', 'name'),
    ]);

    const sm           = Object.fromEntries(statusBreakdown.map((s) => [s._id, s.count]));
    const booked       = sm['Booked']       || 0;
    const interested   = sm['Interested']   || 0;
    const called       = sm['Called']       || 0;
    const followUp     = sm['Follow Up']    || 0;
    const convRate     = totalLeads > 0 ? ((booked / totalLeads) * 100).toFixed(1) : '0.0';

    res.json({
      kpis: { totalLeads, todayFollowUps, overdueFollowUps, booked, interested, called, followUp, convRate },
      statusBreakdown,
      recentActivity,
      upcomingFollowUps,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getTelecallerDashboard };
