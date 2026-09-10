/**
 * sheetsService.js — Google Sheets API wrapper.
 *
 * TWO-SHEET STRUCTURE (Operational_Leads + Director_View):
 *
 *   Operational_Leads (append-only, configurable columns):
 *     - Existing upsertRow()/bulkSync()/columnOrder behaviour is
 *       PRESERVED UNCHANGED for backward compatibility.
 *     - New: appendOperationalRow() — pure append, no row lookup,
 *       used as the fast path for every lead create/import. Each
 *       lead still gets exactly one row over time (new leads are
 *       appended; this function is not called again for the same
 *       lead on update — see syncToSheets.js).
 *
 *   Director_View (grouped reporting, FIXED columns):
 *     - Always exactly 4 columns, in this order:
 *         Director | Customer Name | Mobile Number | Remarks / Notes
 *       (Status was removed -- Director_View is regenerated
 *       infrequently, so its Status column went stale almost
 *       immediately after telecallers update lead status. MongoDB
 *       remains the source of truth for status.)
 *     - regenerateDirectorView(): fetches leads, groups by director
 *       (preserving each director's internal chronological order),
 *       and rewrites the entire Director_View tab. Called only on
 *       the trigger events described in syncToSheets.js — never on
 *       every single lead create.
 *
 * KEY CHANGE from previous version:
 *   Old: appendRow() → always adds a new row (causes duplicates on update)
 *   upsertRow()       → finds existing row by leadId in a hidden column,
 *                        updates it in place. If not found, appends a new row.
 *   (Both preserved — still used for Operational_Leads single-lead
 *   sync-by-id and "Sync all leads now".)
 *
 * Strategy for Operational_Leads:
 *   - Column A..N = visible data columns (Name, Phone, etc.)
 *   - Last hidden column = LeadId (MongoDB _id)
 *     Used as the lookup key to find & overwrite existing rows.
 *
 * totalSynced = number of UNIQUE leads ever synced to Operational_Leads
 * (not number of operations).
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

// ── Column labels for header row (Operational_Leads) ─────────
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

// ── Fixed Director_View column headers (client requirement) ──
// Order is significant: Director, Customer Name, Mobile Number,
// Status, Remarks / Notes. This NEVER changes regardless of
// Operational_Leads' columnOrder configuration.
const DIRECTOR_VIEW_HEADERS = [
  'Director',
  'Customer Name',
  'Mobile Number',
  'Remarks / Notes',
];

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

// ── Build visible row from a populated Lead doc (Operational_Leads,
// configurable columnOrder — unchanged from previous version) ─────
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

// ── Build a Director_View row — ALWAYS the fixed 4 columns ────
// Director | Customer Name | Mobile Number | Remarks / Notes
//   - Status column removed (see DIRECTOR_VIEW_HEADERS comment).
//   - Remarks / Notes defaults to '' (blank) — uses lead.notes.
// I2-006: remarks takes priority over notes for the Remarks/Notes column
const buildDirectorViewRow = (lead) => ([
  lead.assignedDirector?.name || '',
  lead.name   || '',
  lead.phone  || '',
  lead.remarks || lead.notes || '',
]);

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

// ── Ensure a sheet/tab exists (idempotent) ────────────────────
// Creates the tab if missing. Used by both Operational_Leads and
// Director_View since either may not exist yet on a fresh spreadsheet.
const ensureSheetExists = async (sheets, spreadsheetId, sheetName) => {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = meta.data.sheets?.map((s) => s.properties?.title) || [];
    if (!existingSheets.includes(sheetName)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
    }
  } catch (e) {
    console.warn(`ensureSheetExists(${sheetName}) failed:`, e.message);
  }
};

// ── Ensure header row exists (idempotent) — Operational_Leads ─
// Writes: visible column headers + hidden "LeadId" column at the end
const ensureHeader = async (sheets, spreadsheetId, sheetName, columnOrder) => {
  try {
    await ensureSheetExists(sheets, spreadsheetId, sheetName);

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

// ── Find the row number of a lead by its _id (Operational_Leads) ─
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

// ── Upsert a single lead into Operational_Leads: update row if
// exists, append if new (UNCHANGED from previous version — still
// used for single-lead-by-id sync and "Sync all leads now") ──────
const upsertRow = async (config, lead) => {
  if (!config.isActive || !config.spreadsheetId || !config.serviceAccountJson) {
    return { skipped: true, reason: 'Sheets sync not configured or inactive' };
  }

  const sheets    = getSheetsClient(config.serviceAccountJson);
  const colOrder  = config.columnOrder || ['name','phone','director','status','source','budget','notes','createdAt'];
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

// Keep old appendRow name as alias so existing callers don't need changes
const appendRow = upsertRow;

// ── NEW — Append-only fast path for Operational_Leads ─────────
// Used for every lead create/import (manual, OCR, CSV). Does NOT
// look up existing rows — always appends. This is the "operational
// timeline" / audit-log behaviour: each allocation event becomes a
// new row in chronological order, never rewritten.
//
// Each lead still gets exactly one row over its lifetime IF this is
// the only write path used for it (i.e. it's never also passed to
// upsertRow). syncToSheets.js routes 'create' through this function
// and treats 'update' as a no-op for Operational_Leads (see that
// file for the full rationale).
const appendOperationalRow = async (config, lead) => {
  if (!config.isActive || !config.spreadsheetId || !config.serviceAccountJson) {
    return { skipped: true, reason: 'Sheets sync not configured or inactive' };
  }

  const sheets   = getSheetsClient(config.serviceAccountJson);
  const colOrder = config.columnOrder || ['name','phone','director','status','source','budget','notes','createdAt'];
  const rowData  = buildRow(lead, colOrder);
  const fullRow  = [...rowData, String(lead._id)];

  await ensureHeader(sheets, config.spreadsheetId, config.sheetName, colOrder);

  await sheets.spreadsheets.values.append({
    spreadsheetId:    config.spreadsheetId,
    range:            `${config.sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: [fullRow] },
  });

  return { success: true, action: 'inserted', rowData };
};

// ── Verify connection ─────────────────────────────────────────
// Ensures BOTH Operational_Leads and Director_View tabs exist.
const verifyConnection = async (
  serviceAccountJson,
  spreadsheetId,
  sheetName = 'Operational_Leads',
  directorViewSheetName = 'Director_View',
) => {
  const sheets = getSheetsClient(serviceAccountJson);
  const meta   = await sheets.spreadsheets.get({ spreadsheetId });
  const title  = meta.data.properties?.title || 'Untitled';

  const existingSheets = meta.data.sheets?.map((s) => s.properties?.title) || [];
  const toCreate = [];
  if (!existingSheets.includes(sheetName))            toCreate.push(sheetName);
  if (!existingSheets.includes(directorViewSheetName)) toCreate.push(directorViewSheetName);

  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
  }
  return { success: true, spreadsheetTitle: title, sheetName, directorViewSheetName };
};

// ── Bulk sync: rewrite entire Operational_Leads sheet cleanly ──
// (UNCHANGED — still used by "Sync all leads now" for Operational_Leads)
// Each lead gets exactly ONE row. LeadId hidden in last column.
// totalSynced reflects unique leads (rows written), not operations.
const bulkSync = async (config, leads) => {
  const sheets   = getSheetsClient(config.serviceAccountJson);
  const colOrder = config.columnOrder || ['name','phone','director','status','source','budget','notes','createdAt'];

  await ensureSheetExists(sheets, config.spreadsheetId, config.sheetName);

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

// ── NEW — Regenerate Director_View: grouped-by-director report ──
// PHASE E: fixed stale comment — this is 4 columns, not 5. Status was
// removed by design (see the correct comment at the top of this file,
// lines 15-21); DIRECTOR_VIEW_HEADERS/buildDirectorViewRow below are
// the actual source of truth.
// Fixed 4 columns: Director | Customer Name | Mobile Number | Remarks / Notes
//
// Grouping: leads are bucketed by assignedDirector, each bucket
// preserving the leads' relative chronological order (the order
// they were passed in — callers should pass leads sorted by
// createdAt ascending, matching Operational_Leads' append order).
// Buckets are then concatenated in the order directors first appear
// in the input list (i.e. by each director's earliest lead) — this
// matches "all A's together, then all B's, etc." for the example in
// the client spec where A's first lead precedes B's first lead.
//
// Leads with no assignedDirector (unallocated) are grouped under an
// "Unassigned" bucket placed LAST.
//
// This REWRITES the entire Director_View tab (clear + rewrite),
// matching bulkSync's approach for Operational_Leads — appropriate
// since this is a regenerated report, not an append-only log.
const regenerateDirectorView = async (config, leads) => {
  if (!config.isActive || !config.spreadsheetId || !config.serviceAccountJson) {
    return { skipped: true, reason: 'Sheets sync not configured or inactive' };
  }

  const sheets    = getSheetsClient(config.serviceAccountJson);
  const sheetName = config.directorViewSheetName || 'Director_View';

  console.log(`[DirectorView] writing to sheet tab "${sheetName}" in spreadsheet ${config.spreadsheetId}`);

  await ensureSheetExists(sheets, config.spreadsheetId, sheetName);

  // Group by director, preserving first-seen order
  const UNASSIGNED_KEY = '__unassigned__';
  const groups = new Map(); // key -> { name, leads: [] }

  for (const lead of leads) {
    const dirId   = lead.assignedDirector?._id ? String(lead.assignedDirector._id) : null;
    const dirName = lead.assignedDirector?.name || '';
    const key = dirId || UNASSIGNED_KEY;

    if (!groups.has(key)) {
      groups.set(key, { name: key === UNASSIGNED_KEY ? 'Unassigned' : dirName, leads: [] });
    }
    groups.get(key).leads.push(lead);
  }

  // Move "Unassigned" bucket (if present) to the end
  const orderedKeys = [...groups.keys()];
  const unassignedIdx = orderedKeys.indexOf(UNASSIGNED_KEY);
  if (unassignedIdx !== -1) {
    orderedKeys.splice(unassignedIdx, 1);
    orderedKeys.push(UNASSIGNED_KEY);
  }

  const rows = [];
  for (const key of orderedKeys) {
    const group = groups.get(key);
    for (const lead of group.leads) {
      const row = buildDirectorViewRow(lead);
      // BUG FIX: buildDirectorViewRow() derives the Director column
      // from lead.assignedDirector?.name, which is '' for unassigned
      // leads. Override with the group's display name ("Unassigned")
      // so the sheet shows "Unassigned" rather than a blank cell --
      // matching the column-A grouping format from the client's
      // reference screenshot.
      row[0] = group.name || row[0];
      rows.push(row);
    }
  }

  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.spreadsheetId,
    range:         `${sheetName}!A:ZZ`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId:    config.spreadsheetId,
    range:            `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody:      { values: [DIRECTOR_VIEW_HEADERS, ...rows] },
  });

  console.log(`[DirectorView] wrote ${rows.length} row(s) to "${sheetName}"`);

  return { success: true, count: rows.length };
};

module.exports = {
  appendRow,
  upsertRow,
  appendOperationalRow,
  verifyConnection,
  bulkSync,
  regenerateDirectorView,
  buildRow,
  buildDirectorViewRow,
  COLUMN_LABELS,
  DIRECTOR_VIEW_HEADERS,
};