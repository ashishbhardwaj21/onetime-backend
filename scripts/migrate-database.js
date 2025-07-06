#!/usr/bin/env node

/**
 * MongoDB Migration Script
 * Sets up production database with indexes, seed data, and validation
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// Import models
const User = require('../models/User');
const Activity = require('../models/Activity');
const AdminUser = require('../models/AdminUser');

class DatabaseMigration {
  constructor() {
    this.migrationResults = {
      startTime: new Date(),
      endTime: null,
      steps: [],
      success: false,
      errors: []
    };
  }

  async runMigration() {
    console.log('🗄️ MongoDB Production Migration Starting...');
    console.log('===========================================\n');

    try {
      // Phase 1: Database Connection
      await this.connectToDatabase();
      
      // Phase 2: Create Indexes
      await this.createPerformanceIndexes();
      
      // Phase 3: Seed Initial Data
      await this.seedInitialData();
      
      // Phase 4: Create Admin Accounts
      await this.createAdminAccounts();
      
      // Phase 5: Validate Setup
      await this.validateDatabaseSetup();

      this.migrationResults.success = true;
      this.migrationResults.endTime = new Date();
      
      this.generateMigrationReport();
      console.log('\n🎉 Database migration completed successfully!');

    } catch (error) {
      this.migrationResults.errors.push({
        step: 'General Migration',
        error: error.message,
        timestamp: new Date()
      });
      
      console.error('❌ Migration failed:', error.message);
      throw error;
    } finally {
      await mongoose.disconnect();
    }
  }

  async connectToDatabase() {
    await this.runMigrationStep('Database Connection', async () => {
      const mongoURI = process.env.MONGODB_URI;
      
      if (!mongoURI) {
        throw new Error('MONGODB_URI environment variable not set');
      }

      await mongoose.connect(mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 30000,
        retryWrites: true,
        w: 'majority'
      });

      console.log('   ✅ Connected to MongoDB Atlas');
      console.log(`   🗄️  Database: ${mongoose.connection.name}`);
      console.log(`   🔗 Connection state: ${mongoose.connection.readyState}`);
    });
  }

  async createPerformanceIndexes() {
    await this.runMigrationStep('Performance Indexes', async () => {
      const db = mongoose.connection.db;
      
      console.log('   📊 Creating performance indexes...');

      // Users collection indexes
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('users').createIndex({ "profile.location": "2dsphere" });
      await db.collection('users').createIndex({ "analytics.lastActiveAt": 1 });
      await db.collection('users').createIndex({ createdAt: 1 });
      console.log('     ✅ Users indexes created');

      // Matches collection indexes
      await db.collection('matches').createIndex({ user1: 1, user2: 1 }, { unique: true });
      await db.collection('matches').createIndex({ user1: 1, mutual: 1 });
      await db.collection('matches').createIndex({ user2: 1, mutual: 1 });
      await db.collection('matches').createIndex({ expiresAt: 1 });
      console.log('     ✅ Matches indexes created');

      // Messages collection indexes
      await db.collection('messages').createIndex({ conversationId: 1, timestamp: -1 });
      await db.collection('messages').createIndex({ sender: 1, timestamp: -1 });
      console.log('     ✅ Messages indexes created');

      // Activities collection indexes
      await db.collection('activities').createIndex({ "location": "2dsphere" });
      await db.collection('activities').createIndex({ scheduledFor: 1 });
      await db.collection('activities').createIndex({ category: 1, status: 1 });
      console.log('     ✅ Activities indexes created');

      // User swipes collection indexes
      await db.collection('userswipes').createIndex({ swiper: 1, swipedAt: -1 });
      await db.collection('userswipes').createIndex({ swiped: 1, swipedAt: -1 });
      console.log('     ✅ User swipes indexes created');

      console.log('   🎯 All performance indexes created successfully');
    });
  }

  async seedInitialData() {
    await this.runMigrationStep('Initial Data Seeding', async () => {
      // Check if data already exists
      const userCount = await User.countDocuments();
      const activityCount = await Activity.countDocuments();

      console.log(`   📊 Current data: ${userCount} users, ${activityCount} activities`);

      if (userCount === 0) {
        await this.createSampleUsers();
      } else {
        console.log('   ⚠️  Users already exist, skipping user seeding');
      }

      if (activityCount === 0) {
        await this.createSampleActivities();
      } else {
        console.log('   ⚠️  Activities already exist, skipping activity seeding');
      }
    });
  }

  async createSampleUsers() {
    console.log('   👥 Creating sample users...');

    const sampleUsers = [
      {
        email: 'emma.thompson@example.com',
        password: 'Password123!',
        profile: {
          name: 'Emma Thompson',
          age: 28,
          dateOfBirth: new Date('1995-03-15'),
          gender: 'female',
          occupation: 'Graphic Designer',
          bio: 'Love exploring new coffee shops and weekend hiking adventures. Looking for someone who shares my passion for creativity and outdoor activities.',
          location: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749], // San Francisco
            city: 'San Francisco',
            state: 'CA',
            country: 'USA'
          },
          interests: ['hiking', 'coffee', 'design', 'photography'],
          intentTags: ['relationship', 'adventures'],
          energyLevel: 'Moderate',
          lookingFor: 'Serious'
        }
      },
      {
        email: 'james.wilson@example.com',
        password: 'Password123!',
        profile: {
          name: 'James Wilson',
          age: 30,
          dateOfBirth: new Date('1993-07-22'),
          gender: 'male',
          occupation: 'Software Engineer',
          bio: 'Tech enthusiast by day, chef by night. Always up for trying new restaurants or cooking together. Let\'s build something amazing!',
          location: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749], // San Francisco
            city: 'San Francisco',
            state: 'CA',
            country: 'USA'
          },
          interests: ['cooking', 'technology', 'travel', 'music'],
          intentTags: ['dating', 'foodie'],
          energyLevel: 'Energetic',
          lookingFor: 'Casual'
        }
      },
      {
        email: 'maya.patel@example.com',
        password: 'Password123!',
        profile: {
          name: 'Maya Patel',
          age: 26,
          dateOfBirth: new Date('1997-11-08'),
          gender: 'female',
          occupation: 'Marketing Manager',
          bio: 'Yoga instructor and marketing professional. Passionate about wellness, travel, and meaningful conversations over great wine.',
          location: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749], // San Francisco
            city: 'San Francisco',
            state: 'CA',
            country: 'USA'
          },
          interests: ['yoga', 'wellness', 'wine', 'travel'],
          intentTags: ['mindfulness', 'connection'],
          energyLevel: 'Moderate',
          lookingFor: 'Serious'
        }
      }
    ];

    for (const userData of sampleUsers) {
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      
      const user = new User({
        email: userData.email,
        passwordHash: hashedPassword,
        profile: userData.profile,
        verification: {
          email: { verified: true }
        },
        analytics: {
          joinedAt: new Date(),
          lastActiveAt: new Date()
        }
      });

      await user.save();
      console.log(`     ✅ Created user: ${userData.profile.name}`);
    }

    console.log(`   🎉 Created ${sampleUsers.length} sample users`);
  }

  async createSampleActivities() {
    console.log('   🎯 Creating sample activities...');

    const sampleActivities = [
      {
        title: 'Coffee & Conversation',
        description: 'Let\'s meet for coffee and get to know each other better. Perfect for a casual first meetup!',
        category: 'dining',
        location: {
          type: 'Point',
          coordinates: [-122.4171, 37.7751],
          name: 'Blue Bottle Coffee',
          address: '66 Mint St, San Francisco, CA 94103',
          city: 'San Francisco'
        },
        maxParticipants: 2,
        scheduledFor: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        duration: 90,
        tags: ['coffee', 'casual', 'conversation'],
        status: 'planning',
        visibility: 'public'
      },
      {
        title: 'Golden Gate Park Picnic',
        description: 'Outdoor picnic in the beautiful Golden Gate Park. Bring a blanket and let\'s enjoy the sunshine!',
        category: 'outdoor',
        location: {
          type: 'Point',
          coordinates: [-122.4726, 37.7694],
          name: 'Golden Gate Park',
          address: 'Golden Gate Park, San Francisco, CA',
          city: 'San Francisco'
        },
        maxParticipants: 4,
        scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        duration: 180,
        tags: ['outdoor', 'picnic', 'nature'],
        status: 'planning',
        visibility: 'public'
      },
      {
        title: 'Wine Tasting in Napa',
        description: 'Day trip to Napa Valley for wine tasting. Perfect for wine enthusiasts looking to explore!',
        category: 'culture',
        location: {
          type: 'Point',
          coordinates: [-122.2869, 38.2975],
          name: 'Napa Valley',
          address: 'Napa Valley, CA',
          city: 'Napa'
        },
        maxParticipants: 6,
        scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
        duration: 480,
        tags: ['wine', 'travel', 'culture'],
        status: 'planning',
        visibility: 'public'
      }
    ];

    // Get a sample user to be the creator
    const sampleUser = await User.findOne();
    
    for (const activityData of sampleActivities) {
      const activity = new Activity({
        ...activityData,
        createdBy: sampleUser._id,
        participants: [{
          user: sampleUser._id,
          status: 'accepted',
          invitedAt: new Date(),
          respondedAt: new Date()
        }]
      });

      await activity.save();
      console.log(`     ✅ Created activity: ${activityData.title}`);
    }

    console.log(`   🎉 Created ${sampleActivities.length} sample activities`);
  }

  async createAdminAccounts() {
    await this.runMigrationStep('Admin Account Creation', async () => {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@onetimedating.me';
      const adminPassword = process.env.ADMIN_PASSWORD || 'SecureAdminPassword123!';

      // Check if admin already exists
      const existingAdmin = await AdminUser.findOne({ email: adminEmail });
      
      if (existingAdmin) {
        console.log('   ⚠️  Admin account already exists, skipping creation');
        return;
      }

      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      
      const admin = new AdminUser({
        email: adminEmail,
        passwordHash: hashedPassword,
        role: 'super_admin',
        permissions: {
          users: ['read', 'write', 'delete'],
          content: ['read', 'write', 'delete'],
          analytics: ['read'],
          system: ['read', 'write']
        },
        profile: {
          name: 'System Administrator',
          lastLoginAt: new Date(),
          isActive: true
        }
      });

      await admin.save();
      console.log(`   ✅ Created admin account: ${adminEmail}`);
      console.log(`   🔑 Admin password: ${adminPassword}`);
      console.log('   ⚠️  IMPORTANT: Change admin password after first login!');
    });
  }

  async validateDatabaseSetup() {
    await this.runMigrationStep('Database Validation', async () => {
      // Test basic operations
      const userCount = await User.countDocuments();
      const activityCount = await Activity.countDocuments();
      const adminCount = await AdminUser.countDocuments();

      console.log('   📊 Final data counts:');
      console.log(`     👥 Users: ${userCount}`);
      console.log(`     🎯 Activities: ${activityCount}`);
      console.log(`     🔐 Admins: ${adminCount}`);

      // Test geospatial query
      const nearbyUsers = await User.find({
        'profile.location': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [-122.4194, 37.7749] // San Francisco
            },
            $maxDistance: 10000 // 10km
          }
        }
      }).limit(5);

      console.log(`   📍 Geospatial query test: Found ${nearbyUsers.length} users within 10km`);

      // Test index usage
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log(`   📋 Collections created: ${collections.length}`);
      
      for (const collection of collections) {
        const indexes = await mongoose.connection.db.collection(collection.name).indexes();
        console.log(`     📊 ${collection.name}: ${indexes.length} indexes`);
      }

      console.log('   ✅ Database validation completed successfully');
    });
  }

  async runMigrationStep(stepName, stepFunction) {
    const stepStart = Date.now();
    
    try {
      console.log(`\n🔄 Running: ${stepName}`);
      console.log('─'.repeat(50));
      
      await stepFunction();
      
      const duration = Date.now() - stepStart;
      console.log(`✅ ${stepName} completed (${duration}ms)`);
      
      this.migrationResults.steps.push({
        name: stepName,
        success: true,
        duration,
        timestamp: new Date()
      });
      
    } catch (error) {
      const duration = Date.now() - stepStart;
      console.error(`❌ ${stepName} failed (${duration}ms):`, error.message);
      
      this.migrationResults.steps.push({
        name: stepName,
        success: false,
        duration,
        error: error.message,
        timestamp: new Date()
      });

      this.migrationResults.errors.push({
        step: stepName,
        error: error.message,
        timestamp: new Date()
      });

      throw error;
    }
  }

  generateMigrationReport() {
    const totalDuration = this.migrationResults.endTime - this.migrationResults.startTime;
    
    console.log('\n📊 Migration Report');
    console.log('==================');
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(`✅ Successful Steps: ${this.migrationResults.steps.filter(s => s.success).length}`);
    console.log(`❌ Failed Steps: ${this.migrationResults.steps.filter(s => !s.success).length}`);
    console.log(`📈 Success Rate: ${((this.migrationResults.steps.filter(s => s.success).length / this.migrationResults.steps.length) * 100).toFixed(1)}%`);

    // Save detailed report
    const reportPath = 'migration-report.json';
    require('fs').writeFileSync(reportPath, JSON.stringify(this.migrationResults, null, 2));
    console.log(`\n📋 Detailed report saved: ${reportPath}`);
  }
}

// Run migration if called directly
if (require.main === module) {
  require('dotenv').config();
  
  const migration = new DatabaseMigration();
  migration.runMigration().catch(error => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });
}

module.exports = DatabaseMigration;