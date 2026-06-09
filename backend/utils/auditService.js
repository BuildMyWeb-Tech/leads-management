/**
 * auditService.js — Write-once audit log utility.
 *
 * All callers use:
 *   audit.log(req, action, target, changes, description)
 *
 * Always non-fatal — never throws to the calling controller.
 * Uses fire-and-forget (no await needed at call sites).
 *
 * Helper shortcuts:
 *   audit.leadCreated(req, lead)
 *   audit.leadStatusChanged(req, lead, oldStatus, newStatus)
 *   audit.leadAssigned(req, lead, type, userId, userName)
 *   audit.leadDeleted(req, lead)
 *   audit.userLogin(req, user)
 *   audit.userCreated(req, newUser)
 *   audit.allocationRun(req, count, summary)
 *   audit.sheetsSync(req, count)
 *   audit.ocrImport(req, imported, skipped)
 */

const AuditLog = require('../models/AuditLog');

// ── Core log writer ───────────────────────────────────────────
const log = async (req, action, target = {}, changes = {}, description = '') => {
  try {
    const actor = req?.user
      ? {
          _id:   req.user._id,
          name:  req.user.name  || '',
          email: req.user.email || '',
          role:  req.user.role  || '',
        }
      : { name: 'System', email: '', role: 'system' };

    await AuditLog.create({
      actor,
      action,
      target: {
        type:  target.type  || 'lead',
        _id:   target._id   || null,
        name:  target.name  || '',
        phone: target.phone || '',
      },
      changes: {
        before: changes.before ?? null,
        after:  changes.after  ?? null,
      },
      description,
      meta: {
        ip:        req?.ip || req?.headers?.['x-forwarded-for'] || '',
        userAgent: req?.headers?.['user-agent']?.slice(0, 200) || '',
      },
    });
  } catch (err) {
    // Audit failure must NEVER break the main operation
    console.error('[Audit] Write failed:', err.message);
  }
};

// ── Lead shortcuts ────────────────────────────────────────────

const leadCreated = (req, lead) =>
  log(req, 'lead_created',
    { type: 'lead', _id: lead._id, name: lead.name, phone: lead.phone },
    { before: null, after: { status: lead.status, source: lead.source } },
    `Lead "${lead.name}" (${lead.phone}) created`
  );

const leadStatusChanged = (req, lead, oldStatus, newStatus) =>
  log(req, 'lead_status_changed',
    { type: 'lead', _id: lead._id, name: lead.name, phone: lead.phone },
    { before: { status: oldStatus }, after: { status: newStatus } },
    `Status changed: "${lead.name}" → ${oldStatus} → ${newStatus}`
  );

const leadUpdated = (req, lead, changedFields) =>
  log(req, 'lead_updated',
    { type: 'lead', _id: lead._id, name: lead.name, phone: lead.phone },
    { before: null, after: changedFields },
    `Lead "${lead.name}" updated`
  );

const leadDeleted = (req, lead) =>
  log(req, 'lead_deleted',
    { type: 'lead', _id: lead._id, name: lead.name, phone: lead.phone },
    { before: { status: lead.status, phone: lead.phone }, after: null },
    `Lead "${lead.name}" (${lead.phone}) deleted`
  );

const leadAssignedDirector = (req, lead, directorName) =>
  log(req, 'lead_assigned_director',
    { type: 'lead', _id: lead._id, name: lead.name, phone: lead.phone },
    { before: null, after: { assignedDirector: directorName } },
    `Lead "${lead.name}" assigned to director ${directorName}`
  );

const leadAssignedTelecaller = (req, lead, telecallerName) =>
  log(req, 'lead_assigned_telecaller',
    { type: 'lead', _id: lead._id, name: lead.name, phone: lead.phone },
    { before: null, after: { assignedTelecaller: telecallerName } },
    `Lead "${lead.name}" assigned to telecaller ${telecallerName}`
  );

const leadBulkAssigned = (req, count, directorName, telecallerName) =>
  log(req, 'lead_bulk_assigned',
    { type: 'lead' },
    { before: null, after: { count, director: directorName, telecaller: telecallerName } },
    `${count} lead(s) bulk-assigned${directorName ? ` to director ${directorName}` : ''}${telecallerName ? ` to telecaller ${telecallerName}` : ''}`
  );

const leadImportedCSV = (req, count) =>
  log(req, 'lead_imported_csv',
    { type: 'lead' },
    { before: null, after: { count } },
    `${count} leads imported from CSV`
  );

const leadImportedOCR = (req, imported, skipped) =>
  log(req, 'lead_imported_ocr',
    { type: 'lead' },
    { before: null, after: { imported, skipped } },
    `OCR import: ${imported} leads imported, ${skipped} skipped (duplicates)`
  );

// ── User shortcuts ────────────────────────────────────────────

const userLogin = (req, user) =>
  log(req, 'user_login',
    { type: 'user', _id: user._id, name: user.name },
    { before: null, after: { role: user.role } },
    `${user.name} (${user.role}) logged in`
  );

const userCreated = (req, newUser) =>
  log(req, 'user_created',
    { type: 'user', _id: newUser._id, name: newUser.name },
    { before: null, after: { role: newUser.role, email: newUser.email } },
    `User "${newUser.name}" (${newUser.role}) created`
  );

const userUpdated = (req, user, changes) =>
  log(req, 'user_updated',
    { type: 'user', _id: user._id, name: user.name },
    { before: null, after: changes },
    `User "${user.name}" updated`
  );

const userDeactivated = (req, user) =>
  log(req, 'user_deactivated',
    { type: 'user', _id: user._id, name: user.name },
    { before: { isActive: true }, after: { isActive: false } },
    `User "${user.name}" deactivated`
  );

// ── System shortcuts ──────────────────────────────────────────

const allocationRun = (req, count, summary) =>
  log(req, 'allocation_run',
    { type: 'system' },
    { before: null, after: { count, summary } },
    `Allocation engine: ${count} lead(s) allocated`
  );

const allocationConfigChanged = (req, ratios) =>
  log(req, 'allocation_config_changed',
    { type: 'config' },
    { before: null, after: { ratioCount: ratios?.length || 0 } },
    `Allocation config updated with ${ratios?.length || 0} director ratio(s)`
  );

const sheetsSync = (req, count) =>
  log(req, 'sheets_synced',
    { type: 'system' },
    { before: null, after: { count } },
    `Google Sheets full sync: ${count} leads exported`
  );

const ocrImport = (req, imported, skipped) =>
  log(req, 'ocr_import',
    { type: 'lead' },
    { before: null, after: { imported, skipped } },
    `OCR import: ${imported} leads imported, ${skipped} duplicates skipped`
  );

module.exports = {
  log,
  leadCreated, leadStatusChanged, leadUpdated, leadDeleted,
  leadAssignedDirector, leadAssignedTelecaller, leadBulkAssigned,
  leadImportedCSV, leadImportedOCR,
  userLogin, userCreated, userUpdated, userDeactivated,
  allocationRun, allocationConfigChanged,
  sheetsSync, ocrImport,
};
