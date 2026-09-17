/**
 * READ-ONLY diagnostic script — S.4 allocation debug.
 *
 * Usage (from /backend):
 *   node scripts/diagnose_allocation.js [directorEmail]
 *
 * Connects to the live DB, traces the exact pickNextEmployee logic
 * using real data, and prints a full diagnostic report.
 * DOES NOT modify any documents.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const User       = require('../models/User');
const Attendance = require('../models/Attendance');
const Lead       = require('../models/Lead');
const connectDB  = require('../config/db');
const { getISTDateString } = require('../utils/dateHelper');

async function diagnose() {
  await connectDB();

  const todayIST = getISTDateString();
  console.log('\n=== ALLOCATION DIAGNOSTIC REPORT ===');
  console.log(`IST business date: ${todayIST}\n`);

  // 1. List all directors
  const directors = await User.find({ role: 'director' })
    .select('_id name email isActive managedBy')
    .lean();

  console.log('=== A. DIRECTORS ===');
  for (const d of directors) {
    console.log(`  ${d.name} | isActive=${JSON.stringify(d.isActive)} | managedBy=${d.managedBy}`);
  }

  // 2. For each director, trace the full allocation chain
  for (const director of directors) {
    console.log(`\n=== B. DIRECTOR CHAIN: ${director.name} (${director._id}) ===`);

    // TLs — using STRICT isActive: true (current engine behavior)
    const tls_strict = await User.find({
      role: 'tl', managedBy: director._id, isActive: true,
    }).select('_id name isActive managedBy').lean();

    // TLs — using $ne: false (corrected behavior)
    const tls_ne = await User.find({
      role: 'tl', managedBy: director._id, isActive: { $ne: false },
    }).select('_id name isActive managedBy').lean();

    console.log(`  TLs (isActive:true)      : ${tls_strict.length} found: ${tls_strict.map(t => t.name).join(', ') || 'NONE'}`);
    console.log(`  TLs (isActive:{$ne:false}): ${tls_ne.length} found: ${tls_ne.map(t => t.name).join(', ') || 'NONE'}`);

    if (tls_ne.length === 0) {
      console.log('  !! No TLs found — allocation chain broken at TL level');
      continue;
    }

    const tlIds = tls_ne.map(t => t._id);

    // Employees — strict vs $ne
    const emps_strict = await User.find({
      role: 'telecaller', managedBy: { $in: tlIds }, isActive: true,
    }).select('_id name email isActive managedBy').lean();

    const emps_ne = await User.find({
      role: 'telecaller', managedBy: { $in: tlIds }, isActive: { $ne: false },
    }).select('_id name email isActive managedBy').lean();

    console.log(`\n  Employees (isActive:true)      : ${emps_strict.length}`);
    for (const e of emps_strict) {
      console.log(`    ✓ ${e.name} | isActive=${JSON.stringify(e.isActive)}`);
    }

    console.log(`\n  Employees (isActive:{$ne:false}): ${emps_ne.length}`);
    for (const e of emps_ne) {
      console.log(`    ✓ ${e.name} | isActive=${JSON.stringify(e.isActive)}`);
    }

    const missing = emps_ne.filter(ne => !emps_strict.find(s => String(s._id) === String(ne._id)));
    if (missing.length > 0) {
      console.log(`\n  !! MISSING from strict query (root cause candidates):`);
      for (const m of missing) {
        console.log(`    ✗ ${m.name} | isActive=${JSON.stringify(m.isActive)} ← field absent or not true`);
      }
    }

    // Attendance check for emps_ne (broader set)
    const allEmpIds = emps_ne.map(e => e._id);
    const presentRecords = await Attendance.find({
      businessDate: todayIST,
      employee: { $in: allEmpIds },
    }).select('employee').lean();

    const presentSet = new Set(presentRecords.map(r => String(r.employee)));

    console.log(`\n  Attendance today (${todayIST}):`);
    for (const e of emps_ne) {
      const present = presentSet.has(String(e._id));
      const inStrict = emps_strict.find(s => String(s._id) === String(e._id));
      const seenByEngine = inStrict && present;
      console.log(`    ${e.name}: Present=${present} | visibleToEngine=${seenByEngine ? 'YES' : 'NO (EXCLUDED)'}`);
    }

    // Lead counts (TODAY only — current engine logic)
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    istNow.setUTCHours(0, 0, 0, 0);
    const todayUTCStart = new Date(istNow.getTime() - IST_OFFSET_MS);

    const strictEligible = emps_strict
      .filter(e => presentSet.has(String(e._id)));

    if (strictEligible.length > 0) {
      const leadCounts = await Lead.aggregate([
        {
          $match: {
            assignedTelecaller: { $in: strictEligible.map(e => e._id) },
            createdAt: { $gte: todayUTCStart },
          },
        },
        { $group: { _id: '$assignedTelecaller', count: { $sum: 1 } } },
      ]);

      const countMap = Object.fromEntries(leadCounts.map(r => [String(r._id), r.count]));

      console.log(`\n  Workload (TODAY leads, engine-visible employees only):`);
      for (const e of strictEligible) {
        console.log(`    ${e.name}: ${countMap[String(e._id)] || 0} leads today`);
      }

      const sorted = [...strictEligible].sort((a, b) => {
        const diff = (countMap[String(a._id)] || 0) - (countMap[String(b._id)] || 0);
        if (diff !== 0) return diff;
        return String(a._id).localeCompare(String(b._id));
      });

      console.log(`\n  Engine would SELECT: ${sorted[0]?.name || 'null (no eligible)'}`);
    } else {
      console.log(`\n  Engine eligible employees: NONE (returns null → no telecaller assigned)`);
    }
  }

  // 3. Cross-check: employees visible in attendance report but invisible to engine
  console.log('\n=== C. CROSS-CHECK: Attendance report vs engine visibility ===');
  const allTelecallers = await User.find({ role: 'telecaller' })
    .select('_id name email isActive managedBy')
    .lean();

  for (const e of allTelecallers) {
    const visibleToUsers = e.isActive !== false;
    const visibleToEngine = e.isActive === true;
    if (visibleToUsers && !visibleToEngine) {
      console.log(`  !! ${e.name} (${e.email}): appears in user list but EXCLUDED by engine (isActive=${JSON.stringify(e.isActive)})`);
    }
  }

  await mongoose.disconnect();
  console.log('\n=== END DIAGNOSTIC ===');
}

diagnose().catch(err => { console.error(err); process.exit(1); });
