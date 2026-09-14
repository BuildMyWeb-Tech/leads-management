const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  markPresent,
  getTodayStatus,
  getPresentEmployees,
} = require('../controllers/attendanceController');

router.post('/mark-present',        protect, authorize('telecaller'),               markPresent);
router.get('/today',                protect, authorize('telecaller'),               getTodayStatus);
router.get('/employees/present',    protect, authorize('admin', 'director', 'tl'),  getPresentEmployees);

module.exports = router;
