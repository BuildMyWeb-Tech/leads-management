const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');
const Lead = require('../models/Lead');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  await User.deleteMany({});
  await Lead.deleteMany({});
  console.log('🗑  Cleared existing users and leads');

  // ── Create Users ──────────────────────────────────────────
  const admin = await User.create({
    name: 'Admin User',
    email: 'admin@test.com',
    password: 'password',
    role: 'admin',
  });

  const dir1 = await User.create({
    name: 'Rajesh Kumar',
    email: 'director@test.com',
    password: 'password',
    role: 'director',
  });

  const dir2 = await User.create({
    name: 'Priya Sharma',
    email: 'director2@test.com',
    password: 'password',
    role: 'director',
  });

  const tc1 = await User.create({
    name: 'Amit Singh',
    email: 'telecaller@test.com',
    password: 'password',
    role: 'telecaller',
  });

  const tc2 = await User.create({
    name: 'Neha Verma',
    email: 'telecaller2@test.com',
    password: 'password',
    role: 'telecaller',
  });

  const tc3 = await User.create({
    name: 'Karan Mehta',
    email: 'telecaller3@test.com',
    password: 'password',
    role: 'telecaller',
  });

  console.log('👤 Users created (6)');

  // ── Create Sample Leads ───────────────────────────────────
  const sources = ['YouTube', 'Google Ads', 'Facebook', 'Instagram', 'Referral', 'Walk-in', 'Website'];
  const statuses = [
    'New', 'Allocated', 'Called', 'Follow Up',
    'Site Visit Planned', 'Site Visit Done',
    'Interested', 'Negotiation', 'Booked',
    'Wrong Number', 'Not Interested', 'Closed',
  ];
  const budgets = ['40L-60L', '60L-80L', '80L-1Cr', '1Cr-1.5Cr', '1.5Cr+'];
  const properties = ['2BHK Apartment', '3BHK Villa', 'Studio Flat', 'Plot / Land', 'Commercial Space'];

  const leadNames = [
    'Suresh Patel',    'Meena Joshi',     'Vikram Nair',    'Sonal Gupta',    'Ankit Tiwari',
    'Ritu Kapoor',     'Deepak Yadav',    'Kavya Reddy',    'Mohit Agarwal',  'Sunita Bose',
    'Ramesh Iyer',     'Pooja Mishra',    'Sanjay Pandey',  'Anjali Saxena',  'Rohit Jain',
    'Divya Pillai',    'Arun Chatterjee', 'Sneha Das',      'Manoj Srivastava','Nisha Khanna',
    'Vijay Menon',     'Asha Trivedi',    'Gaurav Bhatt',   'Rekha Malhotra', 'Sunil Rao',
  ];

  const leads = leadNames.map((name, i) => {
    const firstName = name.split(' ')[0].toLowerCase();
    return {
      name,
      phone: `9${String(800000000 + i * 11111 + 1000000).slice(0, 9)}`,
      email: `${firstName}.${i + 1}@example.com`,
      source: sources[i % sources.length],
      status: statuses[i % statuses.length],
      budget: budgets[i % budgets.length],
      propertyInterest: properties[i % properties.length],
      notes: i % 4 === 0 ? `Follow up scheduled. Interested in ${properties[i % properties.length]}.` : '',
      assignedDirector: i < 10 ? dir1._id : i < 20 ? dir2._id : null,
      assignedTelecaller:
        i < 4  ? tc1._id :
        i < 8  ? tc2._id :
        i < 12 ? tc3._id :
        i < 16 ? tc1._id :
        null,
    };
  });

  await Lead.insertMany(leads);
  console.log(`📋 ${leads.length} sample leads created`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Seed completed successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Demo Login Credentials:');
  console.log('  Admin      → admin@test.com       / password');
  console.log('  Director   → director@test.com    / password');
  console.log('  Director 2 → director2@test.com   / password');
  console.log('  Telecaller → telecaller@test.com  / password');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
