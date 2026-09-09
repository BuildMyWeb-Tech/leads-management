/**
 * syncToSheets.js — Non-fatal Sheets sync called after MongoDB save.
 *
 * OPERATIONAL_LEADS (append-only audit timeline):
 *   trigger === 'create' → appendOperationalRow() — fast, pure
 *     append. Each new lead becomes exactly one new row, in the
 *     actual chronological allocation order (the "operational
 *     truth").
 *
 *   trigger === 'update' → NO-OP for Operational_Leads.
 *     Per client confirmation: "For append-only Operational_Leads,
 *     updates/reassignments should NOT modify historical
 *     Operational_Leads rows. Operational_Leads should behave like
 *     an audit timeline." Status changes, director reassignments
 *     (bulkAssign), etc. do not rewrite the original row.
 *     Director_View (the grouped report) reflects CURRENT state
 *     when it's next regenerated — see regenerateDirectorView below
 *     and its trigger points in allocationController.js,
 *     ocrController.js, leadsController.js, sheetsController.js.
 *
 * totalSynced = number of UNIQUE leads ever appended to
 * Operational_Leads (increments only on the 'create' path).
 *
 * DIRECTOR_VIEW (grouped reporting):
 *   regenerateDirectorView() is exported for controllers to call
 *   directly on the agreed trigger events:
 *     - OCR bulk import complete
 *     - CSV bulk import complete
 *     - Admin clicks "Sync All Leads"
 *     - Allocation configuration changes
 *   It is intentionally NOT called from syncToSheets() itself for
 *   'create'/'update' — per client requirement, it must NOT
 *   regenerate after every individual manual lead creation.
 */

const SheetSync = require('../models/SheetSync');
const Lead      = require('../models/Lead');
const {
  appendOperationalRow,
  buildRow,
  regenerateDirectorView: regenerateDirectorViewSheet,
} = require('./sheetsService');

const syncToSheets = async (populatedLead, trigger = 'create') => {
  try {
    const cfg = await SheetSync.findOne();
    if (!cfg) return;
    if (!cfg.spreadsheetId || !cfg.serviceAccountJson) return;
    if (!cfg.isActive) return;

    if (trigger === 'update') {
      // Operational_Leads is append-only — historical rows for this
      // lead (if any) are intentionally left unmodified. Director_View
      // will reflect the new state on its next regeneration trigger.
      return;
    }

    if (trigger === 'create' && !cfg.syncOnCreate) return;

    const result = await appendOperationalRow(cfg, populatedLead);

    if (result.success) {
      cfg.totalSynced = (cfg.totalSynced || 0) + 1;
      cfg.lastSyncAt     = new Date();
      cfg.lastSyncStatus = 'success';
      cfg.lastSyncError  = '';
      await cfg.save();
    }
  } catch (err) {
    console.error('[SheetsSync] append failed:', err.message);
    try {
      const cfg = await SheetSync.findOne();
      if (cfg) {
        const rowData = buildRow(populatedLead, cfg.columnOrder);
        cfg.retryQueue.push({
          leadId:    populatedLead._id,
          rowData,
          failedAt:  new Date(),
          attempts:  1,
          lastError: err.message,
        });
        cfg.lastSyncStatus = 'failed';
        cfg.lastSyncError  = err.message;
        await cfg.save();
      }
    } catch (queueErr) {
      console.error('[SheetsSync] retry queue push failed:', queueErr.message);
    }
  }
};

/**
 * regenerateDirectorView() — fetches ALL leads (sorted by createdAt
 * ascending, matching Operational_Leads' append order so each
 * director's bucket is internally chronological), groups them by
 * director, and rewrites the Director_View tab.
 *
 * Non-fatal: errors are caught and logged; callers should still
 * `.catch()` this since it's typically fired-and-forgotten after a
 * response has already been sent.
 *
 * No-ops silently if Sheets isn't configured/active — so it's safe
 * to call unconditionally from the trigger points (OCR import, CSV
 * import, sync-all, allocation config save) without each of those
 * needing to check configuration state first.
 */
const regenerateDirectorView = async () => {
  try {
    console.log('[DirectorView] regenerateDirectorView() called');
    const cfg = await SheetSync.findOne();
    if (!cfg) {
      console.log('[DirectorView] skipped: no SheetSync config document found');
      return { skipped: true, reason: 'Sheets not configured' };
    }
    if (!cfg.spreadsheetId || !cfg.serviceAccountJson) {
      console.log('[DirectorView] skipped: missing spreadsheetId or serviceAccountJson', {
        hasSpreadsheetId: !!cfg.spreadsheetId,
        hasCredentials: !!cfg.serviceAccountJson,
      });
      return { skipped: true, reason: 'Sheets not configured' };
    }
    if (!cfg.isActive) {
      console.log('[DirectorView] skipped: cfg.isActive is false');
      return { skipped: true, reason: 'Sheets sync inactive' };
    }

    console.log('[DirectorView] proceeding -- directorViewSheetName =', cfg.directorViewSheetName);

    // G.2 FIX (P1-005): project only the fields needed for the 4-column
    // Director_View (Director | Customer Name | Mobile Number | Remarks/Notes)
    // so we load ~200 bytes/lead instead of the full ~2KB document.
    // This prevents OOM at 50k+ leads during regeneration.
    const leads = await Lead.find(
      {},
      { assignedDirector: 1, name: 1, phone: 1, remarks: 1, notes: 1, createdAt: 1 }
    )
      .populate('assignedDirector', 'name')
      .sort({ createdAt: 1 })
      .lean();

    console.log(`[DirectorView] fetched ${leads.length} lead(s) for regeneration`);

    const result = await regenerateDirectorViewSheet(cfg, leads);

    console.log('[DirectorView] regenerateDirectorViewSheet result:', result);

    if (result.success) {
      cfg.lastDirectorViewSyncAt = new Date();
      await cfg.save();
    }
    return result;
  } catch (err) {
    console.error('[SheetsSync] Director_View regeneration failed:', err.message);
    console.error(err.stack);
    try {
      const cfg = await SheetSync.findOne();
      if (cfg) {
        cfg.lastSyncStatus = 'failed';
        cfg.lastSyncError  = `Director_View: ${err.message}`;
        await cfg.save();
      }
    } catch (_) {}
    return { success: false, error: err.message };
  }
};

module.exports = syncToSheets;
module.exports.regenerateDirectorView = regenerateDirectorView;