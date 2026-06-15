const mongoose = require('mongoose');

/**
 * AllocationConfig — singleton document (one per system).
 *
 * ADAPTIVE QUOTA-BASED ROUND ROBIN (replaces plain round robin):
 *
 *   directors: ordered list of { director, enabled, sequenceOrder, quota }
 *     - sequenceOrder: 0-based position determining participation
 *       ORDER in the interleave cycle (A, B, C, D, ...).
 *     - quota: how many leads this director receives per cycle
 *       before being marked exhausted for that cycle.
 *
 *   cycleRemaining: persisted per-cycle countdown — one entry per
 *     enabled director (keyed by director ObjectId as string),
 *     tracking how many of THIS cycle's quota remain unused.
 *     Re-initialised from `quota` whenever a new cycle starts
 *     (i.e. when every entry hits 0) or when the director list
 *     changes (add/remove/quota edit) — see allocationEngine.js.
 *
 *   currentPointer: 0-based index into the ENABLED directors array
 *     (sorted by sequenceOrder) — "the next position to try when
 *     picking a director". Unlike plain round robin, this does NOT
 *     simply increment by 1 every pick; it advances past whichever
 *     director was just picked, and scanning skips
 *     directors whose cycleRemaining is 0.
 *
 * Example: A=9, B=4, C=4, D=1 (sequenceOrder 0..3)
 *   Lead 1 → A (cycleRemaining: A=8,B=4,C=4,D=1, pointer→1)
 *   Lead 2 → B (cycleRemaining: A=8,B=3,C=4,D=1, pointer→2)
 *   ... continues interleaving until all remaining hit 0,
 *   then cycleRemaining resets to {A:9,B:4,C:4,D:1}, pointer→0,
 *   and the cycle repeats.
 *
 * Both currentPointer and cycleRemaining are persisted in MongoDB
 * so server restarts do not disturb the in-progress cycle.
 *
 * Existing leads are NEVER reallocated — this config only affects
 * NEW pickNextDirector() calls going forward.
 */
const allocationConfigSchema = new mongoose.Schema(
  {
    // Allocation strategy. 'adaptive_quota_round_robin' is the
    // current/only supported mode. 'round_robin' is kept in the enum
    // for backward compatibility with pre-existing documents that may
    // still have that value before migration runs.
    allocationMode: {
      type: String,
      enum: ['round_robin', 'adaptive_quota_round_robin'],
      default: 'adaptive_quota_round_robin',
    },

    // Ordered list of participating directors
    directors: [
      {
        director: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        enabled:       { type: Boolean, default: true },
        sequenceOrder: { type: Number, required: true }, // 0-based — cycle participation order
        quota:         { type: Number, default: 1, min: 0 }, // leads per cycle before exhaustion
      },
    ],

    // ── Adaptive Quota-Based Round Robin persisted cycle state ──
    // One entry per ENABLED director (by sequenceOrder at time of
    // last (re)initialisation). `remaining` counts down from `quota`
    // as leads are allocated; when ALL entries reach 0, the whole
    // array is reset back to each director's configured `quota` and
    // currentPointer returns to 0 (new cycle).
    cycleRemaining: [
      {
        director:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        remaining: { type: Number, required: true, min: 0 },
      },
    ],

    // 0-based pointer into the enabled-directors array (sorted by
    // sequenceOrder) — "next position to try". Persists across
    // restarts; only reset via explicit "Reset sequence" action or
    // automatically when a new cycle begins.
    currentPointer: { type: Number, default: 0 },

    // Is auto-allocation active?
    isActive: { type: Boolean, default: true },

    // ── Legacy field — pre-migration configs may still have this.
    // Auto-migrated to `directors[]` on read (see allocationController.js).
    ratios: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AllocationConfig', allocationConfigSchema);