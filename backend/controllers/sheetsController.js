const SheetSync  = require('../models/SheetSync');
const Lead       = require('../models/Lead');
const { appendRow, verifyConnection, bulkSync, COLUMN_LABELS } = require('../utils/sheetsService');

// ── Helper: get or create singleton config ────────────────────
const getConfig = async () => {
  let cfg = await SheetSync.findOne();
  if (!cfg) cfg = await SheetSync.create({});
  return cfg;
};

// ─────────────────────────────────────────────────────────────
// GET /api/sheets/config
// Returns current config (credentials redacted for security)
// ─────────────────────────────────────────────────────────────
const getSheetConfig = async (req, res) => {
  try {
    const cfg = await getConfig();
    // Never expose the full service account JSON — just confirm it exists
    const safe = cfg.toObject();
    safe.serviceAccountJson = cfg.serviceAccountJson
      ? '••••••• (configured)'
      : '';
    safe.hasCredentials = !!cfg.serviceAccountJson;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/sheets/config
// Save spreadsheet ID, sheet name, column order, toggles.
// Credentials only updated if provided (non-empty string).
// ─────────────────────────────────────────────────────────────
const saveSheetConfig = async (req, res) => {
  try {
    const {
      spreadsheetId,
      sheetName,
      serviceAccountJson,
      isActive,
      syncOnCreate,
      syncOnUpdate,
      columnOrder,
    } = req.body;

    const cfg = await getConfig();

    if (spreadsheetId  !== undefined) cfg.spreadsheetId  = spreadsheetId;
    if (sheetName      !== undefined) cfg.sheetName      = sheetName || 'Leads';
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
// Test connection with current credentials + sheet ID.
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
      cfg.sheetName || 'Leads',
    );

    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/sheets/sync-all
// Bulk sync ALL leads to sheet (overwrites sheet content).
// MongoDB data is never touched. Safe to run anytime.
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

    const result = await bulkSync(cfg, leads);

    // Update stats
    cfg.totalSynced    = result.count;
    cfg.lastSyncAt     = new Date();
    cfg.lastSyncStatus = 'success';
    cfg.lastSyncError  = '';
    await cfg.save();

    res.json({
      message: `${result.count} lead${result.count !== 1 ? 's' : ''} synced to Google Sheets`,
      count: result.count,
    });
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
// Manually push a single lead to Sheets.
// ─────────────────────────────────────────────────────────────
const syncSingleLead = async (req, res) => {
  try {
    const cfg = await getConfig();

    const lead = await Lead.findById(req.params.id)
      .populate('assignedDirector',   'name')
      .populate('assignedTelecaller', 'name');

    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const result = await appendRow(cfg, lead);
    if (result.skipped) {
      return res.json({ message: result.reason, skipped: true });
    }

    cfg.totalSynced    = (cfg.totalSynced || 0) + 1;
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
// Returns all available column fields with labels.
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
