const dotenv = require('dotenv');

dotenv.config();

const connectDB = require('../config/db');
const mongoose = require('mongoose');
const User = require('../models/User');

const users = [
  // ── Admin ────────────────────────────────────────────────────
  {
    name: 'Admin',
    email: 'admin@gmail.com',
    password: 'Admin@123456',
    role: 'admin',
  },

  // ── Directors ───────────────────────────────────────────────
  {
    name: 'Director 1',
    email: 'director1@gmail.com',
    password: 'Director@001',
    role: 'director',
  },
  {
    name: 'Director 2',
    email: 'director2@gmail.com',
    password: 'Director@002',
    role: 'director',
  },
  {
    name: 'Director 3',
    email: 'director3@gmail.com',
    password: 'Director@003',
    role: 'director',
  },
  {
    name: 'Director 4',
    email: 'director4@gmail.com',
    password: 'Director@004',
    role: 'director',
  },

  // ── TLs ─────────────────────────────────────────────────────
  {
    name: 'TL 1',
    email: 'tl1@gmail.com',
    password: 'TL@001',
    role: 'tl',
  },

  // ── Telecallers / Employees ─────────────────────────────────
  {
    name: 'Employee 1',
    email: 'employee1@gmail.com',
    password: 'Employee@001',
    role: 'telecaller',
  },
  {
    name: 'Employee 2',
    email: 'employee2@gmail.com',
    password: 'Employee@002',
    role: 'telecaller',
  },
  {
    name: 'Employee 3',
    email: 'employee3@gmail.com',
    password: 'Employee@003',
    role: 'telecaller',
  },
  {
    name: 'Employee 4',
    email: 'employee4@gmail.com',
    password: 'Employee@004',
    role: 'telecaller',
  },
];

const seed = async () => {
  try {
    // Use the same DB connection configuration as server.js.
    // This also applies the DNS workaround from config/db.js.
    await connectDB();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  A2S CRM — User Seed Script');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('  ✓ Connected to MongoDB\n');

    let createdCount = 0;
    let skippedCount = 0;

    for (const userData of users) {
      const existing = await User.findOne({
        email: userData.email,
      });

      if (existing) {
        skippedCount++;

        console.log(
          `  ↷ [SKIPPED] ${String(existing.role).padEnd(10)} ${String(
            existing.name
          ).padEnd(14)} ${existing.email}`
        );

        continue;
      }

      // IMPORTANT:
      // User.create() triggers the User model pre-save hook,
      // so the password is bcrypt-hashed automatically.
      const created = await User.create(userData);

      createdCount++;

      console.log(
        `  ✓ [CREATED] ${String(created.role).padEnd(10)} ${String(
          created.name
        ).padEnd(14)} ${created.email}`
      );
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  ✅ Created : ${createdCount} user(s)`);
    console.log(`  ↷ Skipped : ${skippedCount} existing user(s)`);
    console.log(`  📊 Total   : ${users.length} configured user(s)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('  Configured login accounts:\n');
    console.log(
      '  Role        Email                     Password'
    );
    console.log(
      '  ─────────── ────────────────────────  ─────────────'
    );

    console.log(
      '  Admin       admin@gmail.com           Admin@123456'
    );

    console.log(
      '  Director    director1@gmail.com       Director@001'
    );
    console.log(
      '  Director    director2@gmail.com       Director@002'
    );
    console.log(
      '  Director    director3@gmail.com       Director@003'
    );
    console.log(
      '  Director    director4@gmail.com       Director@004'
    );

    console.log(
      '  TL          tl1@gmail.com             TL@001'
    );

    console.log(
      '  Telecaller  employee1@gmail.com       Employee@001'
    );
    console.log(
      '  Telecaller  employee2@gmail.com       Employee@002'
    );
    console.log(
      '  Telecaller  employee3@gmail.com       Employee@003'
    );
    console.log(
      '  Telecaller  employee4@gmail.com       Employee@004'
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Seed completed successfully.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('\n  ❌ Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

seed();