const mongoose = require('mongoose');

/**
 * SheetSyncConfig — singleton document.
 * Stores Google Sheets credentials, sheet ID, and sync settings.
 * Also stores a queue of failed rows for retry.
 */
const sheetSyncSchema = new mongoose.Schema(
  {
    // Google Sheets target
    spreadsheetId:  { type: String, default: '' },
    sheetName:      { type: String, default: 'Leads' },

    // Service account credentials (stored as JSON string — never logged)
    serviceAccountJson: { type: String, default: '' },

    // Sync behaviour
    isActive:       { type: Boolean, default: false },
    syncOnCreate:   { type: Boolean, default: true  },
    syncOnUpdate:   { type: Boolean, default: true  },

    // Column mapping — which Lead fields map to which sheet columns (A, B, C…)
    // Default order: Name | Phone | Director | Telecaller | Status | Source | Budget | Notes | Created Date
    columnOrder: {
      type: [String],
      default: ['name','phone','director','telecaller','status','source','budget','notes','createdAt'],
    },

    // Sync statistics
    totalSynced:  { type: Number, default: 0 },
    lastSyncAt:   { type: Date,   default: null },
    lastSyncStatus: { type: String, enum: ['success','failed','never'], default: 'never' },
    lastSyncError:  { type: String, default: '' },

    // Failed row retry queue: { leadId, rowData, failedAt, attempts }
    retryQueue: [
      {
        leadId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
        rowData:   { type: [String] },
        failedAt:  { type: Date, default: Date.now },
        attempts:  { type: Number, default: 1 },
        lastError: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('SheetSync', sheetSyncSchema);
