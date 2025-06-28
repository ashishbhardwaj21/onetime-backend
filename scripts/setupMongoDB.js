#!/usr/bin/env node

/**
 * MongoDB Atlas Setup Script for OneTime Dating App
 * 
 * This script helps set up MongoDB Atlas cluster, create databases,
 * users, and initial configuration for the OneTime dating app.
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

class MongoDBSetup {
  constructor() {
    this.adminClient = null;
    this.appClient = null;
  }

  async setup() {
    try {
      console.log('🚀 Starting MongoDB Atlas setup for OneTime Dating App...\n');

      // Step 1: Validate environment variables
      await this.validateEnvironment();

      // Step 2: Connect to MongoDB
      await this.connectToMongoDB();

      // Step 3: Create databases
      await this.createDatabases();

      // Step 4: Create collections
      await this.createCollections();

      // Step 5: Create indexes
      await this.createIndexes();

      // Step 6: Insert initial data
      await this.insertInitialData();

      // Step 7: Verify setup
      await this.verifySetup();

      console.log('\n✅ MongoDB Atlas setup completed successfully!');
      console.log('\n📋 Next steps:');
      console.log('1. Update your application .env file with the connection string');
      console.log('2. Configure IP whitelist in MongoDB Atlas');
      console.log('3. Set up monitoring and alerts');
      console.log('4. Test your application connection');

    } catch (error) {
      console.error('\n❌ Setup failed:', error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  async validateEnvironment() {
    console.log('📋 Validating environment configuration...');

    const requiredVars = [
      'MONGODB_URI',
      'JWT_SECRET',
      'NODE_ENV'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }

    console.log('✅ Environment validation passed');
  }

  async connectToMongoDB() {
    console.log('🔌 Connecting to MongoDB Atlas...');

    const mongoURI = process.env.MONGODB_URI;
    
    this.adminClient = new MongoClient(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    await this.adminClient.connect();
    console.log('✅ Connected to MongoDB Atlas');
  }

  async createDatabases() {
    console.log('🗄️  Creating databases...');

    const databases = [
      'onetime-development',
      'onetime-staging', 
      'onetime-production'
    ];

    for (const dbName of databases) {
      const db = this.adminClient.db(dbName);
      
      // Create a dummy collection to ensure database is created
      await db.createCollection('_setup');
      await db.collection('_setup').insertOne({ 
        created: new Date(),
        purpose: 'Database initialization'
      });
      
      console.log(`✅ Created database: ${dbName}`);
    }
  }

  async createCollections() {
    console.log('📑 Creating collections...');

    const currentEnv = process.env.NODE_ENV || 'development';
    const dbName = `onetime-${currentEnv}`;
    const db = this.adminClient.db(dbName);

    const collections = [
      {
        name: 'users',
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['email', 'passwordHash', 'profile', 'createdAt'],
            properties: {
              email: { bsonType: 'string' },
              passwordHash: { bsonType: 'string' },
              profile: { bsonType: 'object' },
              status: { enum: ['active', 'suspended', 'deleted'] }
            }
          }
        }
      },
      {
        name: 'matches',
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['user1', 'user2', 'user1Action'],
            properties: {
              user1: { bsonType: 'objectId' },
              user2: { bsonType: 'objectId' },
              user1Action: { enum: ['like', 'pass', 'super_like'] },
              user2Action: { enum: ['like', 'pass', 'super_like', 'pending'] },
              mutual: { bsonType: 'bool' },
              status: { enum: ['active', 'expired', 'unmatched', 'deleted'] }
            }
          }
        }
      },
      {
        name: 'conversations',
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['matchId', 'participants'],
            properties: {
              matchId: { bsonType: 'objectId' },
              participants: { 
                bsonType: 'array',
                items: { bsonType: 'objectId' },
                minItems: 2,
                maxItems: 2
              },
              status: { enum: ['active', 'archived', 'deleted'] }
            }
          }
        }
      },
      {
        name: 'messages',
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['conversationId', 'sender', 'content', 'timestamp'],
            properties: {
              conversationId: { bsonType: 'objectId' },
              sender: { bsonType: 'objectId' },
              content: { bsonType: 'object' },
              timestamp: { bsonType: 'date' }
            }
          }
        }
      },
      {
        name: 'activities',
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['title', 'category', 'location', 'createdBy'],
            properties: {
              title: { bsonType: 'string' },
              category: { enum: ['dining', 'outdoor', 'entertainment', 'cultural', 'sports', 'social', 'virtual'] },
              location: { bsonType: 'object' },
              createdBy: { bsonType: 'objectId' },
              status: { enum: ['active', 'inactive', 'deleted'] }
            }
          }
        }
      },
      { name: 'userswipes' },
      { name: 'notifications' }
    ];

    for (const collection of collections) {
      try {
        if (collection.validator) {
          await db.createCollection(collection.name, {
            validator: collection.validator,
            validationLevel: 'moderate',
            validationAction: 'warn'
          });
        } else {
          await db.createCollection(collection.name);
        }
        console.log(`✅ Created collection: ${collection.name}`);
      } catch (error) {
        if (error.code === 48) { // Collection already exists
          console.log(`ℹ️  Collection already exists: ${collection.name}`);
        } else {
          throw error;
        }
      }
    }
  }

  async createIndexes() {
    console.log('📊 Creating database indexes...');

    const currentEnv = process.env.NODE_ENV || 'development';
    const dbName = `onetime-${currentEnv}`;
    const db = this.adminClient.db(dbName);

    const indexConfigs = {
      users: [
        { keys: { email: 1 }, options: { unique: true } },
        { keys: { 'profile.location': '2dsphere' } },
        { keys: { status: 1, 'verification.emailVerified': 1 } },
        { keys: { createdAt: -1 } },
        { keys: { 'metadata.lastActiveAt': -1 } }
      ],
      matches: [
        { keys: { user1: 1, user2: 1 }, options: { unique: true } },
        { keys: { user1: 1, mutual: 1 } },
        { keys: { user2: 1, mutual: 1 } },
        { keys: { matchedAt: -1 } },
        { keys: { expiresAt: 1 } },
        { keys: { status: 1 } }
      ],
      conversations: [
        { keys: { participants: 1 } },
        { keys: { 'lastMessage.timestamp': -1 } },
        { keys: { matchId: 1 }, options: { unique: true } },
        { keys: { status: 1 } }
      ],
      messages: [
        { keys: { conversationId: 1, timestamp: -1 } },
        { keys: { sender: 1, timestamp: -1 } },
        { keys: { timestamp: -1 } },
        { keys: { 'content.type': 1 } }
      ],
      activities: [
        { keys: { location: '2dsphere' } },
        { keys: { category: 1, priceRange: 1 } },
        { keys: { averageRating: -1 } },
        { keys: { status: 1, isApproved: 1 } },
        { keys: { createdBy: 1 } }
      ]
    };

    // Text search indexes
    const textIndexes = {
      activities: {
        title: 'text',
        description: 'text', 
        tags: 'text',
        'location.address': 'text'
      },
      users: {
        'profile.name': 'text',
        email: 'text'
      }
    };

    // Create regular indexes
    for (const [collectionName, indexes] of Object.entries(indexConfigs)) {
      const collection = db.collection(collectionName);
      
      for (const { keys, options = {} } of indexes) {
        try {
          await collection.createIndex(keys, options);
          console.log(`✅ Created index for ${collectionName}:`, Object.keys(keys).join(', '));
        } catch (error) {
          if (error.code === 85) { // Index already exists
            console.log(`ℹ️  Index already exists for ${collectionName}:`, Object.keys(keys).join(', '));
          } else {
            console.warn(`⚠️  Failed to create index for ${collectionName}:`, error.message);
          }
        }
      }
    }

    // Create text search indexes
    for (const [collectionName, textIndex] of Object.entries(textIndexes)) {
      try {
        const collection = db.collection(collectionName);
        await collection.createIndex(textIndex);
        console.log(`✅ Created text search index for ${collectionName}`);
      } catch (error) {
        if (error.code === 85) {
          console.log(`ℹ️  Text search index already exists for ${collectionName}`);
        } else {
          console.warn(`⚠️  Failed to create text search index for ${collectionName}:`, error.message);
        }
      }
    }
  }

  async insertInitialData() {
    console.log('📝 Inserting initial data...');

    const currentEnv = process.env.NODE_ENV || 'development';
    const dbName = `onetime-${currentEnv}`;
    const db = this.adminClient.db(dbName);

    // Insert activity categories
    const categories = [
      {
        id: 'dining',
        name: 'Dining',
        description: 'Restaurants, cafes, and food experiences',
        icon: '🍽️',
        createdAt: new Date()
      },
      {
        id: 'outdoor',
        name: 'Outdoor',
        description: 'Parks, hiking, and outdoor activities',
        icon: '🌳',
        createdAt: new Date()
      },
      {
        id: 'entertainment',
        name: 'Entertainment',
        description: 'Movies, shows, and live entertainment',
        icon: '🎭',
        createdAt: new Date()
      },
      {
        id: 'cultural',
        name: 'Cultural',
        description: 'Museums, galleries, and cultural sites',
        icon: '🏛️',
        createdAt: new Date()
      },
      {
        id: 'sports',
        name: 'Sports',
        description: 'Sports activities and fitness',
        icon: '⚽',
        createdAt: new Date()
      },
      {
        id: 'social',
        name: 'Social',
        description: 'Social gatherings and events',
        icon: '🎉',
        createdAt: new Date()
      }
    ];

    try {
      const categoriesCollection = db.collection('activity_categories');
      await categoriesCollection.insertMany(categories);
      console.log('✅ Inserted activity categories');
    } catch (error) {
      console.log('ℹ️  Activity categories may already exist');
    }

    // Create admin user if it doesn't exist
    if (currentEnv !== 'production') {
      try {
        const bcrypt = require('bcryptjs');
        const usersCollection = db.collection('users');
        
        const adminExists = await usersCollection.findOne({ email: 'admin@onetime.app' });
        
        if (!adminExists) {
          const hashedPassword = await bcrypt.hash('admin123!@#', 12);
          
          const adminUser = {
            email: 'admin@onetime.app',
            passwordHash: hashedPassword,
            role: 'admin',
            profile: {
              name: 'OneTime Admin',
              age: 30,
              gender: 'other',
              bio: 'OneTime Dating App Administrator',
              photos: [],
              interests: [],
              prompts: []
            },
            verification: {
              emailVerified: true,
              emailVerifiedAt: new Date()
            },
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          await usersCollection.insertOne(adminUser);
          console.log('✅ Created admin user (admin@onetime.app / admin123!@#)');
        }
      } catch (error) {
        console.warn('⚠️  Could not create admin user:', error.message);
      }
    }
  }

  async verifySetup() {
    console.log('🔍 Verifying setup...');

    const currentEnv = process.env.NODE_ENV || 'development';
    const dbName = `onetime-${currentEnv}`;
    const db = this.adminClient.db(dbName);

    // Check collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    const expectedCollections = ['users', 'matches', 'conversations', 'messages', 'activities'];
    const missingCollections = expectedCollections.filter(name => !collectionNames.includes(name));
    
    if (missingCollections.length > 0) {
      throw new Error(`Missing collections: ${missingCollections.join(', ')}`);
    }

    // Check indexes
    const usersIndexes = await db.collection('users').indexes();
    const emailIndexExists = usersIndexes.some(index => 
      index.key && index.key.email === 1 && index.unique === true
    );
    
    if (!emailIndexExists) {
      throw new Error('Unique email index not found on users collection');
    }

    // Test connection
    await db.admin().ping();

    console.log('✅ Setup verification passed');
    console.log(`📊 Database: ${dbName}`);
    console.log(`📑 Collections: ${collectionNames.length}`);
    console.log(`📈 Indexes created successfully`);
  }

  async cleanup() {
    if (this.adminClient) {
      await this.adminClient.close();
    }
  }
}

// Run setup if this script is executed directly
if (require.main === module) {
  const setup = new MongoDBSetup();
  setup.setup().catch(console.error);
}

module.exports = MongoDBSetup;