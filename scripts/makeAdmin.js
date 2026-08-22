// One-time script: promote a user to admin.
// Usage: node scripts/makeAdmin.js your@email.com
require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');
const User = require('../models/User');

const email = process.argv[2];

if (!email) {
  console.error('❌ Usage: node scripts/makeAdmin.js your@email.com');
  process.exit(1);
}

const connectionOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
};

const connect = async () => {
  if (process.env.ATLAS_URI) {
    try {
      await mongoose.connect(process.env.ATLAS_URI, connectionOptions);
      return;
    } catch (err) {
      console.warn('⚠️ Atlas DNS lookup failed, retrying with fallback DNS...');
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        await mongoose.connect(process.env.ATLAS_URI, connectionOptions);
        return;
      } catch (retryErr) {
        console.warn('⚠️ Atlas fallback failed:', retryErr.message);
      }
    }
  }
  if (process.env.LOCAL_URI) {
    try {
      await mongoose.connect(process.env.LOCAL_URI, connectionOptions);
      return;
    } catch (err) {
      console.warn('⚠️ Local MongoDB connection failed:', err.message);
    }
  }
  throw new Error('No MongoDB connection available');
};

const run = async () => {
  try {
    await connect();

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { role: 'admin' },
      { new: true, runValidators: true }
    );

    if (!user) {
      console.error(`❌ No user found with email: ${email}`);
      process.exit(1);
    }

    console.log(`✅ ${user.email} is now an admin (role: ${user.role})`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
};

run();
