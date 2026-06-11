/**
 * sheetsService.js — Google Sheets API wrapper.
 *
 * KEY CHANGE from previous version:
 *   Old: appendRow() → always adds a new row (causes duplicates on update)
 *   New: upsertRow()  → finds existing row by leadId in a hidden column,
 *        updates it in place. If not found, appends a new row.
 *
 * Strategy:
 *   - Column A..N = visible data columns (Name, Phone, etc.)
 *   - Last hidden column = LeadId (MongoDB _id)
 *     Used as the lookup key to find & overwrite existing rows.
 *
 * totalSynced = number of UNIQUE leads ever synced (not number of operations).
 */

const { google } = require('googleapis');

// ── Build authorised Sheets client ────────────────────────────
const getSheetsClient = (serviceAccountJson) => {
  let creds;
  try {
    creds = typeof serviceAccountJson === 'string'
      ? JSON.parse(serviceAccountJson)
      : serviceAccountJson;
  } catch {
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
  name:             'Name',
  phone:            'Phone',
  email:            'Email',
  director:         'Director',
  telecaller:       'Telecaller',
  status:           'Status',
  source:           'Source',
  budget:           'Budget',
  notes:            'Notes',
  createdAt:        'Created Date',
  updatedAt:        'Updated Date',
  propertyInterest: 'Property Interest',
};

// ── Format a date with time ───────────────────────────────────
const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-IN', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// ── Build visible row from a populated Lead doc ───────────────
const buildRow = (lead, columnOrder) => {
  const fieldMap = {
    name:             lead.name             || '',
    phone:            lead.phone            || '',
    email:            lead.email            || '',
    director:         lead.assignedDirector?.name   || '',
    telecaller:       lead.assignedTelecaller?.name || '',
    status:           lead.status           || '',
    source:           lead.source           || '',
    budget:           lead.budget           || '',
    notes:            lead.notes            || '',
    propertyInterest: lead.propertyInterest || '',
    createdAt:        formatDate(lead.createdAt),
    updatedAt:        formatDate(lead.updatedAt),
  };
  return columnOrder.map((col) => fieldMap[col] ?? '');
};

// ── Convert column index (0-based) to A1 letter notation ─────
const colLetter = (idx) => {
  let s = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// ── Ensure header row exists (idempotent) ─────────────────────
// Writes: visible column headers + hidden "LeadId" column at the end
const ensureHeader = async (sheets, spreadsheetId, sheetName, columnOrder) => {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:ZZ1`,
    });
    const firstRow = res.data.values?.[0];
    if (firstRow && firstRow.length > 0) return; // Already exists

    const headers = [
      ...columnOrder.map((col) => COLUMN_LABELS[col] || col),
      'LeadId', // hidden lookup column
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody:      { values: [headers] },
    });
  } catch (e) {
    console.warn('ensureHeader failed:', e.message);
  }
};

// ── Find the row number of a lead by its _id ─────────────────
// Reads the hidden LeadId column (last column) and returns the
// 1-based row index, or null if not found.
const findLeadRow = async (sheets, spreadsheetId, sheetName, columnOrder, leadId) => {
  try {
    const idColLetter = colLetter(columnOrder.length); // one after the last data col
    const range       = `${sheetName}!${idColLetter}:${idColLetter}`;

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const col = res.data.values || [];

    for (let i = 1; i < col.length; i++) { // start at 1 to skip header row
      if (col[i]?.[0] === String(leadId)) {
        return i + 1; // 1-based row number (row 1 = header, data starts at 2)
      }
    }
    return null;
  } catch {
    return null;
  }
};

// ── Upsert a single lead: update row if exists, append if new ─
const upsertRow = async (config, lead) => {
  if (!config.isActive || !config.spreadsheetId || !config.serviceAccountJson) {
    return { skipped: true, reason: 'Sheets sync not configured or inactive' };
  }

  const sheets    = getSheetsClient(config.serviceAccountJson);
  const colOrder  = config.columnOrder || ['name','phone','director','telecaller','status','source','budget','notes','createdAt'];
  const rowData   = buildRow(lead, colOrder);
  const fullRow   = [...rowData, String(lead._id)]; // append hidden LeadId at end

  await ensureHeader(sheets, config.spreadsheetId, config.sheetName, colOrder);

  const existingRowNum = await findLeadRow(
    sheets, config.spreadsheetId, config.sheetName, colOrder, lead._id
  );

  if (existingRowNum) {
    // Row exists → UPDATE in place
    const endCol = colLetter(fullRow.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId:    config.spreadsheetId,
      range:            `${config.sheetName}!A${existingRowNum}:${endCol}${existingRowNum}`,
      valueInputOption: 'RAW',
      requestBody:      { values: [fullRow] },
    });
    return { success: true, action: 'updated', rowNum: existingRowNum, rowData };
  } else {
    // Row does not exist → APPEND new row
    await sheets.spreadsheets.values.append({
      spreadsheetId:    config.spreadsheetId,
      range:            `${config.sheetName}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody:      { values: [fullRow] },
    });
    return { success: true, action: 'inserted', rowData };
  }
};

// Keep old appendRow name as alias so syncToSheets.js doesn't need changes
const appendRow = upsertRow;

// ── Verify connection ─────────────────────────────────────────
const verifyConnection = async (serviceAccountJson, spreadsheetId, sheetName = 'Leads') => {
  const sheets = getSheetsClient(serviceAccountJson);
  const meta   = await sheets.spreadsheets.get({ spreadsheetId });
  const title  = meta.data.properties?.title || 'Untitled';

  const existingSheets = meta.data.sheets?.map((s) => s.properties?.title) || [];
  if (!existingSheets.includes(sheetName)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
  }
  return { success: true, spreadsheetTitle: title, sheetName };
};

// ── Bulk sync: rewrite entire sheet cleanly ───────────────────
// Each lead gets exactly ONE row. LeadId hidden in last column.
// totalSynced reflects unique leads (rows written), not operations.
const bulkSync = async (config, leads) => {
  const sheets   = getSheetsClient(config.serviceAccountJson);
  const colOrder = config.columnOrder || ['name','phone','director','telecaller','status','source','budget','notes','createdAt'];

  const headers = [
    ...colOrder.map((col) => COLUMN_LABELS[col] || col),
    'LeadId',
  ];
  const rows = leads.map((lead) => [
    ...buildRow(lead, colOrder),
    String(lead._id),
  ]);

  // Clear sheet then write header + all rows in one call
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.spreadsheetId,
    range:         `${config.sheetName}!A:ZZ`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId:    config.spreadsheetId,
    range:            `${config.sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody:      { values: [headers, ...rows] },
  });

  return { success: true, count: leads.length };
};

module.exports = { appendRow, upsertRow, verifyConnection, bulkSync, buildRow, COLUMN_LABELS };