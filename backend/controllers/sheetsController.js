const SheetSync  = require('../models/SheetSync');
const Lead       = require('../models/Lead');
const {
  appendRow, upsertRow, verifyConnection, bulkSync, COLUMN_LABELS,
  regenerateDirectorView: regenerateDirectorViewSheet,
} = require('../utils/sheetsService');
const audit = require('../utils/auditService');

// ── Helper: get or create singleton config ────────────────────
const getConfig = async () => {
  let cfg = await SheetSync.findOne();
  if (!cfg) cfg = await SheetSync.create({});
  return cfg;
};

// ── Helper: extract spreadsheet ID from full URL or raw ID ────
// Handles all these input formats:
//   https://docs.google.com/spreadsheets/d/1Tl2oZFp.../edit?gid=0
//   https://docs.google.com/spreadsheets/d/1Tl2oZFp.../edit?usp=sharing
//   1Tl2oZFpDkn3jYIRvvoxxrbqpHdvSJ6UwwO3OrQ3a9Pg   ← already correct
const extractSpreadsheetId = (input) => {
  if (!input) return '';
  const trimmed = input.trim();

  // If it looks like a URL, extract the ID
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // Otherwise treat the whole string as the ID (already correct format)
  return trimmed;
};

// ─────────────────────────────────────────────────────────────
// GET /api/sheets/config
// ─────────────────────────────────────────────────────────────
const getSheetConfig = async (req, res) => {
  try {
    const cfg  = await getConfig();
    const safe = cfg.toObject();
    safe.serviceAccountJson = cfg.serviceAccountJson ? '••••••• (configured)' : '';
    safe.hasCredentials     = !!cfg.serviceAccountJson;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/sheets/config
// ─────────────────────────────────────────────────────────────
const saveSheetConfig = async (req, res) => {
  try {
    const {
      spreadsheetId,
      sheetName,
      directorViewSheetName,
      serviceAccountJson,
      isActive,
      syncOnCreate,
      syncOnUpdate,
      columnOrder,
    } = req.body;
 
    const cfg = await getConfig();
 
    if (spreadsheetId  !== undefined) cfg.spreadsheetId  = spreadsheetId;
    if (sheetName      !== undefined) cfg.sheetName      = sheetName || 'Operational_Leads';
    if (directorViewSheetName !== undefined) cfg.directorViewSheetName = directorViewSheetName || 'Director_View';
    if (isActive       !== undefined) cfg.isActive       = isActive;
    if (syncOnCreate   !== undefined) cfg.syncOnCreate   = syncOnCreate;
    if (syncOnUpdate   !== undefined) cfg.syncOnUpdate   = syncOnUpdate;
    if (columnOrder    && Array.isArray(columnOrder)) cfg.columnOrder = columnOrder;
 
    // Only update credentials if a new non-empty JSON string is provided
    if (serviceAccountJson && serviceAccountJson.trim() && serviceAccountJson !== '••••••• (configured)') {
      // Validate it's parseable JSON before storing
      try {
        JSON.parse(serviceAccountJson);
        cfg.serviceAccountJson = serviceAccountJson.trim();
      } catch {
        return res.status(400).json({ message: 'serviceAccountJson is not valid JSON' });
      }
    }
 
    await cfg.save();
 
    const safe = cfg.toObject();
    safe.serviceAccountJson = cfg.serviceAccountJson ? '••••••• (configured)' : '';
    safe.hasCredentials = !!cfg.serviceAccountJson;
 
    res.json(safe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
 

// ─────────────────────────────────────────────────────────────
// POST /api/sheets/verify
// Ensures both Operational_Leads and Director_View tabs exist.
// ─────────────────────────────────────────────────────────────
const verifySheetConnection = async (req, res) => {
  try {
    const cfg = await getConfig();

    if (!cfg.serviceAccountJson) {
      return res.status(400).json({ message: 'No service account credentials configured' });
    }
    if (!cfg.spreadsheetId) {
      return res.status(400).json({ message: 'No spreadsheet ID configured' });
    }

    const result = await verifyConnection(
      cfg.serviceAccountJson,
      cfg.spreadsheetId,
      cfg.sheetName || 'Operational_Leads',
      cfg.directorViewSheetName || 'Director_View',
    );

    // On successful verify, clear any previous errors
    cfg.lastSyncError  = '';
    await cfg.save();

    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/sheets/sync-all
//
// Full re-sync of BOTH tabs:
//   1. Operational_Leads — bulkSync (rewrite, one row per lead,
//      sorted by createdAt — same as before).
//   2. Director_View — regenerate (grouped by director).
//
// Per client requirement, "Admin clicks Sync All Leads" is one of
// the explicit Director_View regeneration triggers.
// ─────────────────────────────────────────────────────────────
const syncAll = async (req, res) => {
  try {
    const cfg = await getConfig();
 
    if (!cfg.serviceAccountJson || !cfg.spreadsheetId) {
      return res.status(400).json({ message: 'Sheets not configured. Add credentials and spreadsheet ID first.' });
    }
 
    const leads = await Lead.find({})
      .populate('assignedDirector',   'name')
      .populate('assignedTelecaller', 'name')
      .sort({ createdAt: 1 })
      .lean();
 
    // Pass a version of config that forces isActive=true for manual sync
    // so bulkSync/regenerateDirectorView work even when auto-sync toggle is OFF
    const activeCfg = { ...cfg.toObject(), isActive: true };

    const result = await bulkSync(activeCfg, leads);

    // Regenerate Director_View as part of the same manual sync
    const dvResult = await regenerateDirectorViewSheet(activeCfg, leads);
 
    // totalSynced = unique leads in sheet after this sync
    cfg.totalSynced    = result.count;
    cfg.lastSyncAt     = new Date();
    cfg.lastSyncStatus = 'success';
    cfg.lastSyncError  = '';
    if (dvResult.success) cfg.lastDirectorViewSyncAt = new Date();
    await cfg.save();
 
    res.json({
      message: `${result.count} lead${result.count !== 1 ? 's' : ''} synced to Operational_Leads, Director_View regenerated`,
      count: result.count,
      directorViewCount: dvResult.count || 0,
    });
    audit.sheetsSync(req, result.count);
  } catch (err) {
    // Update failure status
    try {
      const cfg = await getConfig();
      cfg.lastSyncStatus = 'failed';
      cfg.lastSyncError  = err.message;
      await cfg.save();
    } catch (_) {}
 
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/sheets/sync-lead/:id
// Manually push a single lead to Operational_Leads (upsert —
// unchanged). Does NOT regenerate Director_View (not one of the
// agreed trigger events for a single-lead manual push).
// ─────────────────────────────────────────────────────────────
const syncSingleLead = async (req, res) => {
  try {
    const cfg = await getConfig();
 
    const lead = await Lead.findById(req.params.id)
      .populate('assignedDirector',   'name')
      .populate('assignedTelecaller', 'name');
 
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
 
    const result = await upsertRow(cfg, lead);
    if (result.skipped) {
      return res.json({ message: result.reason, skipped: true });
    }
 
    // Only increment unique count on new insert (not on update)
    if (result.action === 'inserted') {
      cfg.totalSynced = (cfg.totalSynced || 0) + 1;
    }
    cfg.lastSyncAt     = new Date();
    cfg.lastSyncStatus = 'success';
    cfg.lastSyncError  = '';
    await cfg.save();
 
    res.json({ message: 'Lead appended to sheet', rowData: result.rowData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
 
// ─────────────────────────────────────────────────────────────
// POST /api/sheets/retry-queue
// Retry all failed rows in the retry queue.
// ─────────────────────────────────────────────────────────────
const retryQueue = async (req, res) => {
  try {
    const cfg = await getConfig();
 
    if (!cfg.retryQueue || cfg.retryQueue.length === 0) {
      return res.json({ message: 'Retry queue is empty', retried: 0 });
    }
 
    if (!cfg.serviceAccountJson || !cfg.spreadsheetId) {
      return res.status(400).json({ message: 'Sheets not configured' });
    }
 
    const { google } = require('googleapis');
    const creds      = JSON.parse(cfg.serviceAccountJson);
    const auth       = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets     = google.sheets({ version: 'v4', auth });
 
    let succeeded = 0;
    const remaining = [];
 
    for (const item of cfg.retryQueue) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId:    cfg.spreadsheetId,
          range:            `${cfg.sheetName}!A1`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [item.rowData] },
        });
        succeeded++;
      } catch (e) {
        remaining.push({ ...item.toObject(), attempts: item.attempts + 1, lastError: e.message });
      }
    }
 
    cfg.retryQueue     = remaining;
    cfg.lastSyncAt     = new Date();
    cfg.lastSyncStatus = remaining.length === 0 ? 'success' : 'failed';
    await cfg.save();
 
    res.json({ message: `${succeeded} row(s) retried successfully, ${remaining.length} still pending`, succeeded, remaining: remaining.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
 
// ─────────────────────────────────────────────────────────────
// DELETE /api/sheets/retry-queue
// Clear the retry queue.
// ─────────────────────────────────────────────────────────────
const clearRetryQueue = async (req, res) => {
  try {
    const cfg = await getConfig();
    cfg.retryQueue = [];
    await cfg.save();
    res.json({ message: 'Retry queue cleared' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
 
// ─────────────────────────────────────────────────────────────
// GET /api/sheets/column-options
// Returns all available column fields with labels (Operational_Leads only —
// Director_View columns are fixed and not configurable).
// ─────────────────────────────────────────────────────────────
const getColumnOptions = async (req, res) => {
  res.json(
    Object.entries(COLUMN_LABELS).map(([value, label]) => ({ value, label }))
  );
};
 
module.exports = {
  getSheetConfig,
  saveSheetConfig,
  verifySheetConnection,
  syncAll,
  syncSingleLead,
  retryQueue,
  clearRetryQueue,
  getColumnOptions,
};