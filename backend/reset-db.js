/**
 * reset-db.js — A2S CRM Complete Database Reset
 *
 * Deletes ALL records in the correct dependency order to avoid
 * orphaned references. Run from the backend/ directory.
 *
 * Usage:
 *   cd backend
 *   node reset-db.js                    ← deletes everything EXCEPT admin users
 *   node reset-db.js --all              ← deletes EVERYTHING including all users
 *   node reset-db.js --leads-only       ← deletes only leads + audit logs
 *   node reset-db.js --dry-run          ← shows counts without deleting anything
 *
 * Safety:
 *   - Requires typing "YES" to confirm before proceeding
 *   - Shows exactly how many records will be deleted
 *   - Keeps admin accounts by default (use --all to remove)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');

// ── Models ────────────────────────────────────────────────────
const Lead             = require('./models/Lead');
const User             = require('./models/User');
const AuditLog         = require('./models/AuditLog');
const AllocationConfig = require('./models/AllocationConfig');
const PushSubscription = require('./models/PushSubscription');
const SheetSync        = require('./models/SheetSync');

// ── CLI flags ─────────────────────────────────────────────────
const args        = process.argv.slice(2);
const ALL_USERS   = args.includes('--all');
const LEADS_ONLY  = args.includes('--leads-only');
const DRY_RUN     = args.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────
const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  gray:   (s) => `\x1b[90m${s}\x1b[0m`,
};

function ask(question) {
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function countAll() {
  const [leads, users, admins, auditLogs, allocation, pushSubs, sheetSync] =
    await Promise.all([
      Lead.countDocuments(),
      User.countDocuments(),
      User.countDocuments({ role: 'admin' }),
      AuditLog.countDocuments(),
      AllocationConfig.countDocuments(),
      PushSubscription.countDocuments(),
      SheetSync.countDocuments(),
    ]);
  return { leads, users, admins, auditLogs, allocation, pushSubs, sheetSync };
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n' + c.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(c.bold('  A2S CRM — Database Reset Script'));
  console.log(c.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━') + '\n');

  if (DRY_RUN) {
    console.log(c.yellow('  MODE: DRY RUN — no data will be deleted\n'));
  }
  if (LEADS_ONLY) {
    console.log(c.cyan('  MODE: Leads + Audit Logs only\n'));
  }
  if (ALL_USERS) {
    console.log(c.red('  MODE: ALL DATA including all user accounts\n'));
  }

  // Connect
  console.log(c.gray('  Connecting to MongoDB...'));
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log(c.green('  ✓ Connected\n'));

  // Count current records
  const counts = await countAll();

  console.log(c.bold('  Current database state:'));
  console.log(`  ├─ Leads             : ${c.yellow(counts.leads)}`);
  console.log(`  ├─ Users (total)     : ${c.yellow(counts.users)} (${counts.admins} admin${counts.admins !== 1 ? 's' : ''})`);
  console.log(`  ├─ Audit Logs        : ${c.yellow(counts.auditLogs)}`);
  console.log(`  ├─ Allocation Config : ${c.yellow(counts.allocation)}`);
  console.log(`  ├─ Push Subscriptions: ${c.yellow(counts.pushSubs)}`);
  console.log(`  └─ Sheet Sync Config : ${c.yellow(counts.sheetSync)}`);
  console.log('');

  // Calculate what will be deleted
  let willDelete = [];
  if (LEADS_ONLY) {
    willDelete = [
      { name: 'Leads',      count: counts.leads },
      { name: 'Audit Logs', count: counts.auditLogs },
    ];
  } else if (ALL_USERS) {
    willDelete = [
      { name: 'Leads',              count: counts.leads },
      { name: 'Audit Logs',         count: counts.auditLogs },
      { name: 'Push Subscriptions', count: counts.pushSubs },
      { name: 'Sheet Sync Config',  count: counts.sheetSync },
      { name: 'Allocation Config',  count: counts.allocation },
      { name: 'Users (ALL)',         count: counts.users },
    ];
  } else {
    // Default: keep admin users
    const nonAdmins = counts.users - counts.admins;
    willDelete = [
      { name: 'Leads',              count: counts.leads },
      { name: 'Audit Logs',         count: counts.auditLogs },
      { name: 'Push Subscriptions', count: counts.pushSubs },
      { name: 'Sheet Sync Config',  count: counts.sheetSync },
      { name: 'Allocation Config (reset cursor)', count: counts.allocation },
      { name: 'Directors + Telecallers', count: nonAdmins },
    ];
  }

  const totalWillDelete = willDelete.reduce((s, i) => s + i.count, 0);

  console.log(c.bold('  Will be deleted:'));
  willDelete.forEach((item, i) => {
    const prefix = i === willDelete.length - 1 ? '  └─' : '  ├─';
    console.log(`${prefix} ${item.name.padEnd(28)}: ${c.red(item.count)}`);
  });
  console.log('');
  console.log(`  ${c.bold('Total records to delete:')} ${c.red(c.bold(totalWillDelete))}\n`);

  if (DRY_RUN) {
    console.log(c.yellow('  Dry run complete. No changes made.'));
    await mongoose.disconnect();
    process.exit(0);
  }

  if (totalWillDelete === 0) {
    console.log(c.green('  Database is already empty. Nothing to delete.'));
    await mongoose.disconnect();
    process.exit(0);
  }

  // Confirmation prompt
  console.log(c.red(c.bold('  ⚠  THIS CANNOT BE UNDONE  ⚠')));
  console.log(c.red('  All selected data will be permanently deleted.\n'));
  const answer = await ask(c.bold('  Type "YES" to confirm: '));

  if (answer !== 'YES') {
    console.log('\n' + c.yellow('  Cancelled. No changes made.'));
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log('\n' + c.bold('  Deleting...') + '\n');

  // ── DELETION ORDER (dependencies first) ──────────────────
  //
  // Order matters:
  //  1. AuditLogs        — references Users + Leads (delete first)
  //  2. PushSubscriptions — references Users (delete before users)
  //  3. Leads            — references Users (delete before users)
  //  4. AllocationConfig — references Users (delete/reset before users)
  //  5. SheetSync        — standalone config
  //  6. Users            — delete last (others reference it)

  const results = [];

  // 1. Audit Logs
  {
    const r = await AuditLog.deleteMany({});
    results.push(`  ✓ AuditLog          : deleted ${c.green(r.deletedCount)} records`);
  }

  // 2. Push Subscriptions
  if (!LEADS_ONLY) {
    const r = await PushSubscription.deleteMany({});
    results.push(`  ✓ PushSubscription  : deleted ${c.green(r.deletedCount)} records`);
  }

  // 3. Leads
  {
    const r = await Lead.deleteMany({});
    results.push(`  ✓ Lead              : deleted ${c.green(r.deletedCount)} records`);
  }

  // 4. Allocation Config
  if (!LEADS_ONLY) {
    if (ALL_USERS) {
      // Full delete
      const r = await AllocationConfig.deleteMany({});
      results.push(`  ✓ AllocationConfig  : deleted ${c.green(r.deletedCount)} records`);
    } else {
      // Reset cursor to 0 but keep the ratios config
      const r = await AllocationConfig.updateMany({}, { $set: { cursor: 0 } });
      results.push(`  ✓ AllocationConfig  : reset cursor on ${c.green(r.modifiedCount)} records (ratios kept)`);
    }
  }

  // 5. Sheet Sync Config
  if (!LEADS_ONLY) {
    if (ALL_USERS) {
      const r = await SheetSync.deleteMany({});
      results.push(`  ✓ SheetSync         : deleted ${c.green(r.deletedCount)} records`);
    } else {
      // Keep config but reset sync stats
      const r = await SheetSync.updateMany({}, {
        $set: {
          totalSynced: 0,
          retryQueue: [],
          lastSyncAt: null,
          lastSyncStatus: 'never',
          lastSyncError: '',
        },
      });
      results.push(`  ✓ SheetSync         : reset stats on ${c.green(r.modifiedCount)} records (credentials kept)`);
    }
  }

  // 6. Users
  if (!LEADS_ONLY) {
    if (ALL_USERS) {
      const r = await User.deleteMany({});
      results.push(`  ✓ User              : deleted ${c.green(r.deletedCount)} records (ALL users)`);
    } else {
      // Delete directors and telecallers but KEEP admins
      const r = await User.deleteMany({ role: { $in: ['director', 'telecaller'] } });
      results.push(`  ✓ User              : deleted ${c.green(r.deletedCount)} non-admin users (admins kept)`);
    }
  }

  // ── Print results ─────────────────────────────────────────
  console.log(c.bold('  Results:'));
  results.forEach((r) => console.log(r));

  // ── Verify empty ──────────────────────────────────────────
  console.log('');
  const after = await countAll();
  console.log(c.bold('  Database state after reset:'));
  console.log(`  ├─ Leads             : ${after.leads === 0 ? c.green(0) : c.red(after.leads)}`);
  console.log(`  ├─ Users             : ${c.yellow(after.users)} (${after.admins} admin${after.admins !== 1 ? 's' : ''})`);
  console.log(`  ├─ Audit Logs        : ${after.auditLogs === 0 ? c.green(0) : c.red(after.auditLogs)}`);
  console.log(`  ├─ Allocation Config : ${c.yellow(after.allocation)}`);
  console.log(`  ├─ Push Subscriptions: ${after.pushSubs === 0 ? c.green(0) : c.red(after.pushSubs)}`);
  console.log(`  └─ Sheet Sync Config : ${c.yellow(after.sheetSync)}`);
  console.log('');
  console.log(c.green(c.bold('  ✓ Database reset complete!')));

  if (!ALL_USERS && !LEADS_ONLY) {
    console.log(c.gray('\n  Note: Admin accounts were preserved.'));
    console.log(c.gray('  Use --all to delete admin accounts too.'));
  }

  await mongoose.disconnect();
  console.log(c.gray('\n  Disconnected from MongoDB.\n'));
}

main().catch((err) => {
  console.error('\n' + c.red('  ERROR: ') + err.message);
  mongoose.disconnect();
  process.exit(1);
});