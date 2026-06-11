/**
 * syncToSheets.js — Non-fatal Sheets upsert called after MongoDB save.
 *
 * On create: inserts a new row (one row per lead)
 * On update: finds existing row by leadId and updates it in place
 *
 * totalSynced = number of UNIQUE leads in sheet (increments only on new insert)
 */

const SheetSync = require('../models/SheetSync');
const { upsertRow, buildRow } = require('./sheetsService');

const syncToSheets = async (populatedLead, trigger = 'create') => {
  try {
    const cfg = await SheetSync.findOne();
    if (!cfg) return;
    if (trigger === 'create' && !cfg.syncOnCreate) return;
    if (trigger === 'update' && !cfg.syncOnUpdate) return;
    if (!cfg.spreadsheetId || !cfg.serviceAccountJson) return;

    // isActive check — still respect it for auto-sync
    if (!cfg.isActive) return;

    const result = await upsertRow(cfg, populatedLead);

    if (result.success) {
      // Only count unique leads (increment on first insert, not on updates)
      if (result.action === 'inserted') {
        cfg.totalSynced = (cfg.totalSynced || 0) + 1;
      }
      cfg.lastSyncAt     = new Date();
      cfg.lastSyncStatus = 'success';
      cfg.lastSyncError  = '';
      await cfg.save();
    }
  } catch (err) {
    console.error('[SheetsSync] upsert failed:', err.message);
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

module.exports = syncToSheets;