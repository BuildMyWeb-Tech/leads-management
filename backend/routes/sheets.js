const express = require('express');
const router  = express.Router();
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

router.use(protect);
router.use(authorize('admin'));

router.get('/config',          getSheetConfig);
router.put('/config',          saveSheetConfig);
router.post('/verify',         verifySheetConnection);
router.post('/sync-all',       syncAll);
router.post('/sync-lead/:id',  syncSingleLead);
router.post('/retry-queue',    retryQueue);
router.delete('/retry-queue',  clearRetryQueue);
router.get('/column-options',  getColumnOptions);

module.exports = router;
