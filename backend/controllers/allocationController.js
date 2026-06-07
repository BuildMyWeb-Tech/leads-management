const AllocationConfig = require('../models/AllocationConfig');
const Lead = require('../models/Lead');
const User = require('../models/User');
const { pickNextDirector, previewSequence } = require('../utils/allocationEngine');

// ─────────────────────────────────────────────────────────────
// GET /api/allocation/config
// Returns current config (with populated director names)
// Admin only
// ─────────────────────────────────────────────────────────────
const getConfig = async (req, res) => {
  try {
    let config = await AllocationConfig.findOne()
      .populate('ratios.director', 'name email isActive');

    if (!config) {
      // Bootstrap: create empty config on first call
      config = await AllocationConfig.create({ ratios: [], cursor: 0, isActive: false });
    }

    res.json(config);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/allocation/config
// Save ratios + isActive flag. Resets cursor to 0.
// Admin only
// ─────────────────────────────────────────────────────────────
const saveConfig = async (req, res) => {
  try {
    const { ratios, isActive } = req.body;

    if (!Array.isArray(ratios)) {
      return res.status(400).json({ message: 'ratios must be an array' });
    }

    // Validate each entry
    for (const r of ratios) {
      if (!r.director) return res.status(400).json({ message: 'Each ratio must have a director id' });
      if (!r.weight || r.weight < 1 || r.weight > 100) {
        return res.status(400).json({ message: 'Each weight must be between 1 and 100' });
      }
    }

    // Check for duplicate directors
    const dirIds = ratios.map((r) => String(r.director));
    if (new Set(dirIds).size !== dirIds.length) {
      return res.status(400).json({ message: 'Duplicate directors in ratios — each director can appear only once' });
    }

    const totalWeight = ratios.reduce((sum, r) => sum + Number(r.weight), 0);

    let config = await AllocationConfig.findOne();
    if (config) {
      config.ratios     = ratios.map((r) => ({ director: r.director, weight: Number(r.weight) }));
      config.isActive   = isActive !== undefined ? isActive : config.isActive;
      config.cursor     = 0; // reset sequence on config change
      config.totalWeight = totalWeight;
      await config.save();
    } else {
      config = await AllocationConfig.create({
        ratios: ratios.map((r) => ({ director: r.director, weight: Number(r.weight) })),
        isActive: isActive !== undefined ? isActive : true,
        cursor: 0,
        totalWeight,
      });
    }

    const populated = await AllocationConfig.findById(config._id)
      .populate('ratios.director', 'name email isActive');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/allocation/preview
// Returns the sequence preview for given ratios (no DB change)
// Admin only
// ─────────────────────────────────────────────────────────────
const previewConfig = async (req, res) => {
  try {
    const { ratios } = req.body;
    if (!Array.isArray(ratios) || ratios.length === 0) {
      return res.status(400).json({ message: 'ratios array required' });
    }

    // Fetch director names
    const dirIds = ratios.map((r) => r.director);
    const directors = await User.find({ _id: { $in: dirIds } }).select('name');
    const nameMap = Object.fromEntries(directors.map((d) => [String(d._id), d.name]));

    const seq = previewSequence(ratios.map((r) => ({ ...r, weight: Number(r.weight) })));
    const labeled = seq.map((id) => nameMap[String(id)] || id);
    const totalWeight = ratios.reduce((sum, r) => sum + Number(r.weight), 0);

    // Build summary: { director: name, from: 1, to: 9, count: 9 }
    const summary = [];
    let pos = 1;
    for (const r of ratios) {
      summary.push({
        director: nameMap[String(r.director)] || r.director,
        weight: Number(r.weight),
        from: pos,
        to: pos + Number(r.weight) - 1,
        pct: Math.round((Number(r.weight) / totalWeight) * 100),
      });
      pos += Number(r.weight);
    }

    res.json({ sequence: labeled, summary, totalWeight });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/allocation/run
// Assign N unallocated leads using the engine. Returns summary.
// Admin only
// ─────────────────────────────────────────────────────────────
const runAllocation = async (req, res) => {
  try {
    const { count } = req.body; // how many leads to allocate (default: all New)
    const config = await AllocationConfig.findOne({ isActive: true });
    if (!config || !config.ratios.length) {
      return res.status(400).json({ message: 'No active allocation config found. Configure ratios first.' });
    }

    // Fetch unallocated leads (status New, no assignedDirector)
    const query = { status: 'New', assignedDirector: null };
    const limit = count ? Number(count) : 1000;
    const unallocated = await Lead.find(query).limit(limit).lean();

    if (!unallocated.length) {
      return res.json({ message: 'No unallocated leads found.', allocated: 0, results: [] });
    }

    const results = [];
    for (const lead of unallocated) {
      const pick = await pickNextDirector();
      if (!pick) break;

      await Lead.findByIdAndUpdate(lead._id, {
        assignedDirector: pick.directorId,
        status: 'Allocated',
      });

      results.push({ leadId: lead._id, leadName: lead.name, directorId: pick.directorId });
    }

    // Build a human-readable summary per director
    const dirCount = results.reduce((acc, r) => {
      const k = String(r.directorId);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const dirIds = Object.keys(dirCount);
    const directors = await User.find({ _id: { $in: dirIds } }).select('name');
    const nameMap = Object.fromEntries(directors.map((d) => [String(d._id), d.name]));

    const summary = dirIds.map((id) => ({
      director: nameMap[id] || id,
      count: dirCount[id],
    }));

    res.json({
      message: `${results.length} lead(s) allocated successfully`,
      allocated: results.length,
      summary,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/allocation/stats
// Allocation stats for admin dashboard widget
// Admin only
// ─────────────────────────────────────────────────────────────
const getAllocationStats = async (req, res) => {
  try {
    const config = await AllocationConfig.findOne()
      .populate('ratios.director', 'name');

    const unallocated = await Lead.countDocuments({ status: 'New', assignedDirector: null });
    const allocated   = await Lead.countDocuments({ assignedDirector: { $ne: null } });

    // Per-director counts
    const directorBreakdown = await Lead.aggregate([
      { $match: { assignedDirector: { $ne: null } } },
      { $group: { _id: '$assignedDirector', count: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'dir' } },
      { $unwind: '$dir' },
      { $project: { name: '$dir.name', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    res.json({
      config: config || null,
      unallocated,
      allocated,
      directorBreakdown,
      cursorPosition: config ? config.cursor % Math.max(config.totalWeight, 1) : 0,
      totalWeight: config?.totalWeight || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/allocation/reset-cursor
// Reset the sequence cursor to 0 (start fresh cycle). Admin only.
// ─────────────────────────────────────────────────────────────
const resetCursor = async (req, res) => {
  try {
    await AllocationConfig.updateOne({}, { $set: { cursor: 0 } });
    res.json({ message: 'Allocation cursor reset to 0' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getConfig, saveConfig, previewConfig, runAllocation, getAllocationStats, resetCursor };
