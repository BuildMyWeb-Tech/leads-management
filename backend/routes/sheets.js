const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getSheetConfig,
  saveSheetConfig,
  verifySheetConnection,
  syncAll,
  syncSingleLead,
  retryQueue,
  clearRetryQueue,
  getColumnOptions,
} = require('../controllers/sheetsController');
const { protect, authorize } = require('../middleware/auth');

// I2-007: rate limit for the expensive sync-all operation
const heavyOpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests for this operation. Please try again later.' },
});

router.use(protect);
router.use(authorize('admin'));

router.get('/config',          getSheetConfig);
router.put('/config',          saveSheetConfig);
router.post('/verify',         verifySheetConnection);
router.post('/sync-all',       heavyOpLimiter, syncAll);
router.post('/sync-lead/:id',  syncSingleLead);
router.post('/retry-queue',    retryQueue);
router.delete('/retry-queue',  clearRetryQueue);
router.get('/column-options',  getColumnOptions);

module.exports = router;
