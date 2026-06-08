/**
 * syncToSheets.js — Non-fatal Sheets append called after MongoDB save.
 *
 * Pattern used in leadsController:
 *   await Lead.save();         // MongoDB FIRST — always succeeds or throws
 *   syncToSheets(lead, 'create'); // Sheets SECOND — never throws to caller
 *
 * On failure: row is pushed to retryQueue for later retry.
 */

const SheetSync = require('../models/SheetSync');
const { appendRow } = require('./sheetsService');

const syncToSheets = async (populatedLead, trigger = 'create') => {
  try {
    const cfg = await SheetSync.findOne();
    if (!cfg || !cfg.isActive) return;
    if (trigger === 'create' && !cfg.syncOnCreate) return;
    if (trigger === 'update' && !cfg.syncOnUpdate) return;
    if (!cfg.spreadsheetId || !cfg.serviceAccountJson) return;

    const result = await appendRow(cfg, populatedLead);

    if (result.success) {
      cfg.totalSynced    = (cfg.totalSynced || 0) + 1;
      cfg.lastSyncAt     = new Date();
      cfg.lastSyncStatus = 'success';
      cfg.lastSyncError  = '';
      await cfg.save();
    }
  } catch (err) {
    console.error('[SheetsSync] append failed:', err.message);
    // Push to retry queue — MongoDB data is already safe
    try {
      const cfg = await SheetSync.findOne();
      if (cfg) {
        const { buildRow } = require('./sheetsService');
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

module.exports = syncToSheets;
