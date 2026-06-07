const Lead = require('../models/Lead');
const User = require('../models/User');

// ─────────────────────────────────────────────────────────────
// GET /api/director/dashboard
// Full KPI dashboard for the logged-in director
// Access: director (own data) | admin (pass ?directorId=)
// ─────────────────────────────────────────────────────────────
const getDirectorDashboard = async (req, res) => {
  try {
    // Admin can query any director; director always sees own data
    const directorId =
      req.user.role === 'admin' && req.query.directorId
        ? req.query.directorId
        : req.user._id;

    const baseFilter = { assignedDirector: directorId };

    // Date helpers
    const now       = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(todayStart); weekStart.setDate(todayStart.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalLeads,
      todayLeads,
      weekLeads,
      monthLeads,
      statusBreakdown,
      sourceBreakdown,
      telecallerBreakdown,
      recentLeads,
      followUps,
      weeklyTrend,
    ] = await Promise.all([

      // Total assigned
      Lead.countDocuments(baseFilter),

      // Today's new leads
      Lead.countDocuments({ ...baseFilter, createdAt: { $gte: todayStart } }),

      // This week
      Lead.countDocuments({ ...baseFilter, createdAt: { $gte: weekStart } }),

      // This month
      Lead.countDocuments({ ...baseFilter, createdAt: { $gte: monthStart } }),

      // Status breakdown
      Lead.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Source breakdown
      Lead.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Per-telecaller breakdown
      Lead.aggregate([
        { $match: { ...baseFilter, assignedTelecaller: { $ne: null } } },
        { $group: { _id: '$assignedTelecaller', count: { $sum: 1 }, statuses: { $push: '$status' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'tc' } },
        { $unwind: '$tc' },
        {
          $project: {
            name: '$tc.name',
            email: '$tc.email',
            count: 1,
            statuses: 1,
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Recent 8 leads
      Lead.find(baseFilter)
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('assignedTelecaller', 'name'),

      // Pending follow-ups (status = Follow Up)
      Lead.find({ ...baseFilter, status: 'Follow Up' })
        .sort({ updatedAt: 1 })
        .limit(10)
        .populate('assignedTelecaller', 'name'),

      // Weekly trend — last 7 days, leads per day
      Lead.aggregate([
        { $match: { ...baseFilter, createdAt: { $gte: weekStart } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Derived KPIs
    const statusMap       = Object.fromEntries(statusBreakdown.map((s) => [s._id, s.count]));
    const interested      = statusMap['Interested']           || 0;
    const negotiation     = statusMap['Negotiation']          || 0;
    const booked          = statusMap['Booked']               || 0;
    const siteVisitPlanned= statusMap['Site Visit Planned']   || 0;
    const siteVisitDone   = statusMap['Site Visit Done']      || 0;
    const notInterested   = statusMap['Not Interested']       || 0;
    const wrongNumber     = statusMap['Wrong Number']         || 0;
    const unassignedTC    = await Lead.countDocuments({ ...baseFilter, assignedTelecaller: null });
    const conversionRate  = totalLeads > 0 ? ((booked / totalLeads) * 100).toFixed(1) : '0.0';
    const qualifiedRate   = totalLeads > 0
      ? (((interested + negotiation + booked) / totalLeads) * 100).toFixed(1)
      : '0.0';

    // Enrich telecaller breakdown with per-status counts
    const enrichedTelecallers = telecallerBreakdown.map((tc) => {
      const sm = tc.statuses.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
      return {
        _id: tc._id,
        name: tc.name,
        email: tc.email,
        total: tc.count,
        called:     sm['Called']            || 0,
        followUp:   sm['Follow Up']         || 0,
        interested: sm['Interested']        || 0,
        booked:     sm['Booked']            || 0,
        notInterested: sm['Not Interested'] || 0,
      };
    });

    res.json({
      kpis: {
        totalLeads, todayLeads, weekLeads, monthLeads,
        interested, negotiation, booked,
        siteVisitPlanned, siteVisitDone,
        notInterested, wrongNumber,
        unassignedTC, conversionRate, qualifiedRate,
      },
      statusBreakdown,
      sourceBreakdown,
      telecallerBreakdown: enrichedTelecallers,
      recentLeads,
      followUps,
      weeklyTrend,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/director/telecallers
// Telecallers assigned leads under this director, with activity stats
// ─────────────────────────────────────────────────────────────
const getMyTelecallers = async (req, res) => {
  try {
    const directorId =
      req.user.role === 'admin' && req.query.directorId
        ? req.query.directorId
        : req.user._id;

    // All telecaller IDs that have at least one lead under this director
    const tcAgg = await Lead.aggregate([
      { $match: { assignedDirector: directorId, assignedTelecaller: { $ne: null } } },
      {
        $group: {
          _id: '$assignedTelecaller',
          totalLeads: { $sum: 1 },
          statuses: { $push: '$status' },
          lastActivity: { $max: '$updatedAt' },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      {
        $project: {
          name: '$user.name',
          email: '$user.email',
          isActive: '$user.isActive',
          totalLeads: 1,
          statuses: 1,
          lastActivity: 1,
        },
      },
      { $sort: { totalLeads: -1 } },
    ]);

    const result = tcAgg.map((tc) => {
      const sm = tc.statuses.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
      return {
        _id: tc._id,
        name: tc.name,
        email: tc.email,
        isActive: tc.isActive,
        totalLeads: tc.totalLeads,
        lastActivity: tc.lastActivity,
        called:        sm['Called']            || 0,
        followUp:      sm['Follow Up']         || 0,
        siteVisit:     (sm['Site Visit Planned'] || 0) + (sm['Site Visit Done'] || 0),
        interested:    sm['Interested']        || 0,
        booked:        sm['Booked']            || 0,
        notInterested: sm['Not Interested']    || 0,
        conversionRate: tc.totalLeads > 0
          ? (((sm['Booked'] || 0) / tc.totalLeads) * 100).toFixed(1)
          : '0.0',
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getDirectorDashboard, getMyTelecallers };
