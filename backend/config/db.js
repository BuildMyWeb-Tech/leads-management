const mongoose = require('mongoose');
const dns = require('dns');

// Force Node.js DNS to use public DNS resolvers.
// Required on this machine because the default resolver is 127.0.0.1
// and MongoDB Atlas SRV lookups return ECONNREFUSED.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`DB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;