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
router.post('/', authorize('admin', 'director'), createLead);
router.post('/bulk-assign', authorize('admin', 'director'), bulkAssign);
router.post('/import-csv', authorize('admin'), upload.single('file'), importCSV);

router.get('/:id', getLead);
router.put('/:id', updateLead);
router.delete('/:id', authorize('admin'), deleteLead);

module.exports = router;
