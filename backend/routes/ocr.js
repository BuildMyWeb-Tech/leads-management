const express = require('express');
const router  = express.Router();
const { checkDuplicates, importOcrLeads } = require('../controllers/ocrController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
// PHASE E: intentionally excludes 'tl', consistent with the same
// admin/director-only restriction already applied to bulk-assign and
// CSV import (see routes/leads.js) — bulk/high-volume lead-creation
// operations are kept to admin/director even though tl is otherwise
// an equivalent permission tier for day-to-day lead management.
router.use(authorize('admin', 'director'));

router.post('/check-duplicates', checkDuplicates);
router.post('/import',           importOcrLeads);

module.exports = router;
