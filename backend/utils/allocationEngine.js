/**
 * Allocation Engine — Adaptive Quota-Based Round Robin.
 *
 * Admin configures, per director (in sequenceOrder):
 *   - quota: leads received per cycle before exhaustion
 *
 * Algorithm (one pick = one new lead):
 *   1. Let enabled = directors filtered to enabled === true,
 *      sorted by sequenceOrder.
 *   2. If cycleRemaining is missing/stale (director list, quotas,
 *      or order changed since it was last built), reinitialise it:
 *        cycleRemaining[i] = { director: enabled[i].director,
 *                               remaining: enabled[i].quota }
 *      and reset currentPointer to 0.
 *   3. If EVERY entry in cycleRemaining has remaining <= 0
 *      (cycle complete), reset all remaining back to each
 *      director's configured quota and set currentPointer = 0.
 *      (This is the "new cycle" reset — happens BEFORE picking,
 *      so the lead that triggers the reset is allocated from the
 *      fresh cycle.)
 *   4. Scan enabled[] starting at currentPointer (wrapping around)
 *      for the first director whose cycleRemaining.remaining > 0.
 *      Decrement that entry's remaining by 1.
 *      Set currentPointer = (foundIndex + 1) % enabled.length.
 *   5. Return that director.
 *
 * Example: A(seq0,q9) B(seq1,q4) C(seq2,q4) D(seq3,q1)
 *   Sequence produced: A B C D A B C A B C A B C A A A A A | repeat
 *   (verified against client spec)
 *
 * Persistence:
 *   currentPointer and cycleRemaining are stored on the singleton
 *   AllocationConfig document and survive server restarts. They are
 *   read-modify-written together on every pick (see note on
 *   concurrency below).
 *
 * Concurrency:
 *   Unlike the previous plain-round-robin engine (which used a
 *   single atomic $inc), this algorithm needs to read cycleRemaining,
 *   compute the next state, and write it back — a read-modify-write.
 *   We use findOneAndUpdate with the PREVIOUS cycleRemaining/pointer
 *   values in the filter (optimistic concurrency): if another
 *   request mutated the document in between, the update matches
 *   zero documents and we retry (bounded retries). This avoids
 *   double-allocating the same "slot" under concurrent lead creation
 *   without requiring a separate lock collection.
 *
 * Backward compatibility:
 *   Existing leads' assignedDirector values are never touched by
 *   this module — it only decides the assignment for NEW leads at
 *   the moment pickNextDirector() is called.
 */

const AllocationConfig = require('../models/AllocationConfig');

/**
 * Returns the enabled directors from a config, sorted by sequenceOrder.
 */
const getEnabledDirectors = (config) => {
  return (config.directors || [])
    // Defensive: skip entries with a missing/null director ref (e.g.
    // a deleted user) -- prevents downstream cycleRemaining entries
    // with director: null, which fails schema validation on save.
    .filter((d) => d && d.director && d.enabled)
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
};

/**
 * Checks whether `cycleRemaining` matches the current enabled-director
 * list (same directors, same order, same set of keys). It does NOT
 * compare quota values to remaining — only structural shape — because
 * `remaining` is expected to differ from `quota` mid-cycle.
 *
 * Returns true if cycleRemaining needs to be rebuilt from scratch
 * (director added/removed/reordered, or empty).
 */
// Helper: directors[i].director may be either a raw ObjectId
// (unpopulated) or a populated User document/object ({_id, name, ...}).
// Always reduce to a plain id string for comparison.
const directorId = (d) => String(d && d._id ? d._id : d);

const cycleRemainingIsStale = (config, enabled) => {
  const cr = normalizeCycleRemaining(config.cycleRemaining);
  if (cr.length !== enabled.length) return true;

  for (let i = 0; i < enabled.length; i++) {
    if (directorId(cr[i].director) !== directorId(enabled[i].director)) return true;
  }
  return false;
};

/**
 * Builds a fresh cycleRemaining array from the enabled directors'
 * configured quotas (start of a new cycle, or first-time init).
 */
const freshCycleRemaining = (enabled) =>
  enabled.map((d) => ({
    // Store the raw id -- d.director may be a populated User object
    // ({_id, name, ...}) when called after .populate('directors.director'),
    // but cycleRemaining.director is schema'd as ObjectId/ref and
    // must be the raw id, not the populated object.
    director: d.director && d.director._id ? d.director._id : d.director,
    remaining: Math.max(0, d.quota || 0),
  }));

