const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    source: {
      type: String,
      enum: ['YouTube', 'Google Ads', 'Facebook', 'Instagram', 'Referral', 'Walk-in', 'Website', 'Other'],
      default: 'Other',
    },
    // PHASE 1: expanded status pipeline (used fully from Phase 2 UI, stored from now)
    status: {
      type: String,
      enum: [
        'New',
        'Allocated',
        'Called',
        'Follow Up',
        'Site Visit Planned',
        'Site Visit Done',
        'Interested',
        'Negotiation',
        'Booked',
        'Wrong Number',
        'Not Interested',
        'Closed',
      ],
      default: 'New',
    },
    // PHASE 1: renamed fields — manager → director, employee → telecaller
    assignedDirector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedTelecaller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: { type: String, default: '' },
    propertyInterest: { type: String, default: '' },
    budget: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', leadSchema);
