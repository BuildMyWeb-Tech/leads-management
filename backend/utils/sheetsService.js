/**
 * sheetsService.js — Google Sheets API wrapper.
 *
 * All Sheets logic lives here so controllers stay thin.
 * MongoDB is always updated first. Sheet operations are
 * non-fatal — if they fail, data is queued for retry.
 *
 * Authentication: Service Account JSON (key stored in DB,
 * never in env or source). Admin pastes the JSON once via UI.
 *
 * API used: sheets.spreadsheets.values.append (appendRow)
 *           sheets.spreadsheets.values.get    (verifySheet)
 *           sheets.spreadsheets.batchUpdate   (ensureHeader)
 */

const { google } = require('googleapis');

// ── Build authorised Sheets client ────────────────────────────
const getSheetsClient = (serviceAccountJson) => {
  let creds;
  try {
    creds = typeof serviceAccountJson === 'string'
      ? JSON.parse(serviceAccountJson)
      : serviceAccountJson;
  } catch (e) {
    throw new Error('Invalid service account JSON — check your credentials');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
};

// ── Column labels for header row ─────────────────────────────
const COLUMN_LABELS = {
  name:        'Name',
  phone:       'Phone',
  email:       'Email',
  director:    'Director',
  telecaller:  'Telecaller',
  status:      'Status',
  source:      'Source',
  budget:      'Budget',
  notes:       'Notes',
  createdAt:   'Created Date',
  updatedAt:   'Updated Date',
  propertyInterest: 'Property Interest',
};

// ── Build a row array from a populated Lead doc ───────────────
const buildRow = (lead, columnOrder) => {
  const directorName   = lead.assignedDirector?.name   || '';
  const telecallerName = lead.assignedTelecaller?.name || '';

  const fieldMap = {
    name:             lead.name             || '',
    phone:            lead.phone            || '',
    email:            lead.email            || '',
    director:         directorName,
    telecaller:       telecallerName,
    status:           lead.status           || '',
    source:           lead.source           || '',
    budget:           lead.budget           || '',
    notes:            lead.notes            || '',
    propertyInterest: lead.propertyInterest || '',
    createdAt: lead.createdAt
      ? new Date(lead.createdAt).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : '',
    updatedAt: lead.updatedAt
      ? new Date(lead.updatedAt).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : '',
  };

  return columnOrder.map((col) => fieldMap[col] ?? '');
};

// ── Ensure header row exists (idempotent) ─────────────────────
const ensureHeader = async (sheets, spreadsheetId, sheetName, columnOrder) => {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:Z1`,
    });

    const firstRow = res.data.values?.[0];
    if (firstRow && firstRow.length > 0) return; // Header already exists

    // Write header
    const headers = columnOrder.map((col) => COLUMN_LABELS[col] || col);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  } catch (e) {
    // Non-fatal — proceed even without header
    console.warn('ensureHeader failed:', e.message);
  }
};

// ── Append a single row ───────────────────────────────────────
const appendRow = async (config, lead) => {
  if (!config.isActive || !config.spreadsheetId || !config.serviceAccountJson) {
    return { skipped: true, reason: 'Sheets sync not configured or inactive' };
  }

  const sheets   = getSheetsClient(config.serviceAccountJson);
  const rowData  = buildRow(lead, config.columnOrder);

  await ensureHeader(sheets, config.spreadsheetId, config.sheetName, config.columnOrder);

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range:         `${config.sheetName}!A1`,
    valueInputOption:       'RAW',
    insertDataOption:       'INSERT_ROWS',
    requestBody: { values: [rowData] },
  });

  return { success: true, rowData };
};

// ── Verify connection (used by admin config UI) ───────────────
const verifyConnection = async (serviceAccountJson, spreadsheetId, sheetName = 'Leads') => {
  const sheets = getSheetsClient(serviceAccountJson);

  // Get spreadsheet metadata
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const title = meta.data.properties?.title || 'Untitled';

  // Check if sheet tab exists, create if not
  const existingSheets = meta.data.sheets?.map((s) => s.properties?.title) || [];
  if (!existingSheets.includes(sheetName)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: { properties: { title: sheetName } },
        }],
      },
    });
  }

  return { success: true, spreadsheetTitle: title, sheetName };
};

// ── Bulk sync: write all leads to sheet (used for manual sync) ─
const bulkSync = async (config, leads) => {
  if (!config.isActive || !config.spreadsheetId || !config.serviceAccountJson) {
    throw new Error('Sheets sync not configured or inactive');
  }

  const sheets = getSheetsClient(config.serviceAccountJson);

  // Build header + all rows
  const headers = config.columnOrder.map((col) => COLUMN_LABELS[col] || col);
  const rows    = leads.map((lead) => buildRow(lead, config.columnOrder));

  // Clear the sheet first, then write header + all rows
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.spreadsheetId,
    range:         `${config.sheetName}!A:Z`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range:         `${config.sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers, ...rows] },
  });

  return { success: true, count: rows.length };
};

module.exports = { appendRow, verifyConnection, bulkSync, buildRow, COLUMN_LABELS };
