const express = require('express');
const router  = express.Router();
const { checkDuplicates, importOcrLeads } = require('../controllers/ocrController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin', 'director'));

router.post('/check-duplicates', checkDuplicates);
router.post('/import',           importOcrLeads);

module.exports = router;
