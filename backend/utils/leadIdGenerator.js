/**
 * leadIdGenerator.js — Concurrency-safe human-readable Lead ID.
 *
 * Format: DDMMYYYYNNNN
 *   DDMMYYYY  — capture date
 *   NNNN      — 4-digit daily sequence, starting at 0001, resetting
 *               every calendar day
 *
 * Examples:
 *   08 Sep 2026, 1st lead  → 080920260001
 *   08 Sep 2026, 2nd lead  → 080920260002
 *   09 Sep 2026, 1st lead  → 090920260001
 *
 * CONCURRENCY:
 *   The sequence is not computed by counting existing leads or by an
 *   in-memory counter (both are unsafe under concurrent requests).
 *   Instead each calendar day owns one Counter document
 *   (_id: "leadId:DDMMYYYY"), and the sequence is advanced with a
 *   single atomic MongoDB operation:
 *
 *     Counter.findOneAndUpdate(
 *       { _id: key },
 *       { $inc: { seq: 1 } },
 *       { upsert: true, new: true }
 *     )
 *
 *   findOneAndUpdate with $inc is atomic at the document level in
 *   MongoDB, so two simultaneous requests for the same day can never
 *   receive the same sequence number, and no separate locking is
 *   required.
 */

const Counter = require('../models/Counter');

const pad2 = (n) => String(n).padStart(2, '0');

// Pure, DB-free formatting helpers — kept separate so they can be
// unit-tested without a database connection.
const formatDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}${d.getFullYear()}`;
};

const formatLeadId = (dateKey, seq) => `${dateKey}${String(seq).padStart(4, '0')}`;

// `counterModel` is injectable for testing (default: the real Mongoose
// Counter model). Production callers should never pass this argument.
const nextSequenceForDate = async (date = new Date(), counterModel = Counter) => {
  const dateKey = formatDateKey(date);
  const counter = await counterModel.findOneAndUpdate(
    { _id: `leadId:${dateKey}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return counter.seq;
};

const generateLeadId = async (date = new Date(), counterModel = Counter) => {
  const dateKey = formatDateKey(date);
  const seq     = await nextSequenceForDate(date, counterModel);
  return formatLeadId(dateKey, seq);
};

module.exports = { generateLeadId, nextSequenceForDate, formatDateKey, formatLeadId };
