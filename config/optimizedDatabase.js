/**
 * Optimized Database Configuration
 * Production-ready MongoDB connection with performance tuning
 */

const mongoose = require('mongoose');
const performanceConfig = require('./performance');
const logger = require('../utils/logger');

class OptimizedDatabase {
  constructor() {
    this.connection = null;
    this.connectionOptions = this.buildConnectionOptions();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    
    this.setupMongooseOptimizations();
  }

  buildConnectionOptions() {
    return {
      // Connection pool optimization
      maxPoolSize: performanceConfig.database.mongodb.maxPoolSize,
      minPoolSize: performanceConfig.database.mongodb.minPoolSize,
      maxIdleTimeMS: performanceConfig.database.mongodb.maxIdleTimeMS,
      
      // Connection behavior
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
      connectTimeoutMS: 30000, // 30 seconds
      
      // Heartbeat and monitoring
      heartbeatFrequencyMS: 10000, // 10 seconds
      
      // Buffer settings for better performance
      bufferMaxEntries: performanceConfig.database.mongodb.bufferMaxEntries,
      bufferCommands: performanceConfig.database.mongodb.bufferCommands,
      
      // Read/Write preferences
      readPreference: performanceConfig.database.mongodb.readPreference,
      writeConcern: performanceConfig.database.mongodb.writeConcern,
      
      // Replica set and sharding
      readConcern: { level: 'majority' },
      retryWrites: true,
      retryReads: true,
      
      // Compression (if supported by MongoDB instance)
      compressors: ['zlib', 'snappy'],
      zlibCompressionLevel: 6,
      
      // SSL/TLS settings (for production)
      ssl: process.env.NODE_ENV === 'production',
      sslValidate: process.env.NODE_ENV === 'production',
      
      // Additional performance options
      useNewUrlParser: true,
      useUnifiedTopology: true,
      autoIndex: process.env.NODE_ENV !== 'production', // Disable in production
      autoCreate: process.env.NODE_ENV !== 'production'
    };
  }

  setupMongooseOptimizations() {
    // Disable mongoose buffering for better error handling
    mongoose.set('bufferCommands', false);
    
    // Enable mongoose debugging in development
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', true);
    }
    
    // Set default options for all schemas
    mongoose.set('sanitizeFilter', true);
    mongoose.set('strictQuery', true);
    
