const mongoose = require('mongoose');

/**
 * AllocationConfig — singleton document (one per system).
 *
 * ROUND ROBIN MODE:
 *   directors: ordered list of { director, enabled, sequenceOrder }
 *   currentPointer: 0-based counter, incremented on every pick,
 *                    taken % (enabled directors count) to find the
 *                    next director in sequence.
 *
 * Example: directors = [D1, D2, D3, D4] (all enabled)
 *   currentPointer=0 → D1, then pointer→1
 *   currentPointer=1 → D2, then pointer→2
 *   ...
 *   currentPointer=4 → 4 % 4 = 0 → D1 again
 *
 * Disabled directors are filtered out before the modulo, so they're
 * skipped automatically without shifting other directors' positions.
 *
 * New directors are appended to the array — existing currentPointer
 * value is preserved (not reset), so prior allocation history is
 * never disturbed; the new director simply joins the rotation.
 */
const allocationConfigSchema = new mongoose.Schema(
  {
    // Allocation strategy — currently only 'round_robin' is supported.
    // Kept as a field for forward compatibility / explicit migration marker.
    allocationMode: {
      type: String,
      enum: ['round_robin'],
      default: 'round_robin',
    },

    // Ordered list of participating directors
    directors: [
      {
        director: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        enabled:       { type: Boolean, default: true },
        sequenceOrder: { type: Number, required: true }, // 0-based position in rotation
      },
    ],

    // 0-based pointer — persists across restarts, never reset on
    // add/remove/enable/disable. Only reset via explicit "Reset sequence".
    currentPointer: { type: Number, default: 0 },

    // Is auto-allocation active?
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AllocationConfig', allocationConfigSchema);