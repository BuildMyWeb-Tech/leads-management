/**
 * A2S CRM — Fresh Allocation Engine Test Data Reset
 *
 * IMPORTANT:
 * - NEVER creates users
 * - NEVER updates users
 * - NEVER deletes users
 * - Clears Leads and Attendance for a clean allocation test
 * - Resets AQRR runtime state where supported
 *
 * Run:
 *   node scripts/resetAllocationTestData.js
 */

const dotenv = require('dotenv');

dotenv.config();

const connectDB = require('../config/db');
const mongoose = require('mongoose');

const Lead = require('../models/Lead');
const Attendance = require('../models/Attendance');
const AllocationConfig = require('../models/AllocationConfig');
const User = require('../models/User');

// ============================================================
// EXISTING USERS — READ ONLY
// ============================================================

const TEST_EMAILS = {
  admin: 'admin@gmail.com',

  directors: [
    'director1@gmail.com',
    'director2@gmail.com',
    'director3@gmail.com',
    'director4@gmail.com',
  ],

  tls: [
    'tl1@gmail.com',
  ],

  employees: [
    'employee1@gmail.com',
    'employee2@gmail.com',
    'employee3@gmail.com',
    'employee4@gmail.com',
  ],
};

// ============================================================
// HELPERS
// ============================================================