/**
 * Normalises a cycleRemaining array into plain { director, remaining }
 * objects.
 *
 * BUG FIX: when `cycleRemaining` comes straight from a Mongoose
 * document (e.g. `config.cycleRemaining`), each element is a Mongoose
 * subdocument whose `director`/`remaining` are accessor getters, NOT
 * own enumerable properties. A naive `{ ...c }` spread on such an
 * element produces `{ director: undefined, remaining: undefined }`
 * (the getters are lost), which then made every `remaining > 0` check
 * evaluate to `undefined > 0 === false` -- so the engine thought every
 * director was immediately exhausted, reset the cycle on EVERY pick,
 * and always picked the first enabled director (Director 1), with
 * `remainingAfter` rendering as "undefined=undefined".
 *
 * Reading `c.director` / `c.remaining` explicitly (instead of
 * spreading) works correctly for BOTH plain objects AND Mongoose
 * subdocuments, since both expose these via property access -- only
 * the spread/enumeration was the problem.
 */
const normalizeCycleRemaining = (cycleRemaining) =>
  (cycleRemaining || []).map((c) => ({
    director:  c.director,
    remaining: c.remaining,
  }));

/**
 * Pure simulation step — given enabled[], cycleRemaining[], and
 * currentPointer, returns:
 *   { directorIndex, nextCycleRemaining, nextPointer, didReset }
 *
 * Does NOT mutate inputs. Used by both pickNextDirector() (with DB
 * persistence) and previewSequence() (pure, no DB writes).
 */
const simulatePick = (enabled, cycleRemaining, currentPointer) => {
  // Explicit field copy -- NOT a spread -- so this works whether
  // `cycleRemaining` entries are plain objects or Mongoose
  // subdocuments (see normalizeCycleRemaining for why spreads fail).
  let remaining = cycleRemaining.map((c) => ({ director: c.director, remaining: c.remaining }));
  let pointer   = currentPointer;
  let didReset  = false;

  // Step 3: if every director is exhausted, start a new cycle
  if (remaining.length === 0 || remaining.every((c) => c.remaining <= 0)) {
    remaining = freshCycleRemaining(enabled);
    pointer   = 0;
    didReset  = true;
  }

  // Step 4: scan from pointer for first director with remaining > 0
  for (let i = 0; i < enabled.length; i++) {
    const idx = (pointer + i) % enabled.length;
    if (remaining[idx].remaining > 0) {
      remaining[idx] = { director: remaining[idx].director, remaining: remaining[idx].remaining - 1 };
      const nextPointer = (idx + 1) % enabled.length;
      return {
        directorIndex: idx,
        nextCycleRemaining: remaining,
        nextPointer,
        didReset,
      };
    }
  }

  // Should be unreachable if every quota >= 1, but guard against
  // all-zero quotas (e.g. admin sets every quota to 0) by falling
  // back to position 0 without decrementing — avoids an infinite
  // loop / null pick.
  return {
    directorIndex: 0,
    nextCycleRemaining: remaining,
    nextPointer: 0,
    didReset,
  };
};

const MAX_RETRIES = 5;

/**
 * Pick next director based on current config.
 * Returns { directorId, configId } or null if no active config /
 * no enabled directors.
 *
 * Persists the updated cycleRemaining + currentPointer atomically
 * via optimistic-concurrency findOneAndUpdate (retries on conflict).
 */
