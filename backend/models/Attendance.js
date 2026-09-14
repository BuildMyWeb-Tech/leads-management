const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    employee:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    businessDate: { type: String, required: true }, // 'YYYY-MM-DD' in IST
    markedAt:     { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Unique: one record per employee per IST business day
attendanceSchema.index({ employee: 1, businessDate: 1 }, { unique: true });
// Fast "who is present today" query
attendanceSchema.index({ businessDate: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
