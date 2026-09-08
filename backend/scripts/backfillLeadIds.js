/**
 * backfillLeadIds.js — OPTIONAL, NOT AUTO-RUN, migration/backfill script.
 *
 * ============================================================
 *  DO NOT RUN THIS AUTOMATICALLY. DO NOT RUN AS PART OF ANY
 *  BUILD/DEPLOY STEP. This must be run manually and deliberately,
 *  only after explicit approval, ideally against a fresh backup.
 * ============================================================
 *
 * WHAT THIS DOES:
 *   Assigns a leadId (DDMMYYYYNNNN, see utils/leadIdGenerator.js) to
 *   every existing Lead document that does not already have one.
 *
 *   - Leads are processed in ascending createdAt order, so IDs are
 *     assigned using each lead's ORIGINAL creation date (via its
 *     existing createdAt/captureDate), producing chronologically
 *     sensible historical IDs rather than backdating everything to
 *     "today".
 *   - Uses the exact same atomic Counter-based sequence generator as
 *     new leads, so backfilled IDs cannot collide with IDs generated
 *     for brand-new leads created concurrently.
 *   - IDEMPOTENT: only touches documents where leadId is missing
 *     (null/undefined). Safe to re-run — already-backfilled leads are
 *     skipped, never re-numbered.
 *   - Does NOT touch any other field. Does NOT delete anything.
 *   - Does NOT modify .env or DB connection settings.
 *
 * HOW TO RUN (manually, after review/approval):
 *   node backend/scripts/backfillLeadIds.js
 *
 * Add --dry-run to see what WOULD be assigned without writing anything:
 *   node backend/scripts/backfillLeadIds.js --dry-run
 */

const mongoose = require('mongoose');
const dotenv   = require('dotenv');
dotenv.config();

const Lead = require('../models/Lead');
const { generateLeadId } = require('../utils/leadIdGenerator');

const DRY_RUN = process.argv.includes('--dry-run');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB${DRY_RUN ? ' (DRY RUN — no writes will be made)' : ''}`);

  const missing = await Lead.find({ $or: [{ leadId: null }, { leadId: { $exists: false } }] })
    .sort({ createdAt: 1 })
    .select('_id createdAt captureDate leadId');

  console.log(`Found ${missing.length} lead(s) without a leadId.`);

  let updated = 0;
  for (const lead of missing) {
    const sourceDate = lead.captureDate || lead.createdAt || new Date();
    const leadId = await generateLeadId(sourceDate);

    if (DRY_RUN) {
      console.log(`[dry-run] ${lead._id} -> ${leadId}`);
    } else {
      await Lead.updateOne({ _id: lead._id, leadId: null }, { $set: { leadId } });
      console.log(`${lead._id} -> ${leadId}`);
    }
    updated++;
  }

  console.log(`${DRY_RUN ? 'Would update' : 'Updated'} ${updated} lead(s).`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