const divider = () => {
  console.log(
    '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
};

const printUser = (user) => {
  console.log(
    `  ${String(user.role).padEnd(10)} ` +
      `${String(user.name).padEnd(18)} ` +
      `${user.email.padEnd(28)} ` +
      `managedBy=${user.managedBy ? user.managedBy : 'null'} ` +
      `active=${user.isActive !== false}`
  );
};

// ============================================================
// RESET
// ============================================================

const reset = async () => {
  try {
    await connectDB();

    divider();
    console.log('  A2S CRM — Fresh Allocation Test Reset');
    divider();

    console.log('\n✓ Connected to MongoDB');
    console.log('✓ USER COLLECTION WILL NOT BE MODIFIED\n');

    // ========================================================
    // 1. READ-ONLY USER CHECK
    // ========================================================

    console.log('1. Checking existing users...\n');

    const configuredEmails = [
      TEST_EMAILS.admin,
      ...TEST_EMAILS.directors,
      ...TEST_EMAILS.tls,
      ...TEST_EMAILS.employees,
    ];

    const users = await User.find({
      email: {
        $in: configuredEmails,
      },
    })
      .select('name email role managedBy isActive')
      .lean();

    if (users.length === 0) {
      throw new Error(
        'No configured users found. This script does not create users.'
      );
    }

    const usersByEmail = new Map(
      users.map((user) => [user.email, user])
    );

    for (const email of configuredEmails) {
      const user = usersByEmail.get(email);

      if (!user) {
        console.log(`⚠ Missing user: ${email}`);
        continue;
      }

      printUser(user);
    }

    // ========================================================
    // 2. VALIDATE USER ROLES — READ ONLY
    // ========================================================

    console.log('\n2. Validating user roles...\n');

    for (const email of TEST_EMAILS.directors) {
      const user = usersByEmail.get(email);

      if (user && user.role !== 'director') {
        throw new Error(
          `${email} has role "${user.role}", expected "director".`
        );
      }
    }

    for (const email of TEST_EMAILS.tls) {
      const user = usersByEmail.get(email);

      if (user && user.role !== 'tl') {
        throw new Error(
          `${email} has role "${user.role}", expected "tl".`
        );
      }
    }

    for (const email of TEST_EMAILS.employees) {
      const user = usersByEmail.get(email);

      if (user && user.role !== 'telecaller') {
        throw new Error(
          `${email} has role "${user.role}", expected "telecaller".`
        );
      }
    }

    console.log('✓ User role validation passed.');

    // ========================================================
    // 3. DELETE ALL LEADS
    // ========================================================

    console.log('\n3. Clearing Lead collection...\n');

    const leadCount = await Lead.countDocuments({});

    const leadDeleteResult = await Lead.deleteMany({});

    console.log(`  Leads before reset : ${leadCount}`);
    console.log(
      `  Leads deleted      : ${leadDeleteResult.deletedCount}`
    );

    // ========================================================
    // 4. DELETE ALL ATTENDANCE
    // ========================================================

    console.log('\n4. Clearing Attendance collection...\n');

    const attendanceCount =
      await Attendance.countDocuments({});

    const attendanceDeleteResult =
      await Attendance.deleteMany({});

    console.log(
      `  Attendance before reset : ${attendanceCount}`
    );

    console.log(
      `  Attendance deleted      : ${attendanceDeleteResult.deletedCount}`
    );

    // ========================================================
    // 5. RESET AQRR RUNTIME STATE
    // ========================================================

    console.log('\n5. Resetting Director AQRR runtime state...\n');

    const allocationConfig =
      await AllocationConfig.findOne({});

    if (!allocationConfig) {
      console.log(
        '  ↷ No AllocationConfig found. Nothing to reset.'
      );
    } else {
      const update = {};

      if (
        Object.prototype.hasOwnProperty.call(
          allocationConfig.toObject(),
          'cycleRemaining'
        )
      ) {
        update.cycleRemaining = {};
      }

      if (
        Object.prototype.hasOwnProperty.call(
          allocationConfig.toObject(),
          'currentPointer'
        )
      ) {
        update.currentPointer = 0;
      }

      if (Object.keys(update).length > 0) {
        await AllocationConfig.updateOne(
          {
            _id: allocationConfig._id,
          },
          {
            $set: update,
          }
        );

        console.log(
          '  ✓ AQRR runtime state reset.'
        );
      } else {
        console.log(
          '  ↷ No supported AQRR runtime fields found.'
        );
      }
    }

    // ========================================================
    // 6. VERIFY USERS STILL EXIST
    // ========================================================

    console.log('\n6. Final user verification...\n');

    const finalUsers = await User.find({
      email: {
        $in: configuredEmails,
      },
    })
      .select('name email role managedBy isActive')
      .lean();

    console.log(
      `✓ Configured user records found: ${finalUsers.length}`
    );

    console.log(
      '✓ No User create/update/delete operation was performed.'
    );

    for (const user of finalUsers) {
      printUser(user);
    }

    // ========================================================
    // 7. FINAL DATABASE COUNTS
    // ========================================================

    const finalLeadCount =
      await Lead.countDocuments({});

    const finalAttendanceCount =
      await Attendance.countDocuments({});

    divider();

    console.log('  RESET COMPLETED SUCCESSFULLY');

    divider();

    console.log('\nFinal database state:');

    console.log(
      `  Users      : ${finalUsers.length} configured records`
    );

    console.log(
      `  Leads      : ${finalLeadCount}`
    );

    console.log(
      `  Attendance : ${finalAttendanceCount}`
    );

    console.log('\nUser collection:');
    console.log('  ✓ NOT deleted');
    console.log('  ✓ NOT recreated');
    console.log('  ✓ NOT updated');

    console.log('\nAllocation test environment:');
    console.log('  ✓ Leads cleared');
    console.log('  ✓ Attendance cleared');
    console.log('  ✓ AQRR runtime reset');

    console.log('\nNEXT STEPS:');

    console.log(
      '\n1. Login as Admin.'
    );

    console.log(
      '2. Verify Director 1 exists.'
    );

    console.log(
      '3. Verify TL 1 is managed by Director 1.'
    );

    console.log(
      '4. Verify Employees are managed by TL 1.'
    );

    console.log(
      '5. Mark Employee 1 Present.'
    );

    console.log(
      '6. Mark Employee 2 Present.'
    );

    console.log(
      '7. Keep Employee 3 and Employee 4 absent.'
    );

    console.log(
      '8. Create a fresh lead.'
    );

    console.log(
      '9. Verify Director is automatically assigned.'
    );

    console.log(
      '10. Verify a Present Employee under that Director is automatically assigned.'
    );

    console.log(
      '11. Do NOT manually assign the lead.'
    );

    console.log(
      '12. Continue with TC-59 through TC-64.'
    );

    divider();

    console.log(
      '  Ready for fresh S.2 allocation testing.'
    );

    divider();
  } catch (error) {
    console.error(
      '\n❌ Allocation reset failed:',
      error.message
    );

    if (error.stack) {
      console.error(error.stack);
    }

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

reset();