const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    source: {
      type: String,
      enum: ['YouTube','Google Ads','Facebook','Instagram','Referral','Walk-in','Website','Other'],
      default: 'Other',
    },
    status: {
      type: String,
      enum: [
        'New','Allocated','Called','Follow Up',
        'Site Visit Planned','Site Visit Done',
        'Interested','Negotiation','Booked',
        'Wrong Number','Not Interested','Closed',
      ],
      default: 'New',
    },
    assignedDirector:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedTelecaller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes:            { type: String, default: '' },
    propertyInterest: { type: String, default: '' },
    budget:           { type: String, default: '' },
    // PHASE 5: telecaller can set a follow-up date
    followUpDate:     { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', leadSchema);
