const mongoose = require('mongoose');
const logger = require('./logger');

class DatabaseConfig {
  constructor() {
    this.connection = null;
    this.isConnected = false;
  }

  // Get MongoDB URI based on environment
  getMongoURI() {
    const env = process.env.NODE_ENV || 'development';
    
    switch (env) {
      case 'production':
        return process.env.MONGODB_URI_PROD || process.env.MONGODB_URI;
      case 'staging':
        return process.env.MONGODB_URI_STAGING || process.env.MONGODB_URI;
      case 'test':
        return process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/onetime-test';
      default:
        return process.env.MONGODB_URI_DEV || process.env.MONGODB_URI || 'mongodb://localhost:27017/onetime-development';
    }
  }

  // MongoDB connection options
  getConnectionOptions() {
    return {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 2,
      serverSelectionTimeoutMS: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      bufferMaxEntries: 0,
      // Enable retryable writes for better reliability
      retryWrites: true,
      // Write concern for data safety
      w: 'majority',
      // Read preference for load balancing
      readPreference: 'primary'
    };
  }

  // Connect to MongoDB
  async connect() {
    try {
      if (this.isConnected) {
        logger.info('Already connected to MongoDB');
        return this.connection;
      }

      const mongoURI = this.getMongoURI();
      const options = this.getConnectionOptions();

      if (!mongoURI) {
        throw new Error('MongoDB URI is not configured. Please set MONGODB_URI environment variable.');
      }

      logger.info('Connecting to MongoDB...', {
        environment: process.env.NODE_ENV,
        database: this.getDatabaseName(mongoURI)
      });

      this.connection = await mongoose.connect(mongoURI, options);
      this.isConnected = true;

      // Set up connection event handlers
      this.setupEventHandlers();

      logger.info('✅ Successfully connected to MongoDB', {
        host: this.connection.connection.host,
        database: this.connection.connection.name,
        port: this.connection.connection.port
      });

      // Create indexes after connection
      await this.createIndexes();

      return this.connection;
    } catch (error) {
      logger.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  // Disconnect from MongoDB
  async disconnect() {
    try {
      if (!this.isConnected) {
        logger.info('Not connected to MongoDB');
        return;
      }

      await mongoose.disconnect();
      this.isConnected = false;
      this.connection = null;

      logger.info('✅ Disconnected from MongoDB');
    } catch (error) {
      logger.error('❌ Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  // Set up MongoDB connection event handlers
  setupEventHandlers() {
    const db = mongoose.connection;

    db.on('connected', () => {
      logger.info('📡 MongoDB connection established');
    });

    db.on('error', (error) => {
      logger.error('❌ MongoDB connection error:', error);
    });

    db.on('disconnected', () => {
      logger.warn('📡 MongoDB disconnected');
      this.isConnected = false;
    });

    db.on('reconnected', () => {
      logger.info('📡 MongoDB reconnected');
      this.isConnected = true;
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      logger.info('📡 SIGINT received, closing MongoDB connection...');
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('📡 SIGTERM received, closing MongoDB connection...');
      await this.disconnect();
      process.exit(0);
    });
  }

  // Extract database name from URI for logging
  getDatabaseName(uri) {
    try {
      const match = uri.match(/\/([^/?]+)(\?|$)/);
      return match ? match[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // Create essential database indexes
  async createIndexes() {
    try {
      logger.info('📚 Creating database indexes...');

      const db = mongoose.connection.db;
      
      // Users collection indexes
      await this.createCollectionIndexes(db, 'users', [
        { email: 1 }, // Unique email lookup
        { 'profile.location': '2dsphere' }, // Geospatial queries
        { status: 1, 'verification.emailVerified': 1 }, // Active verified users
        { createdAt: -1 }, // Recent users
        { 'metadata.lastActiveAt': -1 }, // Active users sorting
        { 'analytics.totalSwipes': -1 }, // User engagement
      ]);

      // Matches collection indexes
      await this.createCollectionIndexes(db, 'matches', [
        { user1: 1, user2: 1 }, // Unique match lookup
        { user1: 1, mutual: 1 }, // User's matches
        { user2: 1, mutual: 1 }, // User's matches (reverse)
        { matchedAt: -1 }, // Recent matches
        { expiresAt: 1 }, // Cleanup expired matches
        { status: 1 }, // Active matches
        { 'compatibility.score': -1 } // High compatibility matches
      ]);

      // Conversations collection indexes
      await this.createCollectionIndexes(db, 'conversations', [
        { participants: 1 }, // User's conversations
        { 'lastMessage.timestamp': -1 }, // Recent conversations
        { status: 1 }, // Active conversations
        { expiresAt: 1 }, // Cleanup expired conversations
        { matchId: 1 } // Match to conversation lookup
      ]);

      // Messages collection indexes
      await this.createCollectionIndexes(db, 'messages', [
        { conversationId: 1, timestamp: -1 }, // Conversation messages
        { sender: 1, timestamp: -1 }, // User's messages
        { timestamp: -1 }, // Global message timeline
        { 'content.type': 1 }, // Message type filtering
        { isDeleted: 1 } // Active messages
      ]);

      // Activities collection indexes
      await this.createCollectionIndexes(db, 'activities', [
        { location: '2dsphere' }, // Location-based queries
        { category: 1, priceRange: 1 }, // Category filtering
        { averageRating: -1 }, // Top rated activities
        { tags: 1 }, // Tag-based search
        { status: 1, isApproved: 1 }, // Active approved activities
        { createdBy: 1 }, // User's activities
        { 'metadata.viewCount': -1 } // Popular activities
      ]);

      // Text search indexes
      await this.createTextSearchIndexes(db);

      logger.info('✅ Database indexes created successfully');
    } catch (error) {
      logger.error('❌ Error creating database indexes:', error);
      // Don't throw error - app can still function without indexes
    }
  }

  // Helper to create indexes for a collection
  async createCollectionIndexes(db, collectionName, indexes) {
    const collection = db.collection(collectionName);
    
    for (const index of indexes) {
      try {
        const options = {};
        
        // Add unique constraint for certain indexes
        if (collectionName === 'users' && index.email) {
          options.unique = true;
        }
        if (collectionName === 'matches' && index.user1 && index.user2) {
          options.unique = true;
        }
        if (collectionName === 'conversations' && index.matchId) {
          options.unique = true;
        }

        await collection.createIndex(index, options);
        logger.debug(`✓ Created index for ${collectionName}:`, index);
      } catch (error) {
        // Index might already exist
        if (error.code !== 85) { // Index already exists
          logger.warn(`⚠️ Failed to create index for ${collectionName}:`, index, error.message);
        }
      }
    }
  }

  // Create text search indexes
  async createTextSearchIndexes(db) {
    try {
      // Activities text search
      await db.collection('activities').createIndex({
        title: 'text',
        description: 'text',
        tags: 'text',
        'location.address': 'text'
      });

      // Users text search (for admin)
      await db.collection('users').createIndex({
        'profile.name': 'text',
        email: 'text'
      });

      logger.debug('✓ Created text search indexes');
    } catch (error) {
      if (error.code !== 85) {
        logger.warn('⚠️ Failed to create text search indexes:', error.message);
      }
    }
  }

  // Get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      database: mongoose.connection.name,
      port: mongoose.connection.port
    };
  }

  // Health check for the database
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return {
          status: 'disconnected',
          message: 'Not connected to database'
        };
      }

      // Ping the database
      await mongoose.connection.db.admin().ping();
      
      // Get connection stats
      const stats = await mongoose.connection.db.stats();
      
      return {
        status: 'healthy',
        message: 'Database connection is healthy',
        details: {
          collections: stats.collections,
          dataSize: stats.dataSize,
          indexSize: stats.indexSize,
          storageSize: stats.storageSize,
          uptime: process.uptime()
        }
      };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        status: 'unhealthy',
        message: error.message,
        error: error.name
      };
    }
  }

  // Clean up expired data
  async cleanupExpiredData() {
    try {
      logger.info('🧹 Starting expired data cleanup...');

      const now = new Date();
      let totalCleaned = 0;

      // Clean up expired matches
      const expiredMatches = await mongoose.connection.db.collection('matches').deleteMany({
        expiresAt: { $lt: now },
        status: { $ne: 'deleted' }
      });
      totalCleaned += expiredMatches.deletedCount;

      // Clean up expired conversations  
      const expiredConversations = await mongoose.connection.db.collection('conversations').deleteMany({
        expiresAt: { $lt: now },
        status: { $ne: 'deleted' }
      });
      totalCleaned += expiredConversations.deletedCount;

      // Clean up expired notifications
      const expiredNotifications = await mongoose.connection.db.collection('notifications').deleteMany({
        expiresAt: { $lt: now }
      });
      totalCleaned += expiredNotifications.deletedCount;

      logger.info(`✅ Cleaned up ${totalCleaned} expired records`);
      
      return { cleaned: totalCleaned };
    } catch (error) {
      logger.error('❌ Error during data cleanup:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new DatabaseConfig();