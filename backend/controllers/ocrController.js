const Lead = require('../models/Lead');
const { normalisePhone, normaliseForDedupe } = require('../utils/phoneUtils');
const { pickNextDirector } = require('../utils/allocationEngine');
const syncToSheets = require('../utils/syncToSheets');
const { regenerateDirectorView } = require('../utils/syncToSheets');
const audit = require('../utils/auditService');   // FIXED: was missing, caused ERR_HTTP_HEADERS_SENT
const { generateLeadId } = require('../utils/leadIdGenerator');   // PHASE C
const { findExistingLeadsByPhones } = require('../utils/leadDuplicateCheck'); // PHASE E
const { applyLeadBusinessRulesToPlainData } = require('../utils/leadBusinessRules'); // PHASE E

// ── Phase 11C — name validation (mirrors frontend ocrEngine.js) ─
// Defensive re-check on the server: a client could call /ocr/import
// directly (bypassing the frontend extractor), so the same blacklist
// and validation rules are re-applied here before insert.
const NO_NAME = 'No Name';

const NAME_BLACKLIST = [
  'Settings', 'Edit', 'Share', 'Contacts', 'Unknown', 'Back', 'Done',
  'Cancel', 'More', 'Search', 'Call', 'Message', 'Add', 'Menu',
  'Recent', 'Home', 'Chats', 'Status', 'Calls', 'WhatsApp', 'Telegram',
  'Truecaller',
];
const NAME_BLACKLIST_PHRASES = [
  'add contact',
  'block & report spam',
  'block and report spam',
  'help & feedback',
  'help and feedback',
  'contact info from phone',
  'lookup',
];
const BLACKLIST_SET = new Set(NAME_BLACKLIST.map((w) => w.toLowerCase()));

// Returns a valid display name, or NO_NAME if the input fails validation:
//   - 2–50 chars after trim
//   - contains at least one letter
//   - not numbers-only / symbols-only
//   - not an exact blacklist word or phrase match
const sanitiseName = (raw) => {
  const t = String(raw || '').trim();

  if (t.length < 2 || t.length > 50) return NO_NAME;
  if (!/[a-zA-Z]/.test(t)) return NO_NAME;          // must contain letters
  if (/^\d+$/.test(t)) return NO_NAME;               // numbers only
  if (/^[^a-zA-Z0-9]+$/.test(t)) return NO_NAME;     // symbols only

  const lower = t.toLowerCase();
  if (BLACKLIST_SET.has(lower)) return NO_NAME;
  if (NAME_BLACKLIST_PHRASES.includes(lower)) return NO_NAME;

  return t;
};

/**
 * POST /api/ocr/check-duplicates
 */
const checkDuplicates = async (req, res) => {
  try {
    const { phones } = req.body;
    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ message: 'phones array is required' });
    }

    // normaliseForDedupe strips all non-digits for comparison —
    // works for any country (not India-only like the old +91 strip).
    const normalised = phones.map(normaliseForDedupe);

    // PHASE E FIX: bounded query — only fetches leads whose phone
    // could match one of the given candidates, never the whole
    // collection (see utils/leadDuplicateCheck.js).
    const existing = await findExistingLeadsByPhones(Lead, phones);

    const dupMap = {};
    existing.forEach((lead) => {
      const key = normaliseForDedupe(lead.phone);
      dupMap[key] = {
        _id:      lead._id,
        name:     lead.name,
        status:   lead.status,
        director: lead.assignedDirector?.name || null,
      };
    });

    const results = phones.map((rawPhone) => {
      const norm = normaliseForDedupe(rawPhone);
      return {
        phone:       rawPhone,
        normalised:  norm,
        isDuplicate: !!dupMap[norm],
        existing:    dupMap[norm] || null,
      };
    });

    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/ocr/import
 *
 * On success, each newly inserted lead is appended to
 * Operational_Leads (via syncToSheets 'create'), and Director_View
 * is regenerated ONCE after the whole batch completes — per client
 * requirement: "Regenerate Director_View automatically ... after OCR
 * bulk imports complete." This avoids N regenerations for N leads.
 */
