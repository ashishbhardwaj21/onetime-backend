#!/usr/bin/env node

/**
 * MongoDB Connection Test Script
 * Tests new MongoDB credentials after rotation
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

class MongoDBTester {
  constructor() {
    this.testResults = {
      startTime: new Date(),
      endTime: null,
      tests: [],
      overall: 'pending'
    };
  }

  async runTests() {
    console.log('🗄️ MongoDB Credential Test');
    console.log('==========================\n');

    try {
      await this.testConnection();
      await this.testBasicOperations();
      await this.testIndexes();
      await this.testPermissions();
      
      this.testResults.endTime = new Date();
      this.testResults.overall = 'passed';
      
      console.log('\n✅ All MongoDB tests passed!');
      console.log('🔒 New credentials are working correctly.');
      
    } catch (error) {
      this.testResults.endTime = new Date();
      this.testResults.overall = 'failed';
      
      console.error('\n❌ MongoDB tests failed:', error.message);
      console.error('🚨 Credential rotation may have issues.');
      process.exit(1);
    } finally {
      await this.cleanup();
      this.generateReport();
    }
  }

  async testConnection() {
    await this.runTest('Database Connection', async () => {
      const mongoURI = process.env.MONGODB_URI;
      
      if (!mongoURI) {
        throw new Error('MONGODB_URI environment variable not set');
      }

      // Validate URI format
      if (!mongoURI.includes('mongodb+srv://') && !mongoURI.includes('mongodb://')) {
        throw new Error('Invalid MongoDB URI format');
      }

      // Check for production indicators
      if (mongoURI.includes('localhost') || mongoURI.includes('127.0.0.1')) {
        throw new Error('URI appears to be pointing to localhost (not production)');
      }

      console.log(`   🔗 Connecting to: ${this.maskCredentials(mongoURI)}`);

      await mongoose.connect(mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000
      });

      console.log(`   ✅ Connected to database: ${mongoose.connection.name}`);
      console.log(`   🏠 Host: ${mongoose.connection.host}`);
      console.log(`   🔌 Port: ${mongoose.connection.port}`);
      console.log(`   📊 Ready state: ${mongoose.connection.readyState}`);
    });
  }

  async testBasicOperations() {
    await this.runTest('Basic Database Operations', async () => {
      const db = mongoose.connection.db;

      // Test ping
      console.log('   🏓 Testing ping...');
      await db.admin().ping();
      console.log('   ✅ Ping successful');

      // Test database stats
      console.log('   📊 Getting database stats...');
      const stats = await db.stats();
      console.log(`   📁 Collections: ${stats.collections}`);
      console.log(`   💾 Data size: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   🗂️  Storage size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);

      // Test collection listing
      console.log('   📋 Listing collections...');
      const collections = await db.listCollections().toArray();
      console.log(`   📚 Found ${collections.length} collections`);
      
      if (collections.length > 0) {
        collections.forEach(col => {
          console.log(`     - ${col.name}`);
        });
      }
    });
  }

  async testIndexes() {
    await this.runTest('Index Verification', async () => {
      const db = mongoose.connection.db;
      
      // Check if users collection exists and has indexes
      try {
        const usersIndexes = await db.collection('users').indexes();
        console.log(`   👥 Users collection indexes: ${usersIndexes.length}`);
        
        // Check for email index (critical for login)
        const hasEmailIndex = usersIndexes.some(idx => 
          idx.key && idx.key.email === 1
        );
        
        if (hasEmailIndex) {
          console.log('   ✅ Email index found (required for authentication)');
        } else {
          console.log('   ⚠️  Email index not found (will be created during migration)');
        }
        
      } catch (error) {
        if (error.message.includes('ns not found')) {
          console.log('   📝 Users collection not found (expected for new database)');
        } else {
          throw error;
        }
      }

      // Test geospatial capability
      console.log('   🌍 Testing geospatial capabilities...');
      try {
        await db.collection('test_geo').createIndex({ location: '2dsphere' });
        await db.collection('test_geo').drop();
        console.log('   ✅ Geospatial indexing supported');
      } catch (error) {
        throw new Error(`Geospatial indexing failed: ${error.message}`);
      }
    });
  }

  async testPermissions() {
    await this.runTest('Permission Verification', async () => {
      const db = mongoose.connection.db;

      // Test read permission
      console.log('   📖 Testing read permissions...');
      try {
        await db.collection('permission_test').find({}).limit(1).toArray();
        console.log('   ✅ Read permission confirmed');
      } catch (error) {
        throw new Error(`Read permission failed: ${error.message}`);
      }

      // Test write permission
      console.log('   ✏️  Testing write permissions...');
      try {
        const testDoc = {
          _id: 'permission_test_' + Date.now(),
          test: true,
          timestamp: new Date()
        };
        
        await db.collection('permission_test').insertOne(testDoc);
        console.log('   ✅ Write permission confirmed');

        // Test delete permission
        console.log('   🗑️  Testing delete permissions...');
        await db.collection('permission_test').deleteOne({ _id: testDoc._id });
        console.log('   ✅ Delete permission confirmed');
        
      } catch (error) {
        throw new Error(`Write/Delete permission failed: ${error.message}`);
      }

      // Test index creation permission
      console.log('   🏗️  Testing index creation permissions...');
      try {
        await db.collection('permission_test').createIndex({ test: 1 });
        console.log('   ✅ Index creation permission confirmed');
        
        // Clean up test collection
        await db.collection('permission_test').drop();
        
      } catch (error) {
        throw new Error(`Index creation permission failed: ${error.message}`);
      }
    });
  }

  async runTest(testName, testFunction) {
    const startTime = Date.now();
    
    try {
      console.log(`\n🔄 Running: ${testName}`);
      console.log('─'.repeat(40));
      
      await testFunction();
      
      const duration = Date.now() - startTime;
      console.log(`✅ ${testName} passed (${duration}ms)`);
      
      this.testResults.tests.push({
        name: testName,
        status: 'passed',
        duration,
        timestamp: new Date()
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ ${testName} failed (${duration}ms):`);
      console.error(`   Error: ${error.message}`);
      
      this.testResults.tests.push({
        name: testName,
        status: 'failed',
        duration,
        error: error.message,
        timestamp: new Date()
      });

      throw error;
    }
  }

  async cleanup() {
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
      }
    } catch (error) {
      console.error('Error during cleanup:', error.message);
    }
  }

  maskCredentials(uri) {
    return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://****:****@');
  }

  generateReport() {
    const totalDuration = this.testResults.endTime - this.testResults.startTime;
    const passedTests = this.testResults.tests.filter(t => t.status === 'passed').length;
    const totalTests = this.testResults.tests.length;
    
    console.log('\n📊 MongoDB Test Report');
    console.log('=====================');
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`📈 Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`);
    console.log(`🎯 Overall Status: ${this.testResults.overall.toUpperCase()}`);

    // Save detailed report
    const reportPath = 'mongodb-test-report.json';
    require('fs').writeFileSync(reportPath, JSON.stringify(this.testResults, null, 2));
    console.log(`\n📋 Detailed report saved: ${reportPath}`);
  }
}

// Run tests if called directly
if (require.main === module) {
  require('dotenv').config();
  
  const tester = new MongoDBTester();
  tester.runTests().catch(error => {
    console.error('💥 MongoDB test script failed:', error);
    process.exit(1);
  });
}

module.exports = MongoDBTester;