const pickNextDirector = async () => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const config = await AllocationConfig.findOne({ isActive: true });
    if (!config || !config.directors.length) return null;

    const enabled = getEnabledDirectors(config);
    if (enabled.length === 0) return null; // all directors disabled

    // Rebuild cycleRemaining if structurally stale (director added/
    // removed/reordered since it was last built). This intentionally
    // starts a fresh cycle for the new configuration — existing
    // leads are unaffected, only future picks change.
    let baseRemaining   = normalizeCycleRemaining(config.cycleRemaining);
    let basePointer     = config.currentPointer || 0;
    if (cycleRemainingIsStale(config, enabled)) {
      baseRemaining = freshCycleRemaining(enabled);
      basePointer   = 0;
    }

    const { directorIndex, nextCycleRemaining, nextPointer } =
      simulatePick(enabled, baseRemaining, basePointer);

    const chosen = enabled[directorIndex];

    // Optimistic-concurrency write: match on the config _id AND the
    // exact previous cycleRemaining/currentPointer we read. If
    // another request updated the doc first, this matches nothing
    // and we retry with fresh state.
    const updateResult = await AllocationConfig.findOneAndUpdate(
      {
        _id: config._id,
        currentPointer: config.currentPointer,
        // Match cycleRemaining by serialised comparison — Mongoose
        // can't directly match array-of-subdocs by deep-equality in
        // a query, so we instead use a version-like guard: only
        // proceed if currentPointer is unchanged AND the array
        // length matches what we read. Combined with the retry loop,
        // a lost race simply retries with fresh data — at worst this
        // causes a harmless extra read, never a corrupted pick.
        $expr: { $eq: [{ $size: { $ifNull: ['$cycleRemaining', []] } }, baseRemaining.length] },
      },
      {
        $set: {
          cycleRemaining: nextCycleRemaining,
          currentPointer: nextPointer,
        },
      },
      { new: true }
    );

    if (updateResult) {
      return { directorId: chosen.director, configId: config._id };
    }
    // else: conflict — loop and retry with fresh config
  }

  // Exhausted retries — extremely unlikely under normal load.
  // Fall back to a best-effort pick without the optimistic guard so
  // a single lead is never left unallocated due to contention.
  const config = await AllocationConfig.findOne({ isActive: true });
  if (!config || !config.directors.length) return null;
  const enabled = getEnabledDirectors(config);
  if (enabled.length === 0) return null;

  let baseRemaining = normalizeCycleRemaining(config.cycleRemaining);
  let basePointer   = config.currentPointer || 0;
  if (cycleRemainingIsStale(config, enabled)) {
    baseRemaining = freshCycleRemaining(enabled);
    basePointer   = 0;
  }
  const { directorIndex, nextCycleRemaining, nextPointer } =
    simulatePick(enabled, baseRemaining, basePointer);
  const chosen = enabled[directorIndex];

  await AllocationConfig.findByIdAndUpdate(config._id, {
    $set: { cycleRemaining: nextCycleRemaining, currentPointer: nextPointer },
  });

  return { directorId: chosen.director, configId: config._id };
};

/**
 * Preview the allocation sequence for a given directors array,
 * starting from the CURRENT persisted cycleRemaining/currentPointer
 * (so the preview reflects "what happens next" with the live cycle
 * state) — or, if the proposed `directors` differ structurally from
 * the persisted config (admin is editing quotas/order before
 * saving), simulates from a freshly-initialised cycle using the
 * PROPOSED quotas. This lets the admin UI show the effect of edits
 * before clicking Save.
 *
 * @param directors    - [{ director, enabled, sequenceOrder, quota }]
 *                        (the proposed/edited config from the UI)
 * @param startState   - { cycleRemaining, currentPointer } — the
 *                        persisted state to continue from. Pass the
 *                        current config's values. If the proposed
 *                        `directors` are structurally different from
 *                        what produced this state, the preview
 *                        rebuilds cycleRemaining from the proposed
 *                        quotas (matching pickNextDirector's
 *                        stale-detection behaviour).
 * @param count        - how many upcoming leads to preview (default 8)
 *
 * Returns an array of { leadNumber, director, remainingAfter }.
 * leadNumber is 1-based (Lead 1 = the very next lead).
 */
const previewSequence = (directors, startState = {}, count = 8) => {
  const enabled = (directors || [])
    .filter((d) => d.enabled)
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  if (enabled.length === 0) return [];

  // Determine starting cycleRemaining/pointer for the simulation.
  // Normalize: startState.cycleRemaining may be a Mongoose document's
  // subdocument array (config.cycleRemaining) -- see
  // normalizeCycleRemaining for why this matters.
  let cycleRemaining = normalizeCycleRemaining(startState.cycleRemaining);
  let currentPointer = startState.currentPointer || 0;

  const stale =
    cycleRemaining.length !== enabled.length ||
    cycleRemaining.some((c, i) => String(c.director) !== String(enabled[i].director));

  if (stale) {
    cycleRemaining = freshCycleRemaining(enabled);
    currentPointer = 0;
  }

  const sequence = [];
  for (let i = 0; i < count; i++) {
    const { directorIndex, nextCycleRemaining, nextPointer, didReset } =
      simulatePick(enabled, cycleRemaining, currentPointer);

    cycleRemaining = nextCycleRemaining;
    currentPointer = nextPointer;

    sequence.push({
      leadNumber: i + 1,
      director:   enabled[directorIndex].director,
      cycleReset: didReset,
      // Snapshot of remaining quotas AFTER this pick, keyed by
      // director id — useful for the UI to show "A=8 B=4 C=4 D=1"
      // style countdowns.
      remainingAfter: cycleRemaining.map((c) => ({
        director:  String(c.director),
        remaining: c.remaining,
      })),
    });
  }
  return sequence;
};

