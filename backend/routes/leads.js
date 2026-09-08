const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const {
  getLeads,
  createLead,
  getLead,
  updateLead,
  deleteLead,
  bulkAssign,
  importCSV,
  getDashboardStats,
} = require('../controllers/leadsController');

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/dashboard/stats', getDashboardStats);

router.get('/', getLeads);
// PHASE D SIGN-OFF: admin/director/tl are one equivalent permission
// tier for lead management, so tl can create leads too. bulk-assign
// and CSV import remain admin/director-only and admin-only
// respectively, per the earlier explicit Phase C security-hardening
// instruction that was not overridden by this decision.
router.post('/', authorize('admin', 'director', 'tl'), createLead);
router.post('/bulk-assign', authorize('admin', 'director'), bulkAssign);
router.post('/import-csv', authorize('admin'), upload.single('file'), importCSV);

router.get('/:id', getLead);
router.put('/:id', updateLead);
router.delete('/:id', authorize('admin'), deleteLead);

module.exports = router;
