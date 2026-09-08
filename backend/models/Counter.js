const mongoose = require('mongoose');

/**
 * Counter — generic atomic sequence store.
 *
 * Used by utils/leadIdGenerator.js to produce concurrency-safe daily
 * sequence numbers for Lead IDs (DDMMYYYYNNNN). One document per
 * calendar day, e.g. _id: "leadId:08092026".
 *
 * Atomicity comes from MongoDB's findOneAndUpdate($inc, upsert:true),
 * which is a single atomic operation at the document level — safe
 * under concurrent requests without needing an in-memory lock.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

module.exports = mongoose.model('Counter', counterSchema);