const importOcrLeads = async (req, res) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: 'leads array is required' });
    }

    const seen   = new Set();
    const unique = [];
    for (const lead of leads) {
      // normalisePhone cleans for storage; normaliseForDedupe for dedup keying
      const cleaned = normalisePhone(lead.phone);
      if (!cleaned) continue; // skip unparseable phone strings
      const dedupeKey = normaliseForDedupe(cleaned);
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        unique.push({ ...lead, _clean: cleaned, _norm: dedupeKey });
      }
    }

    // PHASE E FIX: bounded query — only fetches leads whose phone
    // could match one of THIS batch's cleaned phone numbers, never
    // the whole collection.
    const existingLeads = await findExistingLeadsByPhones(Lead, unique.map((l) => l._clean));
    const existingSet   = new Set(existingLeads.map((l) => normaliseForDedupe(l.phone)));

    const toInsert = [];
    const skipped  = [];

    for (const lead of unique) {
      if (existingSet.has(lead._norm)) {
        skipped.push({ phone: lead.phone, name: lead.name, reason: 'duplicate' });
        continue;
      }
      const leadData = {
        // Phase 11C: re-validate name server-side. Frontend already
        // sends "No Name" for unrecognised lines, but a direct API
        // call could send "Settings" etc — sanitiseName() catches that.
        name:   sanitiseName(lead.name),
        phone:  lead._clean,  // store the cleaned phone (not the raw input)
        source: lead.source || 'Other',
        notes:  lead.notes  || '',
        status: 'New',
      };
      try {
        // Adaptive Quota-Based Round Robin — one pick per lead,
        // preserving interleaved cycle order across the whole batch
        // (not just within this request — picks continue from the
        // persisted cycleRemaining/currentPointer).
        const pick = await pickNextDirector();
        if (pick) { leadData.assignedDirector = pick.directorId; leadData.status = 'Allocated'; }
      } catch (_) {}
      // PHASE C: insertMany() below bypasses Lead.js's pre('save')
      // hook, so OCR-imported leads need leadId assigned explicitly —
      // same atomic Phase B generator used everywhere else.
      try {
        leadData.leadId = await generateLeadId(new Date());
      } catch (e) {
        console.error('[OCR Import] leadId generation failed for a row:', e.message);
      }
      // PHASE E: insertMany() below bypasses Lead.js's pre('save')
      // hook, so priority escalation / plot-field cleanup — normally
      // applied there — must be applied explicitly here, using the
      // exact same rule logic (no second implementation).
      applyLeadBusinessRulesToPlainData(leadData);
      toInsert.push(leadData);
    }

    const inserted = toInsert.length > 0
      ? await Lead.insertMany(toInsert, { ordered: false })
      : [];

    // FIXED: send response FIRST, then fire non-fatal audit (prevents ERR_HTTP_HEADERS_SENT)
    res.json({
      message:  `${inserted.length} lead(s) imported, ${skipped.length} skipped`,
      imported: inserted.length,
      skipped,
    });

    // Non-fatal audit — called AFTER response is sent
    try { audit.leadImportedOCR(req, inserted.length, skipped.length); } catch (_) {}

    // Append each newly-inserted lead to Operational_Leads
    // (fast path, no Director_View regen per-lead).
    if (inserted.length > 0) {
      try {
        const populated = await Lead.find({ _id: { $in: inserted.map((l) => l._id) } })
          .populate('assignedDirector', 'name email')
          .populate('assignedTelecaller', 'name email');
        for (const lead of populated) {
          syncToSheets(lead, 'create');
        }
      } catch (e) {
        console.error('[OCR Import] Operational_Leads sync failed:', e.message);
      }

      // Director_View — regenerate ONCE for the whole batch.
      // Non-fatal; runs after the response has been sent.
      regenerateDirectorView().catch((e) =>
        console.error('[OCR Import] Director_View regen failed:', e.message)
      );
    }

  } catch (err) {
    // Guard: only send error if headers not already sent
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
};

module.exports = { checkDuplicates, importOcrLeads, sanitiseName };