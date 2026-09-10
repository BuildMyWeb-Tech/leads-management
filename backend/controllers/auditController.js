const AuditLog = require('../models/AuditLog');
const User     = require('../models/User');
const { getISTDayBounds } = require('../utils/dateHelper'); // I2-001

// ─────────────────────────────────────────────────────────────
// GET /api/audit/logs
// Paginated log viewer with rich filter support.
// Admin only.
// Query params:
//   action, actorId, targetId, targetPhone, search
//   dateFrom, dateTo, page, limit
// ─────────────────────────────────────────────────────────────
const getLogs = async (req, res) => {
  try {
    const {
      action,
      actorId,
      targetId,
      targetPhone,
      search,
      dateFrom,
      dateTo,
      page  = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    if (action)      filter.action         = action;
    if (actorId)     filter['actor._id']   = actorId;
    if (targetId)    filter['target._id']  = targetId;
    if (targetPhone) filter['target.phone'] = { $regex: targetPhone, $options: 'i' };

    // Full-text search across description, actor name, target name
    if (search) {
      filter.$or = [
        { description:      { $regex: search, $options: 'i' } },
        { 'actor.name':     { $regex: search, $options: 'i' } },
        { 'target.name':    { $regex: search, $options: 'i' } },
        { 'target.phone':   { $regex: search, $options: 'i' } },
      ];
    }

    // Date range
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const pageNum = Number(page);
    const limitNum = Math.min(Number(limit), 100); // cap at 100 per page

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    res.json({
      logs,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/audit/logs/:leadId
// All audit events for a specific lead (newest first).
// Admin + Director access.
// ─────────────────────────────────────────────────────────────
const getLeadHistory = async (req, res) => {
  try {
    const logs = await AuditLog.find({ 'target._id': req.params.leadId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/audit/user-activity/:userId
// Activity summary for a specific user.
// Admin only.
// ─────────────────────────────────────────────────────────────
const getUserActivity = async (req, res) => {
  try {
    const { userId }   = req.params;
    const { dateFrom, dateTo } = req.query;

    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo)   dateFilter.$lte = new Date(dateTo);

    const baseFilter = {
      'actor._id': userId,
      ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
    };

    const [actionBreakdown, recentActivity, totalActions] = await Promise.all([
      // Action type counts
      AuditLog.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
      ]),

      // Last 20 actions
      AuditLog.find(baseFilter)
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),

      // Total
      AuditLog.countDocuments(baseFilter),
    ]);

    const user = await User.findById(userId).select('name email role').lean();

    res.json({ user, totalActions, actionBreakdown, recentActivity });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/audit/stats
// System-wide audit statistics for admin dashboard.
// ─────────────────────────────────────────────────────────────
const getAuditStats = async (req, res) => {
  try {
    const now        = new Date();
    // I2-001: use IST calendar day boundaries on UTC servers
    const { start: todayStart, end: todayEnd } = getISTDayBounds(now);
    const weekStart  = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);

    const [
      total,
      todayCount,
      weekCount,
      actionBreakdown,
      topActors,
      recentLogs,
      hourlyToday,
    ] = await Promise.all([
      AuditLog.countDocuments(),

      AuditLog.countDocuments({ createdAt: { $gte: todayStart } }),

      AuditLog.countDocuments({ createdAt: { $gte: weekStart } }),

      // Action type distribution (all time)
      AuditLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
        { $limit: 10 },
      ]),

      // Most active users (this month)
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: monthStart }, 'actor.role': { $ne: 'system' } } },
        { $group: { _id: { id: '$actor._id', name: '$actor.name', role: '$actor.role' }, count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, userId: '$_id.id', name: '$_id.name', role: '$_id.role', count: 1 } },
      ]),

      // Last 10 events
      AuditLog.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      // Hourly activity today (for sparkline)
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: todayStart } } },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      total, todayCount, weekCount,
      actionBreakdown, topActors, recentLogs, hourlyToday,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/audit/export
// Export audit logs as CSV (admin only). Max 5000 rows.
// ─────────────────────────────────────────────────────────────
const exportLogs = async (req, res) => {
  try {
    const { dateFrom, dateTo, action, actorId } = req.query;
    const filter = {};
    if (action)  filter.action       = action;
    if (actorId) filter['actor._id'] = actorId;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    }

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    // Build CSV
    const rows = [
      ['Date', 'Time', 'Actor', 'Role', 'Action', 'Target', 'Phone', 'Description'],
      ...logs.map((l) => [
        new Date(l.createdAt).toLocaleDateString('en-IN'),
        new Date(l.createdAt).toLocaleTimeString('en-IN'),
        l.actor?.name  || 'System',
        l.actor?.role  || '',
        l.action,
        l.target?.name || '',
        l.target?.phone || '',
        `"${(l.description || '').replace(/"/g, '""')}"`,
      ]),
    ];

    const csv = rows.map((r) => r.join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/audit/purge
// Admin: manually purge logs older than N days.
// Body: { olderThanDays: 180 }
// ─────────────────────────────────────────────────────────────
const purgeLogs = async (req, res) => {
  try {
    // I2-004: enforce a minimum retention floor of 30 days.
    // Parse carefully: NaN / Infinity / negatives all clamp to 30.
    const raw  = req.body.olderThanDays;
    const parsed = Number(raw);
    const days = (Number.isFinite(parsed) && parsed > 0)
      ? Math.max(30, Math.floor(parsed))
      : 365; // default when omitted or invalid

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
    res.json({
      message: `${result.deletedCount} audit log(s) purged (older than ${days} days)`,
      deletedCount: result.deletedCount,
      daysApplied: days,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getLogs, getLeadHistory, getUserActivity, getAuditStats, exportLogs, purgeLogs };
