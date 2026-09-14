const Attendance = require('../models/Attendance');
const User       = require('../models/User');
const { getISTDateString } = require('../utils/dateHelper');

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

module.exports = { markPresent, getTodayStatus, getPresentEmployees };
