const express = require('express');
const router = express.Router();
const multer = require('multer');
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

// Multer: store file in memory buffer (no disk write)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
});

router.use(protect);

// Dashboard stats — must be before /:id route
router.get('/dashboard/stats', getDashboardStats);

// Bulk assign — must be before /:id route
router.post('/bulk-assign', authorize('admin', 'manager'), bulkAssign);

// CSV import — Admin only
router.post('/import-csv', authorize('admin'), upload.single('file'), importCSV);

// CRUD
router.get('/', getLeads);
router.post('/', authorize('admin', 'manager'), createLead);
router.get('/:id', getLead);
router.put('/:id', updateLead);
router.delete('/:id', authorize('admin'), deleteLead);

module.exports = router;
