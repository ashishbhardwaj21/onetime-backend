/**
 * Performance Configuration and Optimization Settings
 * Handles production scaling, caching, and performance tuning
 */

const os = require('os');

// Calculate optimal settings based on system resources
const cpuCount = os.cpus().length;
const totalMemory = os.totalmem();
const memoryInGB = Math.floor(totalMemory / (1024 * 1024 * 1024));

const performanceConfig = {
  // Server optimization
  server: {
    // Cluster configuration
    clustering: {
      enabled: process.env.NODE_ENV === 'production',
      workers: process.env.CLUSTER_WORKERS || Math.min(cpuCount, 8),
      restartDelay: 1000,
      maxRestarts: 5
    },

    // Connection limits
    connections: {
      maxConnections: process.env.MAX_CONNECTIONS || 10000,
      timeout: parseInt(process.env.CONNECTION_TIMEOUT) || 30000,
      keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 5000,
      headersTimeout: parseInt(process.env.HEADERS_TIMEOUT) || 60000
    },

    // Request optimization
    requests: {
      bodyLimit: process.env.BODY_LIMIT || '10mb',
      parameterLimit: parseInt(process.env.PARAMETER_LIMIT) || 1000,
      urlLength: parseInt(process.env.URL_LENGTH_LIMIT) || 2048
    }
  },

  // Database optimization
  database: {
    mongodb: {
      // Connection pool settings
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || Math.min(cpuCount * 2, 20),
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 5,
      maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_TIME) || 30000,
      
      // Performance settings
      bufferMaxEntries: 0, // Disable mongoose buffering
      bufferCommands: false,
      readPreference: process.env.DB_READ_PREFERENCE || 'secondaryPreferred',
      writeConcern: {
        w: process.env.NODE_ENV === 'production' ? 'majority' : 1,
        j: true,
        wtimeout: 5000
      }
    },

    // Query optimization
    queries: {
      defaultLimit: 100,
      maxLimit: 1000,
      timeout: 30000,
      enableExplain: process.env.NODE_ENV === 'development',
      
      // Aggregation pipeline limits
      aggregationTimeout: 60000,
      maxTimeMS: 30000,
      allowDiskUse: true
    }
  },

  // Caching configuration
  cache: {
    redis: {
      // Connection settings
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      db: parseInt(process.env.REDIS_DB) || 0,
      
      // Performance settings
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableOfflineQueue: false,
      maxMemoryPolicy: 'allkeys-lru',
      
      // Connection pool
      lazyConnect: true,
      keepAlive: true,
      family: 4,
      
      // Cluster settings
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100
    },

    // Cache strategies
    strategies: {
      // Time-based expiration
      shortTerm: 300,      // 5 minutes
      mediumTerm: 3600,    // 1 hour
      longTerm: 86400,     // 24 hours
      
      // Cache levels
      levels: {
        l1: { ttl: 60, maxKeys: 1000 },      // In-memory
        l2: { ttl: 3600, maxKeys: 10000 },   // Redis
        l3: { ttl: 86400, maxKeys: 100000 }  // Persistent
      }
    }
  },

  // Session optimization
  session: {
    store: 'redis',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    },

    // Session cleanup
    cleanup: {
      interval: 3600000, // 1 hour
      maxAge: 86400000   // 24 hours
    }
  },

  // Rate limiting
  rateLimiting: {
    // Different limits for different endpoints
    profiles: {
      strict: { windowMs: 60000, max: 10 },        // 10 requests per minute
      moderate: { windowMs: 60000, max: 100 },     // 100 requests per minute
      lenient: { windowMs: 60000, max: 1000 },     // 1000 requests per minute
      
      // Special limits
      auth: { windowMs: 900000, max: 5 },          // 5 login attempts per 15 minutes
      upload: { windowMs: 3600000, max: 50 },      // 50 uploads per hour
      api: { windowMs: 60000, max: 1000 }          // 1000 API calls per minute
    },

    // Redis store for distributed rate limiting
    store: 'redis',
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },

  // Compression settings
  compression: {
    level: 6, // Balance between compression ratio and CPU usage
    threshold: 1024, // Only compress responses larger than 1KB
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return true;
    }
  },

  // Static file serving
  static: {
    maxAge: process.env.STATIC_MAX_AGE || '1d',
    etag: true,
    lastModified: true,
    cacheControl: true,
    
    // Compression for static files
    compress: true,
    gzipLevel: 6,
    brotliLevel: 6
  },

  // Memory management
  memory: {
    // Heap limits
    maxOldSpaceSize: Math.min(memoryInGB * 512, 4096), // MB
    maxSemiSpaceSize: 128, // MB
    
    // Garbage collection
    gc: {
      aggressive: process.env.NODE_ENV === 'production',
      interval: 60000, // Run GC hint every minute in production
      memoryThreshold: 0.8 // Trigger at 80% memory usage
    },

    // Memory monitoring
    monitoring: {
      interval: 30000, // Check every 30 seconds
      warningThreshold: 0.8, // Warn at 80%
      criticalThreshold: 0.9  // Critical at 90%
    }
  },

  // Socket.IO optimization
  socketio: {
    // Transport optimization
    transports: ['websocket', 'polling'],
    upgradeTimeout: 10000,
    pingTimeout: 5000,
    pingInterval: 25000,
    
    // Connection limits
    maxHttpBufferSize: 1e6, // 1MB
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true
    },

    // Scaling with Redis adapter
    adapter: {
      type: 'redis',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379
    }
  },

  // Background job optimization
  jobs: {
    // Queue settings
    concurrency: {
      high: Math.min(cpuCount, 4),     // High priority jobs
      normal: Math.min(cpuCount * 2, 8), // Normal priority jobs
      low: Math.min(cpuCount, 2)       // Low priority jobs
    },

    // Retry settings
    retry: {
      attempts: 3,
      delay: 2000,
      backoff: 'exponential'
    },

    // Job cleanup
    cleanup: {
      completed: 86400000, // Keep completed jobs for 24 hours
      failed: 604800000    // Keep failed jobs for 7 days
    }
  },

  // Monitoring and metrics
  monitoring: {
    // Performance metrics collection
    metrics: {
      enabled: true,
      interval: 10000, // Collect every 10 seconds
      
      // Metric types
      system: true,    // CPU, memory, disk
      database: true,  // DB connections, query times
      http: true,      // Request/response metrics
      custom: true     // Application-specific metrics
    },

    // Health checks
    healthCheck: {
      timeout: 5000,
      interval: 30000,
      
      // Services to check
      services: ['database', 'redis', 'storage'],
      
      // Thresholds
      thresholds: {
        responseTime: 1000,  // Max 1 second
        memoryUsage: 0.9,    // Max 90%
        cpuUsage: 0.8        // Max 80%
      }
    }
  }
};

// Dynamic configuration based on environment
if (process.env.NODE_ENV === 'production') {
  // Production optimizations
  performanceConfig.server.clustering.enabled = true;
  performanceConfig.cache.strategies.longTerm = 604800; // 7 days
  performanceConfig.static.maxAge = '7d';
  performanceConfig.compression.level = 9; // Maximum compression
  
} else if (process.env.NODE_ENV === 'development') {
  // Development settings
  performanceConfig.server.clustering.enabled = false;
  performanceConfig.database.queries.enableExplain = true;
  performanceConfig.monitoring.metrics.interval = 5000; // More frequent in dev
}

module.exports = performanceConfig;