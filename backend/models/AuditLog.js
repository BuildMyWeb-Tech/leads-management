const mongoose = require('mongoose');

/**
 * AuditLog — immutable event record for every significant action.
 *
 * Actions tracked:
 *   Lead:   created | updated | deleted | status_changed | assigned | bulk_assigned | imported
 *   User:   login | logout | created | updated | deactivated
 *   System: allocation_run | allocation_config_changed | sheets_synced | ocr_import
 *
 * Each document is write-once — never updated.
 * TTL: auto-purge after 365 days (configurable).
 * Indexed for fast filtering by action, user, lead, date.
 */
const auditLogSchema = new mongoose.Schema(
  {
    // Who did it
    actor: {
      _id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
      name:  { type: String, default: 'System' },
      email: { type: String, default: '' },
      role:  { type: String, default: '' },
    },

    // What happened
    action: {
      type: String,
      required: true,
      enum: [
        // Lead actions
        'lead_created',
        'lead_updated',
        'lead_deleted',
        'lead_status_changed',
        'lead_assigned_director',
        'lead_assigned_telecaller',
        'lead_bulk_assigned',
        'lead_imported_csv',
        'lead_imported_ocr',
        // User actions
        'user_login',
        'user_logout',
        'user_created',
        'user_updated',
        'user_deactivated',
        // System actions
        'allocation_run',
        'allocation_config_changed',
        'sheets_synced',
        'ocr_import',
      ],
      index: true,
    },

    // What it was done to
    target: {
      type:    { type: String, enum: ['lead', 'user', 'system', 'config'], default: 'lead' },
      _id:     { type: mongoose.Schema.Types.ObjectId, index: true },
      name:    { type: String, default: '' },   // lead name or user name
      phone:   { type: String, default: '' },   // lead phone (for easy searching)
    },

    // What changed (before/after for key fields)
    changes: {
      before: { type: mongoose.Schema.Types.Mixed, default: null },
      after:  { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // Human-readable summary
    description: { type: String, default: '' },

    // Request metadata
    meta: {
      ip:        { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
    // Logs are immutable — disable versioning
    versionKey: false,
  }
);

// Compound indexes for common query patterns
auditLogSchema.index({ 'actor._id': 1, createdAt: -1 });
auditLogSchema.index({ 'target._id': 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// Auto-purge after 365 days
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
