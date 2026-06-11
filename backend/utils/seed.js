const mongoose = require('mongoose');
const dotenv   = require('dotenv');
dotenv.config();

const User = require('../models/User');
const Lead = require('../models/Lead');
const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  A2S CRM — User Seed Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('  ✓ Connected to MongoDB');

  // Remove all existing users before inserting
  const deleted = await User.deleteMany({});
  console.log(`  🗑  Cleared ${deleted.deletedCount} existing user(s)\n`);

  // ── Insert exact users ─────────────────────────────────────
  const users = [
    // Admin
    { name: 'Admin',      email: 'admin@gmail.com',      password: 'Admin@123456', role: 'admin'      },
    // Directors
    { name: 'Director 1', email: 'director1@gmail.com',   password: 'Director@001', role: 'director'   },
    { name: 'Director 2', email: 'director2@gmail.com',   password: 'Director@002', role: 'director'   },
    { name: 'Director 3', email: 'director3@gmail.com',   password: 'Director@003', role: 'director'   },
    // Telecallers (Employees)
    { name: 'Employee 1', email: 'employee1@gmail.com',   password: 'Employee@001', role: 'telecaller' },
    { name: 'Employee 2', email: 'employee2@gmail.com',   password: 'Employee@002', role: 'telecaller' },
    { name: 'Employee 3', email: 'employee3@gmail.com',   password: 'Employee@003', role: 'telecaller' },
  ];

  // Use User.create() one by one so the pre-save bcrypt hook runs on each
  const results = [];
  for (const u of users) {
    const created = await User.create(u);
    results.push({ role: created.role, name: created.name, email: created.email });
    console.log(`  ✓ [${created.role.padEnd(10)}] ${created.name.padEnd(12)}  ${created.email}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ ${results.length} users created successfully!`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('  Login credentials:\n');
  console.log('  Role        Email                     Password');
  console.log('  ─────────── ──────────────────────── ─────────────');
  console.log('  Admin       admin@gmail.com           Admin@123456');
  console.log('  Director    director1@gmail.com       Director@001');
  console.log('  Director    director2@gmail.com       Director@002');
  console.log('  Director    director3@gmail.com       Director@003');
  console.log('  Telecaller  employee1@gmail.com       Employee@001');
  console.log('  Telecaller  employee2@gmail.com       Employee@002');
  console.log('  Telecaller  employee3@gmail.com       Employee@003');
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('\n  ❌ Seed failed:', err.message);
  process.exit(1);
});