const express = require('express');
const router  = express.Router();
const {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  getMySubscriptions,
  updatePreferences,
  sendTestNotification,
  triggerReminders,
  getPushStatus,
} = require('../controllers/pushController');
const { protect, authorize } = require('../middleware/auth');

// Public — browser needs VAPID key before auth to subscribe
router.get('/vapid-public-key', getVapidPublicKey);

// Authenticated — all roles
router.use(protect);
router.post('/subscribe',       subscribe);
router.delete('/unsubscribe',   unsubscribe);
router.get('/subscriptions',    getMySubscriptions);
router.put('/preferences',      updatePreferences);
router.post('/test',            sendTestNotification);

// Admin only
router.post('/send-reminders',  authorize('admin'), triggerReminders);
router.get('/status',           authorize('admin'), getPushStatus);

module.exports = router;
