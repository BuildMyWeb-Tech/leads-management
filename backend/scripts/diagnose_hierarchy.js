/**
 * READ-ONLY hierarchy diagnostic.
 * Prints raw MongoDB field values for every user in the system,
 * then resolves each employee's managedBy chain against the allocator's
 * exact traversal logic.
 * DOES NOT modify any document.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const User     = require('../models/User');
const connectDB = require('../config/db');

async function diagnose() {
  await connectDB();

  // ─── 1. Fetch every user with the fields the allocator cares about ────────
  const allUsers = await User.find({})
    .select('_id name email role isActive managedBy')
    .lean();

  const byId = Object.fromEntries(allUsers.map(u => [String(u._id), u]));

  const section = (title) => {
    console.log('\n' + '─'.repeat(60));
    console.log(`  ${title}`);
    console.log('─'.repeat(60));
  };

  section('A. ALL USER DOCUMENTS (allocation-relevant fields)');
  const ORDER = ['admin', 'director', 'tl', 'telecaller'];
  const sorted = [...allUsers].sort((a, b) =>
    ORDER.indexOf(a.role) - ORDER.indexOf(b.role)
  );

  for (const u of sorted) {
    const mbRaw = u.managedBy;          // raw value as stored
    const mbStr = mbRaw == null
      ? String(mbRaw)                   // "null" or "undefined"
      : String(mbRaw);

    const mbResolved = mbRaw
      ? (byId[String(mbRaw)]?.name ?? '!! NOT FOUND IN DB')
      : '(none)';

    console.log(
      `  [${u.role.toUpperCase().padEnd(10)}] ${u.name.padEnd(20)} ` +
      `isActive=${JSON.stringify(u.isActive)?.padEnd(6)}  ` +
      `managedBy=${mbStr.padEnd(26)}  → ${mbResolved}`
    );
  }

  // ─── 2. Per-director: trace exactly what pickNextEmployee does ────────────
  section('B. ALLOCATION CHAIN TRACE (pickNextEmployee logic)');

  const directors = allUsers.filter(u => u.role === 'director');

  for (const dir of directors) {
    console.log(`\n  Director: ${dir.name}  (${dir._id})  isActive=${JSON.stringify(dir.isActive)}`);

    // Step 1 — engine query: role='tl', managedBy=directorId, isActive:true
    const tls = allUsers.filter(u =>
      u.role === 'tl' &&
      String(u.managedBy) === String(dir._id) &&
      u.isActive === true
    );
    const tlIds = tls.map(t => String(t._id));
    console.log(`    TLs (engine query isActive:true): [${tls.map(t => t.name).join(', ') || 'NONE'}]`);

    // Step 2 — engine query: role='telecaller', managedBy:{$in:tlIds}, isActive:true
    const candidates = allUsers.filter(u =>
      u.role === 'telecaller' &&
      tlIds.includes(String(u.managedBy)) &&
      u.isActive === true
    );
    console.log(`    Candidates (engine query isActive:true): [${candidates.map(c => c.name).join(', ') || 'NONE'}]`);

    // What $ne:false would return (corrected query)
    const tls_ne = allUsers.filter(u =>
      u.role === 'tl' &&
      String(u.managedBy) === String(dir._id) &&
      u.isActive !== false
    );
    const tlIds_ne = tls_ne.map(t => String(t._id));
    const candidates_ne = allUsers.filter(u =>
      u.role === 'telecaller' &&
      tlIds_ne.includes(String(u.managedBy)) &&
      u.isActive !== false
    );
    console.log(`    Candidates ($ne:false query):            [${candidates_ne.map(c => c.name).join(', ') || 'NONE'}]`);
  }

  // ─── 3. Resolve every telecaller's managedBy chain explicitly ────────────
  section('C. TELECALLER managedBy CHAIN RESOLUTION');

  const telecallers = allUsers.filter(u => u.role === 'telecaller');

  for (const emp of telecallers) {
    const mbRaw = emp.managedBy;
    const mbStr = mbRaw == null ? String(mbRaw) : String(mbRaw);
    const parent = mbRaw ? byId[mbStr] : null;

    let parentDesc;
    if (!mbRaw) {
      parentDesc = `NULL/UNDEFINED — no parent`;
    } else if (!parent) {
      parentDesc = `!! DANGLING REF — _id ${mbStr} not in DB`;
    } else {
      parentDesc = `${parent.role.toUpperCase()} "${parent.name}" (isActive=${JSON.stringify(parent.isActive)})`;
    }

    // Does the parent TL point to any director?
    let grandparent = null;
    let grandparentDesc = '';
    if (parent?.role === 'tl' && parent.managedBy) {
      grandparent = byId[String(parent.managedBy)];
      grandparentDesc = grandparent
        ? `  → ${grandparent.role.toUpperCase()} "${grandparent.name}"`
        : `  → !! DANGLING TL→DIRECTOR REF`;
    }

    // Will this employee be found by the engine for any director?
    const reachableByDirectors = directors.filter(dir => {
      const tlsForDir = allUsers.filter(u =>
        u.role === 'tl' &&
        String(u.managedBy) === String(dir._id) &&
        u.isActive === true
      ).map(t => String(t._id));
      return tlsForDir.includes(mbStr);
    });

    const visibleStrictly = emp.isActive === true;
    const reachableStr = reachableByDirectors.length > 0
      ? `reachable under [${reachableByDirectors.map(d => d.name).join(', ')}]`
      : `NOT reachable under any director (strict)`;

    console.log(`\n  ${emp.name}  isActive=${JSON.stringify(emp.isActive)}`);
    console.log(`    managedBy raw  : ${mbStr}`);
    console.log(`    managedBy →    : ${parentDesc}${grandparentDesc}`);
    console.log(`    isActive===true: ${visibleStrictly}`);
    console.log(`    Engine reach   : ${reachableStr}`);
  }

  // ─── 4. Summary ──────────────────────────────────────────────────────────
  section('D. ROOT CAUSE SUMMARY');

  for (const emp of telecallers) {
    const mbRaw = emp.managedBy;
    const mbStr = mbRaw == null ? String(mbRaw) : String(mbRaw);
    const parent = mbRaw ? byId[mbStr] : null;

    const strictVisible = emp.isActive === true;

    const reachable = directors.some(dir => {
      const tlsForDir = allUsers.filter(u =>
        u.role === 'tl' &&
        String(u.managedBy) === String(dir._id) &&
        u.isActive === true
      ).map(t => String(t._id));
      return tlsForDir.includes(mbStr);
    });

    if (!reachable || !strictVisible) {
      const reasons = [];
      if (!strictVisible) reasons.push(`isActive is NOT true (value: ${JSON.stringify(emp.isActive)})`);
      if (!reachable) {
        if (!parent) reasons.push(`managedBy is null/missing → no TL parent`);
        else if (parent.role !== 'tl') reasons.push(`managedBy points to role=${parent.role}, not 'tl'`);
        else {
          // parent is a TL — check if that TL is under a director
          const tlUnderDir = directors.some(dir =>
            String(parent.managedBy) === String(dir._id) && parent.isActive === true
          );
          if (!tlUnderDir) reasons.push(`parent TL "${parent.name}" is NOT under any director (isActive=${JSON.stringify(parent.isActive)}, managedBy=${parent.managedBy})`);
          else reasons.push(`managedBy TL found but employee still missing — check isActive`);
        }
      }
      console.log(`\n  !! ${emp.name}: EXCLUDED from allocation`);
      reasons.forEach(r => console.log(`      Reason: ${r}`));
    } else {
      console.log(`\n     ${emp.name}: OK — reachable and isActive===true`);
    }
  }

  await mongoose.disconnect();
  console.log('\n' + '─'.repeat(60));
  console.log('  END DIAGNOSTIC');
  console.log('─'.repeat(60));
}

diagnose().catch(err => { console.error(err); process.exit(1); });
