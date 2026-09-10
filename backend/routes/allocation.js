const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getConfig,
  saveConfig,
  previewConfig,
  runAllocation,
  getAllocationStats,
  resetCursor,
} = require('../controllers/allocationController');
const { protect, authorize } = require('../middleware/auth');

// I2-007: rate limit for the expensive allocation run operation
const heavyOpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests for this operation. Please try again later.' },
});

router.use(protect);
router.use(authorize('admin'));

router.get('/config',         getConfig);
router.put('/config',         saveConfig);
router.post('/preview',       previewConfig);
router.post('/run',           heavyOpLimiter, runAllocation);
router.get('/stats',          getAllocationStats);
router.post('/reset-cursor',  resetCursor);

module.exports = router;
