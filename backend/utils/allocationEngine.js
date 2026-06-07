/**
 * Allocation Engine — ratio-based round-robin director assignment.
 *
 * Algorithm:
 *   Given weights [A=9, B=4, C=4, D=1], total = 18.
 *   Build a cumulative boundary array: [9, 13, 17, 18].
 *   Cursor starts at 0 and increments per lead assigned.
 *   Position = cursor % totalWeight.
 *   Find which bucket the position falls into → that's the director.
 *
 * This produces the exact sequence:
 *   1-9   → A  (9 leads)
 *   10-13 → B  (4 leads)
 *   14-17 → C  (4 leads)
 *   18    → D  (1 lead)
 *   repeat infinitely — cursor wraps via modulo.
 *
 * Thread-safety: we use findOneAndUpdate with $inc on cursor atomically
 * to prevent double-allocation in concurrent requests.
 */

const AllocationConfig = require('../models/AllocationConfig');

/**
 * Pick next director based on current config.
 * Returns { directorId, configId } or null if no active config.
 * Atomically increments the cursor.
 */
const pickNextDirector = async () => {
  // Load config with director references
  const config = await AllocationConfig.findOne({ isActive: true });
  if (!config || !config.ratios.length) return null;

  const totalWeight = config.ratios.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return null;

  // Atomically get current cursor and increment it
  const updated = await AllocationConfig.findByIdAndUpdate(
    config._id,
    { $inc: { cursor: 1 }, $set: { totalWeight } },
    { new: false } // return the OLD doc (before increment) so we use the pre-increment cursor
  );

  const position = (updated.cursor) % totalWeight;

  // Walk the cumulative boundary to find the director
  let cumulative = 0;
  for (const ratio of config.ratios) {
    cumulative += ratio.weight;
    if (position < cumulative) {
      return { directorId: ratio.director, configId: config._id };
    }
  }

  // Fallback — should never reach here
  return { directorId: config.ratios[0].director, configId: config._id };
};

/**
 * Preview the full allocation sequence for a given ratios array.
 * Used by the admin config UI to show what sequence will be generated.
 * Returns an array of director assignments (one per position in one cycle).
 */
const previewSequence = (ratios) => {
  const totalWeight = ratios.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return [];

  const sequence = [];
  let cumulative = 0;
  const boundaries = ratios.map((r) => {
    cumulative += r.weight;
    return { boundary: cumulative, director: r.director, weight: r.weight };
  });

  for (let pos = 0; pos < totalWeight; pos++) {
    for (const b of boundaries) {
      if (pos < b.boundary) {
        sequence.push(b.director);
        break;
      }
    }
  }
  return sequence;
};

module.exports = { pickNextDirector, previewSequence };
