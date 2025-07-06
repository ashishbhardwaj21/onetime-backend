/**
 * Database Optimization Service
 * Handles query optimization, indexing, and database performance monitoring
 */

const mongoose = require('mongoose');
const performanceConfig = require('../config/performance');
const logger = require('../utils/logger');

class DatabaseOptimizationService {
  constructor() {
    this.queryStats = {
      slow: [],
      frequent: new Map(),
      errors: []
    };
    
    this.indexAnalysis = {
      missing: [],
      unused: [],
      suggestions: []
    };

    this.connectionMetrics = {
      active: 0,
      available: 0,
      created: 0,
      destroyed: 0
    };

    this.initialize();
  }

  initialize() {
    // Setup query monitoring
    this.setupQueryMonitoring();
    
    // Setup connection monitoring
    this.setupConnectionMonitoring();
    
    // Schedule periodic optimization
    this.scheduleOptimization();
    
    logger.info('Database optimization service initialized');
  }

  // Query Monitoring and Optimization
  setupQueryMonitoring() {
    if (performanceConfig.database.queries.enableExplain) {
      // Monkey patch mongoose to capture slow queries
      const originalExec = mongoose.Query.prototype.exec;
      
      mongoose.Query.prototype.exec = function(callback) {
        const startTime = Date.now();
        const query = this;
        
        return originalExec.call(this, function(err, result) {
          const duration = Date.now() - startTime;
          
          // Log slow queries
          if (duration > 1000) { // Queries taking more than 1 second
            logger.warn('Slow query detected:', {
              collection: query.collection.name,
              operation: query.op,
              duration,
              conditions: query.getQuery(),
              sort: query.getOptions().sort,
              limit: query.getOptions().limit
            });
            
            // Store for analysis
            const service = require('./DatabaseOptimizationService');
            service.recordSlowQuery({
              collection: query.collection.name,
              operation: query.op,
              duration,
              conditions: query.getQuery(),
              options: query.getOptions(),
              timestamp: new Date()
            });
          }
          
          // Track frequent queries
          const querySignature = this.generateQuerySignature(query);
          const count = this.queryStats.frequent.get(querySignature) || 0;
          this.queryStats.frequent.set(querySignature, count + 1);
          
          if (callback) callback(err, result);
        }.bind(this));
      }.bind(this);
    }
  }

  setupConnectionMonitoring() {
    const db = mongoose.connection;
    
    db.on('connected', () => {
      this.connectionMetrics.created++;
      logger.info('Database connected');
    });
    
    db.on('disconnected', () => {
      this.connectionMetrics.destroyed++;
      logger.warn('Database disconnected');
    });
    
    db.on('error', (error) => {
      logger.error('Database connection error:', error);
      this.queryStats.errors.push({
        error: error.message,
        timestamp: new Date()
      });
    });

    // Monitor connection pool
    setInterval(() => {
      if (db.readyState === 1) { // Connected
        const poolStats = db.db?.serverConfig?.s?.coreTopology?.s?.pool?.s || {};
        this.connectionMetrics.active = poolStats.currentSize || 0;
        this.connectionMetrics.available = poolStats.availableSize || 0;
      }
    }, 30000);
  }

  recordSlowQuery(queryInfo) {
    this.queryStats.slow.push(queryInfo);
    
    // Keep only recent slow queries (last 1000)
    if (this.queryStats.slow.length > 1000) {
      this.queryStats.slow = this.queryStats.slow.slice(-1000);
    }
  }

  generateQuerySignature(query) {
    return `${query.collection.name}:${query.op}:${JSON.stringify(query.getQuery())}`;
  }

