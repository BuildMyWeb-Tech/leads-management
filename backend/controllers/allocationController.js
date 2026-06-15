const AllocationConfig = require('../models/AllocationConfig');
const audit = require('../utils/auditService');
const Lead = require('../models/Lead');
const User = require('../models/User');
const {
  pickNextDirector,
  previewSequence,
  getEnabledDirectors,
  freshCycleRemaining,
  cycleRemainingIsStale,
} = require('../utils/allocationEngine');
const { regenerateDirectorView } = require('../utils/syncToSheets');

// ─────────────────────────────────────────────────────────────
// Lazy migration:
//   v1 (oldest): { ratios: [{ director, weight }] }
//   v2 (round robin): { directors: [{ director, enabled, sequenceOrder }],
//                        allocationMode: 'round_robin', currentPointer }
//   v3 (current — Adaptive Quota-Based Round Robin):
//       { directors: [{ director, enabled, sequenceOrder, quota }],
//         allocationMode: 'adaptive_quota_round_robin',
//         cycleRemaining, currentPointer }
//
// Migration is additive and idempotent — run on every read.
// Existing leads are NEVER touched by migration; only the config
// document is updated.
// ─────────────────────────────────────────────────────────────
const migrateIfNeeded = async (config) => {
  let changed = false;

  // v1 → v2: old ratios[] → directors[] with enabled/sequenceOrder
  const hasOldRatios    = Array.isArray(config.ratios) && config.ratios.length > 0;
  const hasNewDirectors = Array.isArray(config.directors) && config.directors.length > 0;

  if (hasOldRatios && !hasNewDirectors) {
    config.directors = config.ratios
      .filter((r) => r && r.director) // drop entries with no director ref
      .map((r, i) => ({
        director:      r.director,
        enabled:       true,
        sequenceOrder: i,
        quota:         Math.max(1, Math.round(r.weight || 1)),
      }));
    config.ratios = undefined;
    changed = true;
  }

  // Defensive: drop any director entries with a missing/null director
  // ref (e.g. a user that was deleted, or a malformed legacy entry).
  // Without this, getEnabledDirectors()/freshCycleRemaining() build
  // cycleRemaining entries with director: null, which violates the
  // schema's `required: true` on cycleRemaining.director and makes
  // config.save() throw a ValidationError -> 500 on GET /config.
  if (Array.isArray(config.directors) && config.directors.length > 0) {
    const before = config.directors.length;
    config.directors = config.directors.filter((d) => d && d.director);
    if (config.directors.length !== before) changed = true;
  }

  // v2 → v3: directors[] missing `quota` → default quota = 1 each.
  // (A config saved under the old round_robin mode had no quota
  // concept — every director effectively got "1 per turn", which is
  // exactly quota=1 in the new engine, preserving the same
  // round-robin behaviour until the admin sets real quotas.)
  if (Array.isArray(config.directors) && config.directors.length > 0) {
    let needsQuota = false;
    config.directors.forEach((d) => {
      if (d.quota === undefined || d.quota === null) {
        d.quota = 1;
        needsQuota = true;
      }
    });
    if (needsQuota) changed = true;
  }

  if (config.allocationMode !== 'adaptive_quota_round_robin') {
    config.allocationMode = 'adaptive_quota_round_robin';
    changed = true;
  }

  // Initialise cycleRemaining if absent/stale relative to the
  // (possibly just-migrated) directors[] — starts a fresh cycle.
  // This only runs once on first read after migration; subsequent
  // reads see a structurally-matching cycleRemaining and skip this.
  const enabled = getEnabledDirectors(config);
  if (enabled.length > 0 && cycleRemainingIsStale(config, enabled)) {
    config.cycleRemaining = freshCycleRemaining(enabled);
    config.currentPointer = 0;
    changed = true;
  }

  if (changed) await config.save();
  return config;
};

