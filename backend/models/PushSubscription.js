const mongoose = require('mongoose');

/**
 * PushSubscription — stores Web Push subscription objects per user.
 * One user can have multiple subscriptions (multiple devices/browsers).
 * TTL: auto-expire stale subscriptions after 90 days of no use.
 */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
      required: true,
      index: true,
    },
    // Full Web Push subscription object from browser
    endpoint:    { type: String, required: true, unique: true },
    expirationTime: { type: Number, default: null },
    keys: {
      p256dh: { type: String, required: true },
      auth:   { type: String, required: true },
    },
    // Metadata
    userAgent:   { type: String, default: '' },
    deviceLabel: { type: String, default: '' },
    lastUsed:    { type: Date,   default: Date.now },
    failCount:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Auto-remove subscriptions not used in 90 days
pushSubscriptionSchema.index({ lastUsed: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compound index for fast per-user queries
pushSubscriptionSchema.index({ user: 1, endpoint: 1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
