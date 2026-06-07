const express = require('express');
const router = express.Router();
const {
  getConfig,
  saveConfig,
  previewConfig,
  runAllocation,
  getAllocationStats,
  resetCursor,
} = require('../controllers/allocationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin'));

router.get('/config',         getConfig);
router.put('/config',         saveConfig);
router.post('/preview',       previewConfig);
router.post('/run',           runAllocation);
router.get('/stats',          getAllocationStats);
router.post('/reset-cursor',  resetCursor);

module.exports = router;
