const PushSubscription = require('../models/PushSubscription');
const User             = require('../models/User');
const { sendToUser, notify, vapidReady } = require('../utils/pushService');
const { sendFollowUpReminders }          = require('../utils/reminderScheduler');

// ─────────────────────────────────────────────────────────────
// GET /api/push/vapid-public-key
// Returns the VAPID public key for browser subscription.
// Public endpoint — browsers need this before subscribing.
// ─────────────────────────────────────────────────────────────
const getVapidPublicKey = (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return res.status(503).json({
      message: 'Push notifications not configured. Set VAPID_PUBLIC_KEY in .env',
      configured: false,
    });
  }
  res.json({ publicKey: key, configured: true });
};

// ─────────────────────────────────────────────────────────────
// POST /api/push/subscribe
// Save a push subscription for the authenticated user.
// ─────────────────────────────────────────────────────────────
const subscribe = async (req, res) => {
  try {
    const { endpoint, expirationTime, keys, deviceLabel, userAgent } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'Invalid subscription object — missing endpoint or keys' });
    }

    // Upsert — if same endpoint exists update it, otherwise create
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        user:           req.user._id,
        endpoint,
        expirationTime: expirationTime || null,
        keys,
        deviceLabel:    deviceLabel || '',
        userAgent:      userAgent   || req.headers['user-agent'] || '',
        lastUsed:       new Date(),
        failCount:      0,
      },
      { upsert: true, new: true }
    );

    res.json({ message: 'Push subscription saved', subscribed: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/push/unsubscribe
// Remove push subscription by endpoint.
// ─────────────────────────────────────────────────────────────
const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: 'endpoint is required' });

    await PushSubscription.deleteOne({ endpoint, user: req.user._id });
    res.json({ message: 'Subscription removed', subscribed: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/push/subscriptions
// List all subscriptions for the current user (their devices).
// ─────────────────────────────────────────────────────────────
const getMySubscriptions = async (req, res) => {
  try {
    const subs = await PushSubscription.find({ user: req.user._id })
      .select('endpoint deviceLabel userAgent lastUsed createdAt failCount')
      .sort({ lastUsed: -1 });

    // Mask endpoint for privacy — show only last 40 chars
    const safe = subs.map((s) => ({
      ...s.toObject(),
      endpoint: '...' + s.endpoint.slice(-40),
    }));

    res.json(safe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/push/preferences
// Update notification preference toggles for current user.
// ─────────────────────────────────────────────────────────────
const updatePreferences = async (req, res) => {
  try {
    const { leadAssigned, telecallerAssigned, followUpReminder, statusChanged, dailySummary } = req.body;

    const update = {};
    if (leadAssigned       !== undefined) update['notificationPrefs.leadAssigned']       = leadAssigned;
    if (telecallerAssigned !== undefined) update['notificationPrefs.telecallerAssigned'] = telecallerAssigned;
    if (followUpReminder   !== undefined) update['notificationPrefs.followUpReminder']   = followUpReminder;
    if (statusChanged      !== undefined) update['notificationPrefs.statusChanged']      = statusChanged;
    if (dailySummary       !== undefined) update['notificationPrefs.dailySummary']       = dailySummary;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true }
    ).select('notificationPrefs');

    res.json({ message: 'Preferences updated', notificationPrefs: user.notificationPrefs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/push/test
// Send a test notification to the current user.
// ─────────────────────────────────────────────────────────────
const sendTestNotification = async (req, res) => {
  try {
    if (!vapidReady) {
      return res.status(503).json({ message: 'Push not configured — add VAPID keys to .env' });
    }

    const count = await notify.custom(
      req.user._id,
      '🎉 Test notification',
      'Push notifications are working correctly for A2S CRM!',
      '/dashboard'
    );

    if (count === 0) {
      return res.status(404).json({ message: 'No active subscriptions found. Enable push in your browser first.' });
    }

    res.json({ message: `Test notification sent to ${count} device(s)`, sent: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/push/send-reminders  (Admin only)
// Manually trigger follow-up reminders (bypass scheduler).
// ─────────────────────────────────────────────────────────────
const triggerReminders = async (req, res) => {
  try {
    await sendFollowUpReminders();
    res.json({ message: 'Follow-up reminders dispatched' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/push/status  (Admin only)
// Overall push system status — total subscriptions per role.
// ─────────────────────────────────────────────────────────────
const getPushStatus = async (req, res) => {
  try {
    const [totalSubs, perRole] = await Promise.all([
      PushSubscription.countDocuments(),
      PushSubscription.aggregate([
        {
          $lookup: {
            from: 'users', localField: 'user', foreignField: '_id', as: 'user',
          },
        },
        { $unwind: '$user' },
        { $group: { _id: '$user.role', count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      configured:  vapidReady,
      totalSubs,
      perRole,
      vapidKeySet: !!process.env.VAPID_PUBLIC_KEY,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  getMySubscriptions,
  updatePreferences,
  sendTestNotification,
  triggerReminders,
  getPushStatus,
};
