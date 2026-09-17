const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  markPresent,
  getTodayStatus,
  getPresentEmployees,
  getOwnHistory,
  getAttendanceReport,
  getEmployeeHistory,
  manageAttendance,
} = require('../controllers/attendanceController');

router.post('/mark-present',           protect, authorize('telecaller'),               markPresent);
router.get('/today',                   protect, authorize('telecaller'),               getTodayStatus);
router.get('/employees/present',       protect, authorize('admin', 'director', 'tl'),  getPresentEmployees);
router.get('/history',                 protect, authorize('telecaller'),               getOwnHistory);
router.get('/report',                  protect, authorize('admin', 'director', 'tl'),  getAttendanceReport);
router.get('/employee/:id/history',    protect, authorize('admin', 'director', 'tl'),  getEmployeeHistory);
router.post('/manage',                 protect, authorize('admin', 'director'),          manageAttendance);

module.exports = router;