  // Index Management
  async analyzeIndexes() {
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      const analysis = {
        missing: [],
        unused: [],
        suggestions: [],
        existing: []
      };

      for (const collection of collections) {
        const collectionName = collection.name;
        const indexes = await mongoose.connection.db.collection(collectionName).listIndexes().toArray();
        
        // Analyze existing indexes
        analysis.existing.push({
          collection: collectionName,
          indexes: indexes.map(idx => ({
            name: idx.name,
            keys: idx.key,
            unique: idx.unique || false,
            sparse: idx.sparse || false,
            background: idx.background || false
          }))
        });

        // Check for missing recommended indexes
        const missingIndexes = await this.findMissingIndexes(collectionName);
        if (missingIndexes.length > 0) {
          analysis.missing.push({
            collection: collectionName,
            indexes: missingIndexes
          });
        }

        // Check for unused indexes
        const unusedIndexes = await this.findUnusedIndexes(collectionName, indexes);
        if (unusedIndexes.length > 0) {
          analysis.unused.push({
            collection: collectionName,
            indexes: unusedIndexes
          });
        }
      }

      this.indexAnalysis = analysis;
      return analysis;

    } catch (error) {
      logger.error('Error analyzing indexes:', error);
      throw error;
    }
  }

  async findMissingIndexes(collectionName) {
    const missing = [];
    
    // Define recommended indexes per collection
    const recommendedIndexes = {
      users: [
        { email: 1 },
        { 'profile.location.coordinates': '2dsphere' },
        { status: 1, createdAt: -1 },
        { 'verification.isVerified': 1 },
        { lastActive: -1 }
      ],
      activities: [
        { organizer: 1, status: 1 },
        { category: 1, status: 1 },
        { 'location.coordinates': '2dsphere' },
        { eventDate: 1, status: 1 },
        { createdAt: -1 }
      ],
      interactions: [
        { fromUser: 1, toUser: 1 },
        { fromUser: 1, type: 1, createdAt: -1 },
        { toUser: 1, type: 1, createdAt: -1 }
      ],
      matches: [
        { users: 1, status: 1 },
        { 'users.0': 1, 'users.1': 1 },
        { createdAt: -1 }
      ],
      messages: [
        { conversationId: 1, createdAt: -1 },
        { sender: 1, createdAt: -1 }
      ],
      subscriptions: [
        { userId: 1, status: 1 },
        { status: 1, tier: 1 },
        { expiryDate: 1 }
      ]
    };

    const recommended = recommendedIndexes[collectionName] || [];
    const existing = await mongoose.connection.db.collection(collectionName).listIndexes().toArray();
    const existingKeys = existing.map(idx => JSON.stringify(idx.key));

    for (const recommendedIndex of recommended) {
      const indexKey = JSON.stringify(recommendedIndex);
      if (!existingKeys.includes(indexKey)) {
        missing.push(recommendedIndex);
      }
    }

    return missing;
  }

  async findUnusedIndexes(collectionName, indexes) {
    const unused = [];
    
    try {
      // Get index usage statistics (requires MongoDB 3.2+)
      const stats = await mongoose.connection.db.collection(collectionName).aggregate([
        { $indexStats: {} }
      ]).toArray();

      for (const stat of stats) {
        // Index is considered unused if accessed less than 10 times
        if (stat.accesses.ops < 10 && stat.name !== '_id_') {
          unused.push({
            name: stat.name,
            key: stat.key,
            accesses: stat.accesses.ops,
            since: stat.accesses.since
          });
        }
      }

    } catch (error) {
      // Index statistics might not be available in all MongoDB versions
      logger.warn(`Could not get index usage stats for ${collectionName}:`, error.message);
    }

    return unused;
  }

  async createRecommendedIndexes() {
    try {
      const analysis = await this.analyzeIndexes();
      const results = [];

      for (const collection of analysis.missing) {
        const collectionName = collection.collection;
        
        for (const index of collection.indexes) {
          try {
            await mongoose.connection.db.collection(collectionName).createIndex(index, {
              background: true,
              name: this.generateIndexName(index)
            });
            
            results.push({
              collection: collectionName,
              index,
              status: 'created'
            });
            
            logger.info(`Created index on ${collectionName}:`, index);
            
          } catch (error) {
            logger.error(`Failed to create index on ${collectionName}:`, error);
            results.push({
              collection: collectionName,
              index,
              status: 'failed',
              error: error.message
            });
          }
        }
      }

      return results;

    } catch (error) {
      logger.error('Error creating recommended indexes:', error);
      throw error;
    }
  }

  generateIndexName(indexSpec) {
    const parts = [];
    for (const [field, direction] of Object.entries(indexSpec)) {
      parts.push(`${field}_${direction}`);
    }
    return parts.join('_');
  }

  // Query Optimization
  async optimizeQuery(model, conditions, options = {}) {
    const startTime = Date.now();
    
    try {
      // Apply performance optimizations
      let query = model.find(conditions);
      
      // Add lean() for read-only operations
      if (options.lean !== false) {
        query = query.lean();
      }
      
      // Apply limit if not specified
      if (!options.limit && !options.noLimit) {
        query = query.limit(performanceConfig.database.queries.defaultLimit);
      }
      
      // Apply sort if specified
      if (options.sort) {
        query = query.sort(options.sort);
      }
      
      // Apply select if specified
      if (options.select) {
        query = query.select(options.select);
      }
      
      // Apply population if specified
      if (options.populate) {
        if (Array.isArray(options.populate)) {
          options.populate.forEach(pop => query = query.populate(pop));
        } else {
          query = query.populate(options.populate);
        }
      }
      
      // Set query timeout
      query = query.maxTimeMS(performanceConfig.database.queries.maxTimeMS);
      
      const result = await query.exec();
      const duration = Date.now() - startTime;
      
      // Log if query is slow
      if (duration > 1000) {
        logger.warn(`Slow optimized query (${duration}ms):`, {
          model: model.modelName,
          conditions,
          options
        });
      }
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Query optimization error (${duration}ms):`, {
        model: model.modelName,
        conditions,
        error: error.message
      });
      throw error;
    }
  }

  // Aggregation Optimization
  async optimizeAggregation(model, pipeline, options = {}) {
    const startTime = Date.now();
    
    try {
      // Add performance options
      const aggOptions = {
        allowDiskUse: performanceConfig.database.queries.allowDiskUse,
        maxTimeMS: performanceConfig.database.queries.aggregationTimeout,
        ...options
      };
      
      // Add early filtering and limiting where possible
      const optimizedPipeline = this.optimizePipeline(pipeline);
      
      const result = await model.aggregate(optimizedPipeline, aggOptions);
      const duration = Date.now() - startTime;
      
      if (duration > 5000) {
        logger.warn(`Slow aggregation (${duration}ms):`, {
          model: model.modelName,
          pipeline: optimizedPipeline
        });
      }
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Aggregation optimization error (${duration}ms):`, {
        model: model.modelName,
        error: error.message
      });
      throw error;
    }
  }

  optimizePipeline(pipeline) {
    // Move $match stages as early as possible
    const optimized = [];
    const matchStages = [];
    const otherStages = [];
    
    pipeline.forEach(stage => {
      if (stage.$match) {
        matchStages.push(stage);
      } else {
        otherStages.push(stage);
      }
    });
    
    // Add match stages first, then other stages
    return [...matchStages, ...otherStages];
  }

  // Performance Monitoring
  scheduleOptimization() {
    // Run optimization tasks every hour
    setInterval(async () => {
      try {
        await this.performMaintenanceTasks();
      } catch (error) {
        logger.error('Scheduled optimization error:', error);
      }
    }, 3600000); // 1 hour
  }

  async performMaintenanceTasks() {
    logger.info('Running database maintenance tasks...');
    
    try {
      // Analyze slow queries
      await this.analyzeSlowQueries();
      
      // Check index effectiveness
      await this.analyzeIndexes();
      
      // Clean old statistics
      this.cleanOldStats();
      
      logger.info('Database maintenance completed successfully');
      
    } catch (error) {
      logger.error('Database maintenance error:', error);
    }
  }

  analyzeSlowQueries() {
    if (this.queryStats.slow.length === 0) return;
    
    // Group slow queries by collection and operation
    const grouped = {};
    
    this.queryStats.slow.forEach(query => {
      const key = `${query.collection}:${query.operation}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(query);
    });
    
    // Find patterns and suggest optimizations
    Object.entries(grouped).forEach(([key, queries]) => {
      if (queries.length > 10) {
        logger.warn(`Frequent slow query pattern detected: ${key}`, {
          count: queries.length,
          avgDuration: queries.reduce((sum, q) => sum + q.duration, 0) / queries.length
        });
      }
    });
  }

  cleanOldStats() {
    const oneHourAgo = new Date(Date.now() - 3600000);
    
    // Clean old slow queries
    this.queryStats.slow = this.queryStats.slow.filter(
      query => query.timestamp > oneHourAgo
    );
    
    // Clean old errors
    this.queryStats.errors = this.queryStats.errors.filter(
      error => error.timestamp > oneHourAgo
    );
    
    // Reset frequent query counter periodically
    if (this.queryStats.frequent.size > 10000) {
      this.queryStats.frequent.clear();
    }
  }

  // Metrics and Reporting
  getPerformanceMetrics() {
    return {
      connections: this.connectionMetrics,
      queries: {
        slowCount: this.queryStats.slow.length,
        errorCount: this.queryStats.errors.length,
        frequentCount: this.queryStats.frequent.size
      },
      indexes: {
        missingCount: this.indexAnalysis.missing.length,
        unusedCount: this.indexAnalysis.unused.length
      }
    };
  }

  getSlowQueries(limit = 10) {
    return this.queryStats.slow
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  getFrequentQueries(limit = 10) {
    return Array.from(this.queryStats.frequent.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([signature, count]) => ({ signature, count }));
  }
}

module.exports = new DatabaseOptimizationService();