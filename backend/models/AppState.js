const mongoose = require('mongoose');

// Singleton document for application-level state that needs to
// persist across server restarts (e.g. scheduler last-fired dates).
// There is always exactly one document; use AppState.getOrCreate().
const appStateSchema = new mongoose.Schema(
  {
    lastReminderDate: { type: String, default: null }, // 'YYYY-MM-DD' in IST
  },
  { timestamps: true }
);

appStateSchema.statics.getOrCreate = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model('AppState', appStateSchema);
