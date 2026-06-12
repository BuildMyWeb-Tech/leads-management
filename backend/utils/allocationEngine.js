/**
 * Allocation Engine — Simple Sequential Round Robin.
 *
 * Algorithm:
 *   directors = ordered list, filtered to enabled === true,
 *   sorted by sequenceOrder.
 *
 *   currentPointer is a 0-based counter, incremented atomically
 *   on every pick. The director chosen is:
 *
 *     enabled[ currentPointer % enabled.length ]
 *
 *   currentPointer keeps growing forever (not reset on cycle wrap —
 *   the modulo handles wrapping). It IS preserved across:
 *     - server restarts (stored in MongoDB)
 *     - enabling/disabling directors
 *     - adding/removing directors
 *   It is ONLY reset via the explicit "Reset sequence" action.
 *
 * Concurrency:
 *   findOneAndUpdate with $inc on currentPointer, returning the OLD
 *   document (new: false), so the pre-increment value is used for
 *   THIS pick — exactly the same atomic pattern as the previous engine.
 */

const AllocationConfig = require('../models/AllocationConfig');

/**
 * Returns the enabled directors from a config, sorted by sequenceOrder.
 */
const getEnabledDirectors = (config) => {
  return (config.directors || [])
    .filter((d) => d.enabled)
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
};

/**
 * Pick next director based on current config.
 * Returns { directorId, configId } or null if no active config /
 * no enabled directors.
 * Atomically increments currentPointer.
 */
const pickNextDirector = async () => {
  const config = await AllocationConfig.findOne({ isActive: true });
  if (!config || !config.directors.length) return null;

  const enabled = getEnabledDirectors(config);
  if (enabled.length === 0) return null; // all directors disabled

  // Atomically increment currentPointer, get the PRE-increment doc
  const before = await AllocationConfig.findByIdAndUpdate(
    config._id,
    { $inc: { currentPointer: 1 } },
    { new: false }
  );

  const pointer = before.currentPointer; // pre-increment value used for THIS pick
  const index   = pointer % enabled.length;
  const chosen  = enabled[index];

  return { directorId: chosen.director, configId: config._id };
};

/**
 * Preview the allocation sequence for a given directors array.
 *
 * @param directors - [{ director, enabled, sequenceOrder }]
 * @param startPointer - the currentPointer to start counting from
 *                        (so the preview reflects "what happens next",
 *                        not always starting at Lead 1 → first director)
 * @param count - how many upcoming leads to preview (default 8)
 *
 * Returns an array of { leadNumber, director } where leadNumber is
 * 1-based relative to startPointer (Lead 1 = the very next lead).
 */
const previewSequence = (directors, startPointer = 0, count = 8) => {
  const enabled = (directors || [])
    .filter((d) => d.enabled)
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  if (enabled.length === 0) return [];

  const sequence = [];
  for (let i = 0; i < count; i++) {
    const pointer = startPointer + i;
    const index   = pointer % enabled.length;
    sequence.push({
      leadNumber: i + 1,
      director:   enabled[index].director,
    });
  }
  return sequence;
};

module.exports = { pickNextDirector, previewSequence, getEnabledDirectors };