const Attendance = require('../models/Attendance');
const User       = require('../models/User');
const { getISTDateString } = require('../utils/dateHelper');
const audit      = require('../utils/auditService');

// POST /api/attendance/mark-present
// telecaller only — marks the calling employee present for today (IST)
const markPresent = async (req, res) => {
  try {
    const todayIST = getISTDateString();

    let doc;
    let created = false;

    try {
      const result = await Attendance.findOneAndUpdate(
        { employee: req.user._id, businessDate: todayIST },
        { $setOnInsert: { markedAt: new Date() } },
        { upsert: true, new: true, rawResult: true }
      );
      doc     = result.value;
      created = result.lastErrorObject?.upserted != null;
    } catch (err) {
      // E11000 duplicate key: concurrent upsert race — record already exists
      if (err.code === 11000) {
        doc = await Attendance.findOne({ employee: req.user._id, businessDate: todayIST });
        return res.status(200).json({ attendance: doc, alreadyMarked: true });
      }
      throw err;
    }

    if (created) {
      // Q2-007: audit first-time attendance mark only — not on repeat or concurrent
      audit.log(req, 'attendance_marked',
        { type: 'user', _id: req.user._id, name: req.user.name },
        { before: null, after: { businessDate: todayIST, markedAt: doc?.markedAt } },
        `${req.user.name} marked attendance for ${todayIST}`
      );
      return res.status(201).json({ attendance: doc, alreadyMarked: false });
    }
    return res.status(200).json({ attendance: doc, alreadyMarked: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/attendance/today
// telecaller only — returns today's attendance status for the calling employee
const getTodayStatus = async (req, res) => {
  try {
    const todayIST = getISTDateString();
    const doc = await Attendance.findOne({ employee: req.user._id, businessDate: todayIST });
    if (doc) {
      return res.json({ present: true, markedAt: doc.markedAt });
    }
    return res.json({ present: false, markedAt: null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/attendance/employees/present
// admin/director/tl — returns today's present employees
// TL: scoped to own team (managedBy === req.user._id)
const getPresentEmployees = async (req, res) => {
  try {
    const todayIST = getISTDateString();

    // Get all attendance records for today
    const records = await Attendance.find({ businessDate: todayIST }).lean();
    if (!records.length) return res.json([]);

    const presentIds = records.map((r) => r.employee);

    // Build user query — only active telecallers
    const userFilter = {
      _id:      { $in: presentIds },
      role:     'telecaller',
      isActive: true,
    };

    // TL: scope to own team only
    if (req.user.role === 'tl') {
      userFilter.managedBy = req.user._id;
    }

    const employees = await User.find(userFilter)
      .select('_id name role managedBy')
      .lean();

    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/attendance/history
// telecaller only — returns the calling employee's own attendance history (paginated)
const getOwnHistory = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const skip  = (page - 1) * limit;

    const [records, total] = await Promise.all([
      Attendance.find({ employee: req.user._id })
        .sort({ businessDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Attendance.countDocuments({ employee: req.user._id }),
    ]);

    res.json({ records, total, page, limit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/attendance/report?date=YYYY-MM-DD
// admin/director/tl — returns present/absent summary for all scoped telecallers on a date
const getAttendanceReport = async (req, res) => {
  try {
    const date = req.query.date || getISTDateString();

    // Build employee scope — TL sees only own team
    const empFilter = { role: 'telecaller' };
    if (req.user.role === 'tl') empFilter.managedBy = req.user._id;

    const [employees, attendanceRecords] = await Promise.all([
      User.find(empFilter).select('_id name email isActive managedBy').lean(),
      Attendance.find({ businessDate: date }).lean(),
    ]);

    const presentSet = new Set(attendanceRecords.map((r) => String(r.employee)));

    const result = employees.map((emp) => {
      const record = attendanceRecords.find((r) => String(r.employee) === String(emp._id)) || null;
      return {
        employee: { _id: emp._id, name: emp.name, email: emp.email, isActive: emp.isActive },
        businessDate: date,
        markedAt:     record ? record.markedAt : null,
        present:      presentSet.has(String(emp._id)),
        markedBy:     record ? { _id: emp._id, name: emp.name } : null,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/attendance/employee/:id/history?page=1&limit=30
// admin/director/tl — returns one employee's full attendance history
// TL: only allowed for employees in their own team (managedBy = req.user._id)
const getEmployeeHistory = async (req, res) => {
  try {
    // Validate the target employee exists and is a telecaller
    const empFilter = { _id: req.params.id, role: 'telecaller' };
    if (req.user.role === 'tl') empFilter.managedBy = req.user._id;

    const employee = await User.findOne(empFilter).select('_id name email isActive').lean();
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found or access denied' });
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const skip  = (page - 1) * limit;

    const [records, total] = await Promise.all([
      Attendance.find({ employee: req.params.id })
        .sort({ businessDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Attendance.countDocuments({ employee: req.params.id }),
    ]);

    res.json({ employee, records, total, page, limit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/attendance/manage
// admin/director only — mark an employee present or absent for today
// Director: scoped to own hierarchy (employees under their TLs)
const manageAttendance = async (req, res) => {
  try {
    const { employeeId, action } = req.body;

    if (!employeeId || !action) {
      return res.status(400).json({ message: 'employeeId and action are required' });
    }
    if (action !== 'present' && action !== 'absent') {
      return res.status(400).json({ message: 'action must be "present" or "absent"' });
    }

    const empFilter = { _id: employeeId, role: 'telecaller', isActive: { $ne: false } };

    // Director: scope to employees under own TLs
    if (req.user.role === 'director') {
      const tls = await User.find({
        role: 'tl', managedBy: req.user._id, isActive: { $ne: false },
      }).select('_id').lean();
      const tlIds = tls.map((t) => t._id);
      empFilter.managedBy = { $in: tlIds };
    }

    const employee = await User.findOne(empFilter).select('_id name').lean();
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found or access denied' });
    }

    const todayIST = getISTDateString();

    if (action === 'present') {
      let created = false;
      try {
        const result = await Attendance.findOneAndUpdate(
          { employee: employeeId, businessDate: todayIST },
          { $setOnInsert: { markedAt: new Date() } },
          { upsert: true, new: true, rawResult: true }
        );
        created = result.lastErrorObject?.upserted != null;
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
      audit.log(req, 'attendance_managed',
        { type: 'user', _id: employee._id, name: employee.name },
        { before: null, after: { businessDate: todayIST, action: 'present', managedBy: req.user.name } },
        `${req.user.name} marked ${employee.name} present for ${todayIST}`
      );
      return res.json({ message: `${employee.name} marked present`, present: true, created });
    }

    // action === 'absent': remove today's record
    const deleted = await Attendance.findOneAndDelete({
      employee: employeeId, businessDate: todayIST,
    });
    audit.log(req, 'attendance_managed',
      { type: 'user', _id: employee._id, name: employee.name },
      { before: { businessDate: todayIST }, after: { action: 'absent', managedBy: req.user.name } },
      `${req.user.name} marked ${employee.name} absent for ${todayIST}`
    );
    return res.json({ message: `${employee.name} marked absent`, present: false, removed: !!deleted });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { markPresent, getTodayStatus, getPresentEmployees, getOwnHistory, getAttendanceReport, getEmployeeHistory, manageAttendance };
