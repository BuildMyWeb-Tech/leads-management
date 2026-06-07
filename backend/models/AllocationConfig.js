const mongoose = require('mongoose');

/**
 * AllocationConfig — singleton document (one per system).
 * Stores director ratios and the current position in the sequence.
 *
 * Example ratios: [{ director: <id>, weight: 9 }, { director: <id>, weight: 4 }]
 * Sequence cursor tracks how far through the current cycle we are.
 */
const allocationConfigSchema = new mongoose.Schema(
  {
    // One entry per director with a weight (ratio)
    ratios: [
      {
        director: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        weight:   { type: Number, required: true, min: 1, max: 100 },
      },
    ],
    // Cursor: how many leads have been allocated in the current cycle (resets when cycle completes)
    cursor: { type: Number, default: 0 },
    // Total weight in the current config (sum of all weights — cached for fast lookup)
    totalWeight: { type: Number, default: 0 },
    // Is auto-allocation active?
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AllocationConfig', allocationConfigSchema);
