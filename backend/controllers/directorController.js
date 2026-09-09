const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');

// ── Helper: cast string → ObjectId for aggregate pipelines ───
const toObjectId = (id) => {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  try { return new mongoose.Types.ObjectId(String(id)); }
  catch { return null; }
};

// ─────────────────────────────────────────────────────────────
// GET /api/director/dashboard
//
// Behaviour:
//   - Director: always sees own leads only
//   - Admin + ?directorId=X: sees that director's leads
//   - Admin + no directorId: sees ALL leads across all directors
// ─────────────────────────────────────────────────────────────
const getDirectorDashboard = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const isTL    = req.user.role === 'tl';

    // Determine the scope filter
    let baseFilter    = {};   // for find/countDocuments
    let baseFilterAgg = {};   // for aggregate (needs ObjectId)

    if (isTL) {
      // TL → scope to leads assigned to their managed telecallers only
      const managedTCs = await User.find({ role: 'telecaller', managedBy: req.user._id }, '_id').lean();
      const tcIds      = managedTCs.map((tc) => tc._id);
      baseFilter    = { assignedTelecaller: { $in: tcIds } };
      baseFilterAgg = { assignedTelecaller: { $in: tcIds } };
    } else if (!isAdmin) {
      // Director → own leads only
      baseFilter    = { assignedDirector: req.user._id };
      baseFilterAgg = { assignedDirector: req.user._id };
    } else if (req.query.directorId) {
      // Admin filtered to one specific director
      const oid = toObjectId(req.query.directorId);
      baseFilter    = { assignedDirector: req.query.directorId };
      baseFilterAgg = { assignedDirector: oid };
    } else {
      // Admin, no filter → ALL leads (show combined data for all directors)
      baseFilter    = {};
      baseFilterAgg = {};
    }

    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);
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

      Lead.countDocuments(baseFilter),
      Lead.countDocuments({ ...baseFilter, createdAt: { $gte: todayStart } }),
      Lead.countDocuments({ ...baseFilter, createdAt: { $gte: weekStart  } }),
      Lead.countDocuments({ ...baseFilter, createdAt: { $gte: monthStart } }),

      Lead.aggregate([
        { $match: baseFilterAgg },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
      ]),

      Lead.aggregate([
        { $match: baseFilterAgg },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
      ]),

      Lead.aggregate([
        { $match: { ...baseFilterAgg, assignedTelecaller: { $ne: null } } },
        {
          $group: {
            _id:      '$assignedTelecaller',
            count:    { $sum: 1 },
            statuses: { $push: '$status' },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'tc' } },
        { $unwind: '$tc' },
        {
          $project: {
            name:     '$tc.name',
            email:    '$tc.email',
            count:    1,
            statuses: 1,
          },
        },
        { $sort: { count: -1 } },
      ]),

      Lead.find(baseFilter)
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('assignedTelecaller', 'name'),

      Lead.find({ ...baseFilter, status: 'Follow Up' })
        .sort({ updatedAt: 1 })
        .limit(10)
        .populate('assignedTelecaller', 'name'),

      Lead.aggregate([
        { $match: { ...baseFilterAgg, createdAt: { $gte: weekStart } } },
        {
          $group: {
            _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const statusMap        = Object.fromEntries(statusBreakdown.map((s) => [s._id, s.count]));
    const interested       = statusMap['Interested']           || 0;
    const negotiation      = statusMap['Negotiation']          || 0;
    const booked           = statusMap['Booked']               || 0;
    const siteVisitPlanned = statusMap['Site Visit Planned']   || 0;
    const siteVisitDone    = statusMap['Site Visit Done']      || 0;
    const notInterested    = statusMap['Not Interested']       || 0;
    const wrongNumber      = statusMap['Wrong Number']         || 0;
    const unassignedTC     = await Lead.countDocuments({ ...baseFilter, assignedTelecaller: null });
    const conversionRate   = totalLeads > 0
      ? ((booked / totalLeads) * 100).toFixed(1) : '0.0';
    const qualifiedRate    = totalLeads > 0
      ? (((interested + negotiation + booked) / totalLeads) * 100).toFixed(1) : '0.0';

    const enrichedTelecallers = telecallerBreakdown.map((tc) => {
      const sm = tc.statuses.reduce((acc, s) => {
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {});
      return {
        _id:           tc._id,
        name:          tc.name,
        email:         tc.email,
        total:         tc.count,
        totalLeads:    tc.count,
        called:        sm['Called']            || 0,
        followUp:      sm['Follow Up']         || 0,
        interested:    sm['Interested']        || 0,
        booked:        sm['Booked']            || 0,
        notInterested: sm['Not Interested']    || 0,
        conversionRate: tc.count > 0
          ? (((sm['Booked'] || 0) / tc.count) * 100).toFixed(1)
          : '0.0',
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
// ─────────────────────────────────────────────────────────────
const getMyTelecallers = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const isTL    = req.user.role === 'tl';
    let matchFilter = {};

    if (isTL) {
      // TL → scope to leads assigned to their managed telecallers only
      const managedTCs = await User.find({ role: 'telecaller', managedBy: req.user._id }, '_id').lean();
      const tcIds      = managedTCs.map((tc) => tc._id);
      matchFilter = { assignedTelecaller: { $in: tcIds } };
    } else if (!isAdmin) {
      matchFilter = { assignedDirector: req.user._id };
    } else if (req.query.directorId) {
      const oid = toObjectId(req.query.directorId);
      matchFilter = { assignedDirector: oid };
    } else {
      matchFilter = {}; // All directors
    }

    const tcAgg = await Lead.aggregate([
      { $match: { ...matchFilter, assignedTelecaller: { $ne: null } } },
      {
        $group: {
          _id:          '$assignedTelecaller',
          totalLeads:   { $sum: 1 },
          statuses:     { $push: '$status' },
          lastActivity: { $max: '$updatedAt' },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      {
        $project: {
          name:         '$user.name',
          email:        '$user.email',
          isActive:     '$user.isActive',
          totalLeads:   1,
          statuses:     1,
          lastActivity: 1,
        },
      },
      { $sort: { totalLeads: -1 } },
    ]);

    const result = tcAgg.map((tc) => {
      const sm = tc.statuses.reduce((acc, s) => {
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {});
      return {
        _id:           tc._id,
        name:          tc.name,
        email:         tc.email,
        isActive:      tc.isActive,
        totalLeads:    tc.totalLeads,
        lastActivity:  tc.lastActivity,
        called:        sm['Called']              || 0,
        followUp:      sm['Follow Up']           || 0,
        siteVisit:     (sm['Site Visit Planned'] || 0) + (sm['Site Visit Done'] || 0),
        interested:    sm['Interested']          || 0,
        booked:        sm['Booked']              || 0,
        notInterested: sm['Not Interested']      || 0,
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