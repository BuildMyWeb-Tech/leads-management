const mongoose = require('mongoose');

/**
 * SheetSyncConfig — singleton document.
 * Stores Google Sheets credentials, sheet ID, and sync settings.
 * Also stores a queue of failed rows for retry.
 *
 * TWO-TAB STRUCTURE (Operational_Leads + Director_View):
 *
 *   sheetName (existing field, repurposed):
 *     The OPERATIONAL sheet — append-only, actual chronological
 *     allocation sequence. Continues to support the existing
 *     configurable `columnOrder`. Default renamed from 'Leads' to
 *     'Operational_Leads' for new configs; existing configs keep
 *     whatever name they already have (no forced rename of an
 *     existing tab — see sheetsController migration note).
 *
 *   directorViewSheetName (NEW):
 *     The REPORTING sheet — grouped by director, fixed 5-column
 *     format (Director, Customer Name, Mobile Number, Status,
 *     Remarks / Notes). Regenerated (not appended) on the trigger
 *     events described in syncToSheets.js / allocationController.js
 *     / leadsController.js / ocrController.js.
 */
const sheetSyncSchema = new mongoose.Schema(
  {
    // Google Sheets target
    spreadsheetId:  { type: String, default: '' },

    // Operational (append-only) sheet tab name
    sheetName:      { type: String, default: 'Operational_Leads' },

    // NEW — Director_View (grouped reporting) sheet tab name
    directorViewSheetName: { type: String, default: 'Director_View' },

    // Service account credentials (stored as JSON string — never logged)
    serviceAccountJson: { type: String, default: '' },

    // Sync behaviour
    isActive:       { type: Boolean, default: false },
    syncOnCreate:   { type: Boolean, default: true  },
    syncOnUpdate:   { type: Boolean, default: true  },

    // Column mapping for the OPERATIONAL sheet only — Director_View
    // always uses its fixed 5-column format regardless of this value.
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

    // NEW — last time Director_View was regenerated (informational,
    // shown in the UI so admins know how fresh the grouped report is)
    lastDirectorViewSyncAt: { type: Date, default: null },

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