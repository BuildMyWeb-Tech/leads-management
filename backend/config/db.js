const mongoose = require('mongoose');
const dns = require('dns');

// Use public DNS resolvers for MongoDB Atlas SRV lookup.
// Required on this machine/network because the default DNS resolver
// can return ECONNREFUSED for MongoDB Atlas SRV records.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`DB Connection Error: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;