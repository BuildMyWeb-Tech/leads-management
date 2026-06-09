const Lead = require('../models/Lead');
const { pickNextDirector } = require('../utils/allocationEngine');
const audit = require('../utils/auditService');   // FIXED: was missing, caused ERR_HTTP_HEADERS_SENT

/**
 * POST /api/ocr/check-duplicates
 */
const checkDuplicates = async (req, res) => {
  try {
    const { phones } = req.body;
    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ message: 'phones array is required' });
    }

    const normalise = (p) =>
      String(p).replace(/\s|-|\(|\)/g, '').replace(/^(\+91|91|0)/, '').slice(-10);

    const normalised = phones.map(normalise);

    const existing = await Lead.find({
      phone: { $in: normalised.map((p) => new RegExp(p + '$')) },
    }).select('name phone status assignedDirector').populate('assignedDirector', 'name');

    const dupMap = {};
    existing.forEach((lead) => {
      const norm = normalise(lead.phone);
      dupMap[norm] = {
        _id:      lead._id,
        name:     lead.name,
        status:   lead.status,
        director: lead.assignedDirector?.name || null,
      };
    });

    const results = phones.map((rawPhone) => {
      const norm = normalise(rawPhone);
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
 */
const importOcrLeads = async (req, res) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: 'leads array is required' });
    }

    const normalise = (p) =>
      String(p).replace(/\s|-|\(|\)/g, '').replace(/^(\+91|91|0)/, '').slice(-10);

    const seen   = new Set();
    const unique = [];
    for (const lead of leads) {
      const norm = normalise(lead.phone);
      if (!seen.has(norm)) { seen.add(norm); unique.push({ ...lead, _norm: norm }); }
    }

    const norms       = unique.map((l) => l._norm);
    const existing    = await Lead.find({
      phone: { $in: norms.map((p) => new RegExp(p + '$')) },
    }).select('phone');
    const existingSet = new Set(existing.map((l) => normalise(l.phone)));

    const toInsert = [];
    const skipped  = [];

    for (const lead of unique) {
      if (existingSet.has(lead._norm)) {
        skipped.push({ phone: lead.phone, name: lead.name, reason: 'duplicate' });
        continue;
      }
      const leadData = {
        name:   lead.name   || 'Unknown',
        phone:  lead._norm,
        source: lead.source || 'Other',
        notes:  lead.notes  || '',
        status: 'New',
      };
      try {
        const pick = await pickNextDirector();
        if (pick) { leadData.assignedDirector = pick.directorId; leadData.status = 'Allocated'; }
      } catch (_) {}
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

  } catch (err) {
    // Guard: only send error if headers not already sent
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
  }
};

module.exports = { checkDuplicates, importOcrLeads };