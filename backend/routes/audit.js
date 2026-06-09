const express = require('express');
const router  = express.Router();
const {
  getLogs, getLeadHistory, getUserActivity,
  getAuditStats, exportLogs, purgeLogs,
} = require('../controllers/auditController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Admin: full log viewer, stats, export, purge
router.get('/logs',                    authorize('admin'),             getLogs);
router.get('/stats',                   authorize('admin'),             getAuditStats);
router.get('/export',                  authorize('admin'),             exportLogs);
router.delete('/purge',                authorize('admin'),             purgeLogs);
router.get('/user-activity/:userId',   authorize('admin'),             getUserActivity);

// Admin + Director: per-lead history
router.get('/logs/:leadId',            authorize('admin', 'director'), getLeadHistory);

module.exports = router;
