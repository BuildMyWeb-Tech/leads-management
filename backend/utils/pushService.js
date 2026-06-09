/**
 * pushService.js — Web Push notification dispatcher.
 *
 * Uses the web-push library (RFC 8030 / VAPID).
 * Stale subscriptions (410/404) are auto-removed from DB.
 * All send operations are non-fatal — never throws to caller.
 *
 * VAPID keys required in .env:
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_EMAIL=mailto:admin@yourdomain.com
 *
 * Generate keys: npm run generate-vapid
 */

const webpush          = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// ── Initialise VAPID ──────────────────────────────────────────
const initVapid = () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[Push] VAPID keys not set — push notifications disabled. Run: npm run generate-vapid');
    return false;
  }

  webpush.setVapidDetails(
    VAPID_EMAIL || 'mailto:admin@a2scinemas.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  return true;
};

const vapidReady = initVapid();

// ── Build notification payload ────────────────────────────────
const buildPayload = (title, body, { url = '/dashboard', tag = 'crm', icon, actions } = {}) => ({
  title,
  body,
  icon:  icon  || '/icon-192x192.png',
  badge: '/icon-72x72.png',
  tag,
  url,
  timestamp: Date.now(),
  actions: actions || [],
});

// ── Send to a single subscription ────────────────────────────
const sendToSubscription = async (sub, payload) => {
  try {
    await webpush.sendNotification(
      {
        endpoint:       sub.endpoint,
        expirationTime: sub.expirationTime,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      JSON.stringify(payload),
      { TTL: 86400 } // 24h TTL — deliver even if device is offline
    );

    // Update last-used timestamp
    await PushSubscription.updateOne({ _id: sub._id }, { lastUsed: new Date(), failCount: 0 });
    return true;
  } catch (err) {
    // 410 Gone / 404 Not Found = subscription no longer valid → remove it
    if (err.statusCode === 410 || err.statusCode === 404) {
      await PushSubscription.deleteOne({ _id: sub._id });
      console.log('[Push] Removed stale subscription:', sub.endpoint.slice(-30));
      return false;
    }
    // 429 Too Many Requests — increment fail count
    await PushSubscription.updateOne({ _id: sub._id }, { $inc: { failCount: 1 } });
    console.warn('[Push] Send failed:', err.message);
    return false;
  }
};

// ── Send to all subscriptions of a user ──────────────────────
const sendToUser = async (userId, payload) => {
  if (!vapidReady) return 0;

  try {
    const subs = await PushSubscription.find({ user: userId });
    if (!subs.length) return 0;

    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        const ok = await sendToSubscription(sub, payload);
        if (ok) sent++;
      })
    );
    return sent;
  } catch (err) {
    console.error('[Push] sendToUser error:', err.message);
    return 0;
  }
};

// ── Send to multiple users ────────────────────────────────────
const sendToUsers = async (userIds, payload) => {
  if (!vapidReady || !userIds?.length) return;
  await Promise.all(userIds.map((uid) => sendToUser(uid, payload)));
};

// ── Send to all users with a given role ──────────────────────
const sendToRole = async (role, payload) => {
  if (!vapidReady) return;
  try {
    const User = require('../models/User');
    const users = await User.find({ role, isActive: true }).select('_id');
    await sendToUsers(users.map((u) => u._id), payload);
  } catch (err) {
    console.error('[Push] sendToRole error:', err.message);
  }
};

// ── Notification templates ────────────────────────────────────

const notify = {
  // Director: new lead(s) allocated to them
  leadAllocatedToDirector: (directorId, leadName, count = 1) => {
    const payload = buildPayload(
      count > 1 ? `${count} new leads allocated` : 'New lead allocated',
      count > 1
        ? `${count} leads have been assigned to you`
        : `${leadName} has been assigned to you`,
      { url: '/director-dashboard', tag: 'lead-allocated' }
    );
    return sendToUser(directorId, payload);
  },

  // Telecaller: a lead has been assigned to them
  leadAssignedToTelecaller: (telecallerId, leadName) => {
    const payload = buildPayload(
      'New lead assigned',
      `${leadName} has been assigned to you`,
      { url: '/my-leads', tag: 'lead-assigned', actions: [{ action: 'view', title: 'View now' }] }
    );
    return sendToUser(telecallerId, payload);
  },

  // User: their own follow-up is due today
  followUpReminder: (userId, leadName, phone) => {
    const payload = buildPayload(
      'Follow-up due today',
      `${leadName} (${phone}) — scheduled for today`,
      { url: '/my-leads', tag: `followup-${userId}` }
    );
    return sendToUser(userId, payload);
  },

  // Director/Admin: lead status changed
  statusChanged: (directorId, leadName, oldStatus, newStatus) => {
    const payload = buildPayload(
      'Lead status updated',
      `${leadName}: ${oldStatus} → ${newStatus}`,
      { url: '/director-dashboard', tag: 'status-changed' }
    );
    return sendToUser(directorId, payload);
  },

  // Admin: bulk allocation completed
  bulkAllocationDone: (adminId, count) => {
    const payload = buildPayload(
      'Allocation complete',
      `${count} lead${count !== 1 ? 's' : ''} allocated successfully`,
      { url: '/director-dashboard', tag: 'bulk-allocation' }
    );
    return sendToUser(adminId, payload);
  },

  // Custom push to a specific user
  custom: (userId, title, body, url = '/dashboard') => {
    const payload = buildPayload(title, body, { url, tag: 'custom' });
    return sendToUser(userId, payload);
  },
};

module.exports = { sendToUser, sendToUsers, sendToRole, notify, vapidReady };