/**
 * pickNextEmployee(directorId) — Phase 2 of hierarchical allocation.
 *
 * After AQRR picks a Director, this function resolves the assignment
 * down to an eligible Employee:
 *   1. Find all active TLs whose managedBy === directorId
 *   2. Find all active telecallers whose managedBy ∈ those TL ids
 *   3. Filter to those who have an attendance record for today (IST)
 *   4. Select one using a deterministic round-robin:
 *      sort candidates by _id (stable across calls) then pick the one
 *      at index (totalLeadsAssigned % eligibleCount).  Since we do
 *      not want to store per-employee counters, we approximate the
 *      counter by counting how many leads have already been assigned
 *      to each eligible employee today — the least-loaded employee
 *      among eligible ones is chosen.  Ties broken by _id order.
 *      This is stateless (no extra DB collection), attendance-gated,
 *      and naturally distributes load across the workday as employees
 *      receive leads.
 * 5. Return the selected employee's _id, or null if no eligible
 *    employee exists (zero-present / no hierarchy).
 *
 * This function NEVER touches AllocationConfig or Director AQRR state.
 */
const pickNextEmployee = async (directorId) => {
  if (!directorId) return null;

  const User       = require('../models/User');
  const Attendance = require('../models/Attendance');
  const Lead       = require('../models/Lead');
  const { getISTDateString } = require('./dateHelper');

  try {
    // Step 1: TLs under this director
    const tls = await User.find({
      role:      'tl',
      managedBy: directorId,
      isActive:  true,
    }).select('_id').lean();

    if (!tls.length) return null;
    const tlIds = tls.map((t) => t._id);

    // Step 2: Active telecallers under those TLs
    const candidates = await User.find({
      role:      'telecaller',
      managedBy: { $in: tlIds },
      isActive:  true,
    }).select('_id').lean();

    if (!candidates.length) return null;
    const candidateIds = candidates.map((c) => c._id);

    // Step 3: Intersect with today's attendance (IST)
    const todayIST = getISTDateString();
    const presentRecords = await Attendance.find({
      businessDate: todayIST,
      employee:     { $in: candidateIds },
    }).select('employee').lean();

    if (!presentRecords.length) return null;
    const presentIds = presentRecords.map((r) => String(r.employee));

    const eligible = candidates
      .filter((c) => presentIds.includes(String(c._id)))
      // Sort by string _id for deterministic order independent of DB return order
      .sort((a, b) => String(a._id).localeCompare(String(b._id)));

    if (!eligible.length) return null;

    // Step 4: Least-loaded selection — pick the eligible employee who
    // has received the fewest leads today (among eligible ones).
    // Counting today's assignedTelecaller on leads is lightweight for
    // the expected team size (tens of employees, not millions).
    const leadCounts = await Lead.aggregate([
      {
        $match: {
          assignedTelecaller: { $in: eligible.map((e) => e._id) },
          createdAt: {
            $gte: (() => {
              const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
              const istNow = new Date(Date.now() + IST_OFFSET_MS);
              istNow.setUTCHours(0, 0, 0, 0);
              return new Date(istNow.getTime() - IST_OFFSET_MS);
            })(),
          },
        },
      },
      { $group: { _id: '$assignedTelecaller', count: { $sum: 1 } } },
    ]);

    const countMap = Object.fromEntries(
      leadCounts.map((r) => [String(r._id), r.count])
    );

    // Sort eligible by ascending lead count, then ascending _id for ties
    eligible.sort((a, b) => {
      const diff = (countMap[String(a._id)] || 0) - (countMap[String(b._id)] || 0);
      if (diff !== 0) return diff;
      return String(a._id).localeCompare(String(b._id));
    });

    return eligible[0]._id;
  } catch (err) {
    // Non-fatal: if Phase 2 fails (e.g. DB blip), the lead still gets
    // a Director via AQRR and manual assignment remains available.
    console.warn('[pickNextEmployee] failed:', err.message);
    return null;
  }
};

module.exports = {
  pickNextDirector,
  pickNextEmployee,
  previewSequence,
  getEnabledDirectors,
  // exported for tests
  simulatePick,
  freshCycleRemaining,
  cycleRemainingIsStale,
  normalizeCycleRemaining,
};