// ─────────────────────────────────────────────────────────────
// GET /api/allocation/config
// Returns current config (with populated director names).
// Auto-migrates legacy configs to the Adaptive Quota-Based Round
// Robin shape on read.
// Admin only
// ─────────────────────────────────────────────────────────────
const getConfig = async (req, res) => {
  try {
    let config = await AllocationConfig.findOne();

    if (!config) {
      config = await AllocationConfig.create({
        directors: [],
        cycleRemaining: [],
        currentPointer: 0,
        isActive: false,
        allocationMode: 'adaptive_quota_round_robin',
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
// Save the director list (order + enabled + quota) and isActive flag.
//
// cycleRemaining is rebuilt (fresh cycle) whenever the saved
// director list is structurally different from the previous one
// (director added/removed/reordered) OR when any quota value
// changed — both cases mean the previous cycleRemaining no longer
// represents a valid in-progress cycle for this config.
//
// currentPointer is reset to 0 in that case; otherwise left
// untouched (seamless continuation if the admin just re-saved an
// identical config, e.g. toggling isActive).
//
// Triggers a Director_View regeneration after save (per client
// requirement: "after allocation configuration changes").
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
      if (d.quota === undefined || d.quota === null || Number(d.quota) < 0 || !Number.isFinite(Number(d.quota))) {
        return res.status(400).json({ message: 'Each entry must have a valid quota (>= 0)' });
      }
    }

    // Check for duplicate directors
    const dirIds = directors.map((d) => String(d.director));
    if (new Set(dirIds).size !== dirIds.length) {
      return res.status(400).json({ message: 'Duplicate directors — each director can appear only once' });
    }

    // Require at least one ENABLED director with quota > 0 when isActive is true
    const enabledWithQuota = directors.filter((d) => d.enabled !== false && Number(d.quota) > 0).length;
    if ((isActive !== false) && enabledWithQuota === 0) {
      return res.status(400).json({ message: 'At least one enabled director must have a quota greater than 0' });
    }

    let config = await AllocationConfig.findOne();
    const cleaned = directors.map((d) => ({
      director:      d.director,
      enabled:       d.enabled !== false,
      sequenceOrder: Number(d.sequenceOrder),
      quota:         Number(d.quota),
    }));

    // Build the new enabled list (sorted) to compare against the
    // PREVIOUS one for cycleRemaining reset decision.
    const newEnabled = cleaned
      .filter((d) => d.enabled)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    let resetCycle = true; // default: fresh config → fresh cycle
    if (config) {
      const oldEnabled = getEnabledDirectors(config);
      const sameShape =
        oldEnabled.length === newEnabled.length &&
        oldEnabled.every((od, i) =>
          String(od.director) === String(newEnabled[i].director) &&
          Number(od.quota)    === Number(newEnabled[i].quota)
        );
      resetCycle = !sameShape;
    }

    if (config) {
      config.directors      = cleaned;
      config.allocationMode = 'adaptive_quota_round_robin';
      config.isActive       = isActive !== undefined ? isActive : config.isActive;
      if (resetCycle) {
        config.cycleRemaining = freshCycleRemaining(newEnabled);
        config.currentPointer = 0;
      }
      // else: leave cycleRemaining/currentPointer untouched —
      // seamless continuation (Option A semantics preserved)
      await config.save();
    } else {
      config = await AllocationConfig.create({
        directors:      cleaned,
        allocationMode: 'adaptive_quota_round_robin',
        isActive:       isActive !== undefined ? isActive : true,
        cycleRemaining: freshCycleRemaining(newEnabled),
        currentPointer: 0,
      });
    }

    const populated = await AllocationConfig.findById(config._id)
      .populate('directors.director', 'name email isActive');

    res.json(populated);
    audit.allocationConfigChanged(req, cleaned);

    // Client requirement: regenerate Director_View after allocation
    // configuration changes. Non-fatal — failures are logged inside
    // regenerateDirectorView and don't affect the config save response.
    regenerateDirectorView().catch((e) =>
      console.error('[AllocationConfig] Director_View regen failed:', e.message)
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/allocation/preview
// Returns the upcoming Lead N → Director sequence for given
// directors[] (no DB change). Uses the CURRENT persisted
// cycleRemaining/currentPointer as the starting state so the
// preview matches what will actually happen if saved unchanged —
// or, if the proposed directors/quotas differ from the saved
// config, simulates from a freshly-initialised cycle using the
// PROPOSED values (so admins see the effect of edits before saving).
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
    const enabledWithQuota = enabled.filter((d) => Number(d.quota) > 0);
    if (enabledWithQuota.length === 0) {
      return res.status(400).json({ message: 'At least one enabled director must have a quota greater than 0' });
    }

    // Fetch director names
    const dirIds = directors.map((d) => d.director);
    const users  = await User.find({ _id: { $in: dirIds } }).select('name');
    const nameMap = Object.fromEntries(users.map((u) => [String(u._id), u.name]));

    // Use the CURRENT persisted cycle state as the starting point
    const existing = await AllocationConfig.findOne();
    const startState = existing
      ? {
          cycleRemaining: existing.cycleRemaining || [],
          currentPointer: existing.currentPointer || 0,
        }
      : { cycleRemaining: [], currentPointer: 0 };

    const cleaned = directors.map((d) => ({
      director:      d.director,
      enabled:       d.enabled !== false,
      sequenceOrder: Number(d.sequenceOrder),
      quota:         Number(d.quota) || 0,
    }));

    const previewCount = count ? Math.min(Number(count), 50) : 18;
    const seq = previewSequence(cleaned, startState, previewCount);

    const sequence = seq.map((item) => ({
      leadNumber: item.leadNumber,
      director:   nameMap[String(item.director)] || String(item.director),
      directorId: String(item.director),
      cycleReset: item.cycleReset,
      remainingAfter: item.remainingAfter.map((r) => ({
        director:  nameMap[r.director] || r.director,
        directorId: r.director,
        remaining: r.remaining,
      })),
    }));

    res.json({
      sequence,
      enabledCount: enabledWithQuota.length,
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
      return res.status(400).json({ message: 'No active allocation config found. Configure directors and quotas first.' });
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

    // Director_View — regenerate when "Run allocation" assigns
    // directors to previously-unallocated leads, so they appear in
    // the grouped report immediately (same reasoning as createLead:
    // newly-allocated leads should be visible without waiting for a
    // later bulkAssign or manual sync). Skipped if nothing was
    // allocated.
    if (results.length > 0) {
      regenerateDirectorView().catch((e) =>
        console.error('[RunAllocation] Director_View regen failed:', e.message)
      );
    }
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

    // cycleRemaining with director names — useful for the admin UI
    // to show "A=8 B=4 C=4 D=1" style live countdown.
    let cycleRemaining = [];
    if (config && (config.cycleRemaining || []).length > 0) {
      cycleRemaining = config.cycleRemaining.map((c) => {
        const dirEntry = config.directors.find(
          (d) => String(d.director?._id || d.director) === String(c.director)
        );
        return {
          directorId: String(c.director),
          name:       dirEntry?.director?.name || String(c.director),
          remaining:  c.remaining,
          quota:      dirEntry?.quota ?? null,
        };
      });
    }

    res.json({
      config: config || null,
      unallocated,
      allocated,
      directorBreakdown,
      currentPointer: config?.currentPointer || 0,
      enabledCount,
      cycleRemaining,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/allocation/reset-cursor
// Reset currentPointer to 0 AND cycleRemaining to a fresh cycle
// (full quotas) for the currently-enabled directors. Admin only.
// ─────────────────────────────────────────────────────────────
const resetCursor = async (req, res) => {
  try {
    const config = await AllocationConfig.findOne();
    if (!config) {
      return res.status(404).json({ message: 'No allocation config found' });
    }
    const enabled = getEnabledDirectors(config);
    config.currentPointer = 0;
    config.cycleRemaining = freshCycleRemaining(enabled);
    await config.save();
    res.json({ message: 'Allocation cycle reset — starting fresh from the first director' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getConfig, saveConfig, previewConfig, runAllocation, getAllocationStats, resetCursor };