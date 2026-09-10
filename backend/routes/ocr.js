const express = require('express');
const router  = express.Router();
const { checkDuplicates, importOcrLeads } = require('../controllers/ocrController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
// G.2 added TL to the frontend OCR access (App.jsx, Sidebar.jsx).
// H.2 aligns backend authorization: admin, director, and tl may use OCR import.
// CSV import remains separately controlled by backend/routes/leads.js.
router.use(authorize('admin', 'director', 'tl'));

router.post('/check-duplicates', checkDuplicates);
router.post('/import',           importOcrLeads);

module.exports = router;
