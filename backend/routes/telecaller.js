const express = require('express');
const router  = express.Router();
const { getTelecallerDashboard } = require('../controllers/telecallerController');
const { protect, authorize }     = require('../middleware/auth');

router.use(protect);
router.use(authorize('telecaller', 'admin', 'director'));

router.get('/dashboard', getTelecallerDashboard);

module.exports = router;
