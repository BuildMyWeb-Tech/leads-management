const express = require('express');
const router  = express.Router();
const { getDirectorDashboard, getMyTelecallers } = require('../controllers/directorController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin', 'director'));

router.get('/dashboard',   getDirectorDashboard);
router.get('/telecallers', getMyTelecallers);

module.exports = router;
