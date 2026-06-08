const Lead = require('../models/Lead');
const { pickNextDirector } = require('../utils/allocationEngine');

/**
 * POST /api/ocr/check-duplicates
 * Body: { phones: ['9999999999', ...] }
 * Returns which phones already exist in the DB.
 * Used by the frontend OCR preview modal before importing.
 */
const checkDuplicates = async (req, res) => {
  try {
    const { phones } = req.body;
    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ message: 'phones array is required' });
    }

    // Normalise: strip spaces, dashes, country code (+91 / 0)
    const normalise = (p) =>
      String(p)
        .replace(/\s|-|\(|\)/g, '')
        .replace(/^(\+91|91|0)/, '')
        .slice(-10);

    const normalised = phones.map(normalise);

    // Regex-based search to handle slight formatting differences in DB
    const existing = await Lead.find({
      phone: { $in: normalised.map((p) => new RegExp(p + '$')) },
    }).select('name phone status assignedDirector').populate('assignedDirector', 'name');

    // Build a lookup map: normalised phone → existing lead
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

    // Return per-phone result
    const results = phones.map((rawPhone) => {
      const norm = normalise(rawPhone);
      return {
        phone:     rawPhone,
        normalised: norm,
        isDuplicate: !!dupMap[norm],
        existing:   dupMap[norm] || null,
      };
    });

    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/ocr/import
 * Body: { leads: [{ name, phone, source?, notes? }] }
 * Skips duplicates (phones already in DB).
 * Auto-allocates via allocation engine.
 * Returns imported count + skipped list.
 */
const importOcrLeads = async (req, res) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: 'leads array is required' });
    }

    const normalise = (p) =>
      String(p)
        .replace(/\s|-|\(|\)/g, '')
        .replace(/^(\+91|91|0)/, '')
        .slice(-10);

    // Deduplicate within the incoming batch first
    const seen    = new Set();
    const unique  = [];
    for (const lead of leads) {
      const norm = normalise(lead.phone);
      if (!seen.has(norm)) { seen.add(norm); unique.push({ ...lead, _norm: norm }); }
    }

    // Check against DB
    const norms      = unique.map((l) => l._norm);
    const existing   = await Lead.find({
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
        name:   lead.name  || 'Unknown',
        phone:  lead._norm,        // store normalised 10-digit
        source: lead.source || 'Other',
        notes:  lead.notes  || '',
        status: 'New',
      };

      // Auto-allocation
      try {
        const pick = await pickNextDirector();
        if (pick) {
          leadData.assignedDirector = pick.directorId;
          leadData.status = 'Allocated';
        }
      } catch (_) {}

      toInsert.push(leadData);
    }

    const inserted = toInsert.length > 0
      ? await Lead.insertMany(toInsert, { ordered: false })
      : [];

    res.json({
      message:  `${inserted.length} lead(s) imported, ${skipped.length} skipped`,
      imported: inserted.length,
      skipped,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { checkDuplicates, importOcrLeads };
