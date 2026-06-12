const AllocationConfig = require('../models/AllocationConfig');
const audit = require('../utils/auditService');
const Lead = require('../models/Lead');
const User = require('../models/User');
const { pickNextDirector, previewSequence, getEnabledDirectors } = require('../utils/allocationEngine');

// ─────────────────────────────────────────────────────────────
// Lazy migration: old configs had `ratios: [{ director, weight }]`.
// New configs use `directors: [{ director, enabled, sequenceOrder }]`.
// If a config has the old shape (ratios present, directors empty),
// convert it once on read — preserving director ORDER from ratios.
// currentPointer starts at 0 (old `cursor` semantics don't map
// cleanly to round robin, so we start the new sequence fresh).
// ─────────────────────────────────────────────────────────────
const migrateIfNeeded = async (config) => {
  const hasOldRatios   = Array.isArray(config.ratios) && config.ratios.length > 0;
  const hasNewDirectors = Array.isArray(config.directors) && config.directors.length > 0;

  if (hasOldRatios && !hasNewDirectors) {
    config.directors = config.ratios.map((r, i) => ({
      director:      r.director,
      enabled:       true,
      sequenceOrder: i,
    }));
    config.allocationMode = 'round_robin';
    config.currentPointer = 0;
    config.ratios = undefined; // drop old field
    await config.save();
  }
  return config;
};

// ─────────────────────────────────────────────────────────────
// GET /api/allocation/config
// Returns current config (with populated director names).
// Auto-migrates legacy ratios[] configs to directors[] on read.
// Admin only
// ─────────────────────────────────────────────────────────────
const getConfig = async (req, res) => {
  try {
    let config = await AllocationConfig.findOne();

    if (!config) {
      config = await AllocationConfig.create({
        directors: [],
        currentPointer: 0,
        isActive: false,
        allocationMode: 'round_robin',
      });
    } else {
      config = await migrateIfNeeded(config);
    }

    const populated = await AllocationConfig.findById(config._id)
      .populate('directors.director', 'name email isActive');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/allocation/config
// Save the director sequence (order + enabled) and isActive flag.
// Does NOT reset currentPointer (Option A — seamless continuation).
// Admin only
// ─────────────────────────────────────────────────────────────
const saveConfig = async (req, res) => {
  try {
    const { directors, isActive } = req.body;

    if (!Array.isArray(directors)) {
      return res.status(400).json({ message: 'directors must be an array' });
    }
    if (directors.length === 0) {
      return res.status(400).json({ message: 'Add at least one director' });
    }

    // Validate each entry
    for (const d of directors) {
      if (!d.director) {
        return res.status(400).json({ message: 'Each entry must have a director id' });
      }
      if (typeof d.sequenceOrder !== 'number' || d.sequenceOrder < 0) {
        return res.status(400).json({ message: 'Each entry must have a valid sequenceOrder' });
      }
    }

    // Check for duplicate directors
    const dirIds = directors.map((d) => String(d.director));
    if (new Set(dirIds).size !== dirIds.length) {
      return res.status(400).json({ message: 'Duplicate directors — each director can appear only once' });
    }

    // Require at least one ENABLED director when isActive is true
    const enabledCount = directors.filter((d) => d.enabled !== false).length;
    if ((isActive !== false) && enabledCount === 0) {
      return res.status(400).json({ message: 'At least one director must be enabled' });
    }

    let config = await AllocationConfig.findOne();
    const cleaned = directors.map((d) => ({
      director:      d.director,
      enabled:       d.enabled !== false,
      sequenceOrder: Number(d.sequenceOrder),
    }));

    if (config) {
      config.directors      = cleaned;
      config.allocationMode = 'round_robin';
      config.isActive       = isActive !== undefined ? isActive : config.isActive;
      // currentPointer is intentionally NOT modified — Option A
      await config.save();
    } else {
      config = await AllocationConfig.create({
        directors:      cleaned,
        allocationMode: 'round_robin',
        isActive:       isActive !== undefined ? isActive : true,
        currentPointer: 0,
      });
    }

    const populated = await AllocationConfig.findById(config._id)
      .populate('directors.director', 'name email isActive');

    res.json(populated);
    audit.allocationConfigChanged(req, cleaned);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/allocation/preview
// Returns the upcoming Lead N → Director sequence for given
// directors[] (no DB change). Starts from the CURRENT
// currentPointer so the preview matches what will actually happen.
// Admin only
// ─────────────────────────────────────────────────────────────
const previewConfig = async (req, res) => {
  try {
    const { directors, count } = req.body;
    if (!Array.isArray(directors) || directors.length === 0) {
      return res.status(400).json({ message: 'directors array required' });
    }

    const enabled = directors.filter((d) => d.enabled !== false);
    if (enabled.length === 0) {
      return res.status(400).json({ message: 'At least one director must be enabled to preview' });
    }

    // Fetch director names
    const dirIds = directors.map((d) => d.director);
    const users  = await User.find({ _id: { $in: dirIds } }).select('name');
    const nameMap = Object.fromEntries(users.map((u) => [String(u._id), u.name]));

    // Use the CURRENT pointer so the preview shows what happens next
    const existing = await AllocationConfig.findOne();
    const startPointer = existing ? existing.currentPointer : 0;

    const cleaned = directors.map((d) => ({
      director:      d.director,
      enabled:       d.enabled !== false,
      sequenceOrder: Number(d.sequenceOrder),
    }));

    const previewCount = count ? Math.min(Number(count), 50) : 8;
    const seq = previewSequence(cleaned, startPointer, previewCount);

    const sequence = seq.map((item) => ({
      leadNumber: item.leadNumber,
      director:   nameMap[String(item.director)] || String(item.director),
      directorId: String(item.director),
    }));

    res.json({
      sequence,
      enabledCount:  enabled.length,
      startPointer,
    });
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
    const { count } = req.body;
    const config = await AllocationConfig.findOne({ isActive: true });
    if (!config || !config.directors.length) {
      return res.status(400).json({ message: 'No active allocation config found. Configure director sequence first.' });
    }
    if (getEnabledDirectors(config).length === 0) {
      return res.status(400).json({ message: 'All directors are disabled. Enable at least one to run allocation.' });
    }

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
    audit.allocationRun(req, results.length, summary);
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
    let config = await AllocationConfig.findOne()
      .populate('directors.director', 'name');

    if (config) config = await migrateIfNeeded(config);

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

    const enabledCount = config ? getEnabledDirectors(config).length : 0;

    res.json({
      config: config || null,
      unallocated,
      allocated,
      directorBreakdown,
      currentPointer: config?.currentPointer || 0,
      enabledCount,
      pointerPosition: enabledCount > 0 ? (config.currentPointer % enabledCount) : 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/allocation/reset-cursor
// Reset currentPointer to 0 (start the rotation fresh from the
// first enabled director in sequenceOrder). Admin only.
// ─────────────────────────────────────────────────────────────
const resetCursor = async (req, res) => {
  try {
    await AllocationConfig.updateOne({}, { $set: { currentPointer: 0 } });
    res.json({ message: 'Allocation pointer reset to position 1' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getConfig, saveConfig, previewConfig, runAllocation, getAllocationStats, resetCursor };