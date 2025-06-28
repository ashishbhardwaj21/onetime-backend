#!/usr/bin/env node

/**
 * Quick MongoDB Connection Test
 */

const mongoose = require('mongoose');
require('dotenv').config();

console.log('🧪 Testing MongoDB Atlas connection...\n');

async function testConnection() {
  try {
    console.log('📡 Connecting to MongoDB Atlas...');
    console.log(`🔗 Database URI: ${process.env.MONGODB_URI.replace(/:[^:@]*@/, ':****@')}\n`);
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Successfully connected to MongoDB Atlas!');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
    console.log(`🌐 Host: ${mongoose.connection.host}`);
    
    // Test basic operations
    console.log('\n🔍 Testing database operations...');
    
    const testCollection = mongoose.connection.db.collection('connection_test');
    await testCollection.insertOne({ 
      test: true, 
      timestamp: new Date(),
      message: 'OneTime app connection test'
    });
    console.log('✅ Write test successful');
    
    const testDoc = await testCollection.findOne({ test: true });
    console.log('✅ Read test successful');
    console.log(`📄 Test document: ${testDoc.message}`);
    
    await testCollection.deleteMany({ test: true });
    console.log('✅ Cleanup successful');
    
    await mongoose.disconnect();
    console.log('\n🎉 MongoDB Atlas connection test PASSED!');
    console.log('\n📋 Next steps:');
    console.log('1. Run: npm install');
    console.log('2. Run: node scripts/setupMongoDB.js');
    console.log('3. Run: npm run dev');
    console.log('4. Run: node scripts/testAuthFlow.js');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Connection test FAILED!');
    console.error('Error:', error.message);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your MongoDB Atlas cluster is running');
    console.log('2. Verify your username and password are correct');
    console.log('3. Ensure your IP address is whitelisted');
    console.log('4. Check if the database user has read/write permissions');
    
    process.exit(1);
  }
}

testConnection();