    // Optimize toJSON output
    mongoose.set('toJSON', {
      virtuals: false,
      transform: function(doc, ret) {
        delete ret.__v;
        return ret;
      }
    });
  }

  async connect(uri = null) {
    const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/onetime_db';
    
    try {
      logger.info('Connecting to MongoDB...', {
        uri: mongoUri.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
        options: {
          maxPoolSize: this.connectionOptions.maxPoolSize,
          readPreference: this.connectionOptions.readPreference
        }
      });

      this.connection = await mongoose.connect(mongoUri, this.connectionOptions);
      
      this.setupConnectionEventHandlers();
      this.startConnectionMonitoring();
      
      logger.info('MongoDB connected successfully', {
        host: this.connection.connection.host,
        port: this.connection.connection.port,
        database: this.connection.connection.name,
        readyState: this.connection.connection.readyState
      });

      // Reset reconnect attempts on successful connection
      this.reconnectAttempts = 0;
      
      return this.connection;
      
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      await this.handleConnectionError(error, mongoUri);
      throw error;
    }
  }

  setupConnectionEventHandlers() {
    const db = mongoose.connection;

    db.on('connected', () => {
      logger.info('Mongoose connected to MongoDB');
    });

    db.on('error', (error) => {
      logger.error('Mongoose connection error:', error);
    });

    db.on('disconnected', () => {
      logger.warn('Mongoose disconnected from MongoDB');
      this.handleDisconnection();
    });

    db.on('reconnected', () => {
      logger.info('Mongoose reconnected to MongoDB');
      this.reconnectAttempts = 0;
    });

    db.on('close', () => {
      logger.info('Mongoose connection closed');
    });

    // Handle specific connection events
    db.on('fullsetup', () => {
      logger.info('Mongoose connected to replica set');
    });

    db.on('all', () => {
      logger.info('Mongoose connected to all replica set members');
    });
  }

  handleDisconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect().catch(err => {
          logger.error('Reconnection attempt failed:', err);
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      logger.error('Max reconnection attempts reached. Manual intervention required.');
      process.exit(1);
    }
  }

  async handleConnectionError(error, uri) {
    // Log specific error types for better debugging
    if (error.name === 'MongoNetworkError') {
      logger.error('MongoDB network error - check connectivity and firewall settings');
    } else if (error.name === 'MongoAuthenticationError') {
      logger.error('MongoDB authentication failed - check credentials');
    } else if (error.name === 'MongoParseError') {
      logger.error('MongoDB URI parse error - check connection string format');
    }
    
    // Implement retry logic for transient errors
    if (this.isTransientError(error) && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`Retrying connection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
      return this.connect(uri);
    }
  }

  isTransientError(error) {
    const transientErrors = [
      'MongoNetworkError',
      'MongoTimeoutError',
      'MongoServerSelectionError'
    ];
    
    return transientErrors.includes(error.name);
  }

  startConnectionMonitoring() {
    // Monitor connection health every 30 seconds
    setInterval(() => {
      this.checkConnectionHealth();
    }, 30000);
  }

  checkConnectionHealth() {
    const db = mongoose.connection;
    
    if (db.readyState !== 1) { // 1 = connected
      logger.warn('Database connection unhealthy', {
        readyState: db.readyState,
        host: db.host,
        port: db.port
      });
      return;
    }

    // Check connection pool status
    if (db.db && db.db.serverConfig) {
      const poolStats = this.getConnectionPoolStats();
      
      if (poolStats.availableConnections === 0) {
        logger.warn('No available database connections in pool');
      }
      
      // Log pool stats periodically
      if (Date.now() % 300000 < 30000) { // Every 5 minutes
        logger.info('Database connection pool stats:', poolStats);
      }
    }
  }

  getConnectionPoolStats() {
    const db = mongoose.connection;
    const pool = db.db?.serverConfig?.s?.coreTopology?.s?.pool?.s || {};
    
    return {
      totalConnections: pool.totalConnectionCount || 0,
      availableConnections: pool.availableConnectionCount || 0,
      checkedOutConnections: pool.checkedOutConnectionCount || 0,
      minSize: this.connectionOptions.minPoolSize,
      maxSize: this.connectionOptions.maxPoolSize
    };
  }

  async gracefulShutdown() {
    logger.info('Initiating graceful database shutdown...');
    
    try {
      // Close the connection gracefully
      await mongoose.connection.close();
      logger.info('Database connection closed successfully');
      
    } catch (error) {
      logger.error('Error during database shutdown:', error);
      throw error;
    }
  }

  // Database performance utilities
  async createOptimalIndexes() {
    logger.info('Creating optimal database indexes...');
    
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      const indexOperations = [];

      // Define optimal indexes for each collection
      const optimalIndexes = {
        users: [
          { email: 1 }, // Unique constraint should be handled in schema
          { 'profile.location.coordinates': '2dsphere' },
          { status: 1, lastActive: -1 },
          { 'verification.isVerified': 1, createdAt: -1 },
          { createdAt: -1 }
        ],
        activities: [
          { organizer: 1, status: 1 },
          { category: 1, status: 1, eventDate: 1 },
          { 'location.coordinates': '2dsphere' },
          { eventDate: 1, status: 1 },
          { status: 1, createdAt: -1 }
        ],
        interactions: [
          { fromUser: 1, toUser: 1, type: 1 },
          { fromUser: 1, createdAt: -1 },
          { toUser: 1, createdAt: -1 },
          { type: 1, createdAt: -1 }
        ],
        matches: [
          { users: 1, status: 1 },
          { 'users.0': 1, 'users.1': 1 },
          { status: 1, createdAt: -1 }
        ],
        messages: [
          { conversationId: 1, createdAt: -1 },
          { sender: 1, createdAt: -1 },
          { conversationId: 1, readBy: 1 }
        ],
        subscriptions: [
          { userId: 1, status: 1 },
          { status: 1, tier: 1 },
          { expiryDate: 1, status: 1 }
        ]
      };

      for (const collection of collections) {
        const collectionName = collection.name;
        const indexes = optimalIndexes[collectionName];
        
        if (indexes) {
          for (const index of indexes) {
            indexOperations.push(
              mongoose.connection.db.collection(collectionName).createIndex(index, {
                background: true,
                name: this.generateIndexName(index)
              }).catch(err => {
                // Index might already exist
                if (!err.message.includes('already exists')) {
                  logger.error(`Failed to create index on ${collectionName}:`, err);
                }
              })
            );
          }
        }
      }

      await Promise.allSettled(indexOperations);
      logger.info('Optimal indexes creation completed');
      
    } catch (error) {
      logger.error('Error creating optimal indexes:', error);
    }
  }

  generateIndexName(indexSpec) {
    const parts = [];
    for (const [field, direction] of Object.entries(indexSpec)) {
      const cleanField = field.replace(/\./g, '_');
      parts.push(`${cleanField}_${direction}`);
    }
    return parts.join('_');
  }

  async getConnectionInfo() {
    const db = mongoose.connection;
    
    return {
      readyState: db.readyState,
      host: db.host,
      port: db.port,
      name: db.name,
      poolStats: this.getConnectionPoolStats(),
      options: {
        maxPoolSize: this.connectionOptions.maxPoolSize,
        minPoolSize: this.connectionOptions.minPoolSize,
        readPreference: this.connectionOptions.readPreference
      }
    };
  }

  // Query optimization helpers
  optimizeQuery(query) {
    return query
      .lean() // Return plain JavaScript objects instead of Mongoose documents
      .maxTimeMS(performanceConfig.database.queries.maxTimeMS);
  }

  optimizeAggregation(aggregation) {
    return aggregation.option({
      allowDiskUse: performanceConfig.database.queries.allowDiskUse,
      maxTimeMS: performanceConfig.database.queries.aggregationTimeout
    });
  }
}

module.exports = new OptimizedDatabase();