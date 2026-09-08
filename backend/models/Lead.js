const mongoose = require('mongoose');

// ── PHASE B — call-history sub-schema ──────────────────────────
// Was previously written to by controllers without being declared
// here, so Mongoose's default strict mode silently dropped it on
// save. Declaring it properly fixes that; shape matches exactly
// what leadsController.js / telecallerController.js already push.
const callHistoryEntrySchema = new mongoose.Schema(
  {
    status:    { type: String, default: '' },
    notes:     { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── PHASE B — site visit sub-schema ────────────────────────────
// History-ready: an array (not a single embedded object) so a lead
// can have multiple visits over time (reschedules, revisits) without
// a later schema change. plannedDate = expected/future date;
// completedDate = exact date the visit actually happened.
const siteVisitSchema = new mongoose.Schema(
  {
    status:        { type: String, enum: ['planned', 'completed', 'cancelled'], default: 'planned' },
    plannedDate:   { type: Date, default: null },
    completedDate: { type: Date, default: null },
    assignedAgent: { type: String, default: '' },
    notes:         { type: String, default: '' },
    createdAt:     { type: Date, default: Date.now },
  },
  { _id: true }
);

const leadSchema = new mongoose.Schema(
  {
    // ── Existing fields — unchanged, kept as the canonical stored
    // values. "Client Name" / "Mobile Number" are UI-label concerns
    // only; `name` and `phone` remain the DB fields (see Phase B
    // report — no clientName/mobileNumber duplicate fields).
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
    // PHASE B: this Date field already stores a full date+time value
    // (Mongo/Mongoose Date always carries time-of-day) — no separate
    // "nextFollowUpDate" field was added; this remains the single
    // canonical follow-up date+time.
    followUpDate:     { type: Date, default: null },

    // ── PHASE B — new fields ──────────────────────────────────

    // Human-readable, unique, auto-generated on creation (see
    // pre('save') hook below and utils/leadIdGenerator.js).
    // Not `required` at the schema level: existing leads have none,
    // and bulk insertMany() paths (CSV/OCR — out of scope for Phase B)
    // bypass the save-hook that generates it.
    leadId: { type: String, default: null },

    // Capture/creation date, distinct from createdAt (infra timestamp)
    // and from followUpDate (future action date). Defaulted so it is
    // always populated for new leads; existing leads simply won't
    // have it until a deliberate, explicit backfill (see
    // backend/scripts/backfillLeadIds.js — NOT auto-run).
    captureDate: { type: Date, default: Date.now },

    // Property type — kept alongside (not replacing) the existing
    // free-text propertyInterest, since existing data/UI may depend
    // on it and its actual values were not inspected/migrated here.
    propertyType: { type: String, enum: ['Plot', 'House'], default: null },

    // Only meaningful when propertyType === 'Plot'; left optional —
    // cross-field enforcement is a later (frontend/business) concern.
    plotSquareFeet: { type: String, enum: ['Below 1200', '1200', 'Above 1200'], default: null },

    targetLocation: { type: String, default: '' },

    purpose: { type: String, enum: ['Investment', 'Residential'], default: null },

    // Latest/current call summary — distinct from callHistory (full
    // historical list below).
    lastCallDetails: {
      dateTime:   { type: Date, default: null },
      discussion: { type: String, default: '' },
    },

    // Separate from the existing free-text `notes` field (not
    // removed, not merged) — captures the specific
    // objection/remarks concept from the new requirement.
    remarks: { type: String, default: '' },

    // Hot/Warm/Cold — schema-only in Phase B. No automatic
    // transition logic (Booking/Site-Visit → Hot, dashboard sorting,
    // etc.) is implemented here; that is explicitly a later phase.
    priority: { type: String, enum: ['Hot', 'Warm', 'Cold'], default: 'Cold' },

    // History-ready site visit list — see siteVisitSchema above.
    siteVisits: { type: [siteVisitSchema], default: [] },

    // Now properly declared (was previously read/written by
    // controllers but silently dropped by Mongoose strict mode).
    callHistory: { type: [callHistoryEntrySchema], default: [] },
  },
  { timestamps: true }
);

// ── PHASE B — auto-generate leadId on creation ─────────────────
// Runs on Lead.create()/doc.save() for new documents only. Does NOT
// run on insertMany() (CSV/OCR bulk import) — those paths are out of
// scope for Phase B and are documented as a known follow-up.
// Non-fatal: a leadId generation failure must never block lead
// creation in Phase B.
leadSchema.pre('save', async function (next) {
  if (this.isNew && !this.leadId) {
    try {
      const { generateLeadId } = require('../utils/leadIdGenerator');
      this.leadId = await generateLeadId(this.captureDate || new Date());
    } catch (e) {
      console.error('[Lead] leadId generation failed:', e.message);
    }
  }
  next();
});

// ── PHASE B — indexes ───────────────────────────────────────────
// Chosen from actual existing query patterns (getLeads filters,
// director/telecaller dashboard scoping, follow-up lookups) plus the
// fields this phase introduces. Deliberately NOT unique on `phone`:
// existing data has no guaranteed uniqueness and dedupe is handled
// at the application layer (utils/phoneUtils.js) — a unique index
// here could break inserts against real existing data.
leadSchema.index({ leadId: 1 }, { unique: true, sparse: true });
leadSchema.index({ phone: 1 });
leadSchema.index({ assignedDirector: 1 });
leadSchema.index({ assignedTelecaller: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ followUpDate: 1 });
leadSchema.index({ priority: 1 });
leadSchema.index({ captureDate: 1 });

module.exports = mongoose.model('Lead', leadSchema);
