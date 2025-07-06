/**
 * Production-Optimized Server
 * High-performance server with clustering, caching, and monitoring
 */

const cluster = require('cluster');
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

// Import optimized configurations and services
const performanceConfig = require('./config/performance');
const optimizedDatabase = require('./config/optimizedDatabase');
const CacheService = require('./services/CacheService');
const DatabaseOptimizationService = require('./services/DatabaseOptimizationService');
const performanceMiddleware = require('./middleware/performanceMiddleware');
const logger = require('./utils/logger');

// Import existing middleware and routes
const auth = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

// Route imports
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const activityRoutes = require('./routes/activities');
const interactionRoutes = require('./routes/interactions');
const subscriptionRoutes = require('./routes/subscriptions');
const adminRoutes = require('./routes/admin');

class ProductionServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.io = null;
    this.redisClient = null;
    this.isShuttingDown = false;
    
    // Performance metrics
    this.metrics = {
      startTime: Date.now(),
      requestCount: 0,
      errorCount: 0,
      activeConnections: 0
    };
  }

  async initialize() {
    try {
      logger.info('Initializing production server...');

      // Initialize database connection
      await this.initializeDatabase();
      
      // Initialize Redis for caching and sessions
      await this.initializeRedis();
      
      // Setup Express application
      this.setupExpress();
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Create HTTP server
      this.server = http.createServer(this.app);
      
      // Setup Socket.IO with Redis adapter
      await this.setupSocketIO();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      // Setup health monitoring
      this.setupHealthMonitoring();
      
      logger.info('Production server initialized successfully');
      
    } catch (error) {
      logger.error('Server initialization failed:', error);
      process.exit(1);
    }
  }

  async initializeDatabase() {
    try {
      await optimizedDatabase.connect();
      
      // Create optimal indexes in production
      if (process.env.NODE_ENV === 'production') {
        await optimizedDatabase.createOptimalIndexes();
      }
      
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  async initializeRedis() {
    try {
      this.redisClient = new Redis({
        host: performanceConfig.cache.redis.host,
        port: performanceConfig.cache.redis.port,
        db: performanceConfig.cache.redis.db,
        retryDelayOnFailover: performanceConfig.cache.redis.retryDelayOnFailover,
        enableOfflineQueue: performanceConfig.cache.redis.enableOfflineQueue,
        lazyConnect: true
      });

      await this.redisClient.connect();
      
      this.redisClient.on('error', (err) => {
        logger.error('Redis connection error:', err);
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      logger.info('Redis initialized successfully');
      
    } catch (error) {
      logger.error('Redis initialization failed:', error);
      throw error;
    }
  }

  setupExpress() {
    // Trust proxy for proper IP detection behind load balancers
    this.app.set('trust proxy', 1);
    
    // Disable x-powered-by header for security
    this.app.disable('x-powered-by');
    
    // Set optimal Express settings
    this.app.set('etag', 'strong');
    this.app.set('query parser', 'extended');
  }

  setupMiddleware() {
    // Security headers
    this.app.use(performanceMiddleware.securityHeaders());
    
    // Request timing and metrics
    this.app.use(performanceMiddleware.requestTiming());
    
    // Compression
    this.app.use(performanceMiddleware.compressionMiddleware());
    
    // CORS with performance optimizations
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
      optionsSuccessStatus: 200,
      maxAge: 86400 // Cache preflight for 24 hours
    }));

    // Request optimization
    this.app.use(performanceMiddleware.requestOptimization());
    
    // Memory monitoring
    this.app.use(performanceMiddleware.memoryMonitoring());
    
    // Request size limiting
    this.app.use(performanceMiddleware.requestSizeLimiting());
    
    // Body parsing with optimizations
    this.app.use(express.json({ 
      limit: performanceConfig.server.requests.bodyLimit,
      type: ['application/json', 'text/plain']
    }));
    
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: performanceConfig.server.requests.bodyLimit,
      parameterLimit: performanceConfig.server.requests.parameterLimit
    }));

    // Health check endpoint (before rate limiting)
    this.app.use(performanceMiddleware.healthCheck());
    
    // Graceful shutdown middleware
    this.app.use(performanceMiddleware.gracefulShutdown());
    
    // Rate limiting with Redis store
    this.app.use('/api/', rateLimiter.createRateLimiter({
      windowMs: performanceConfig.rateLimiting.profiles.api.windowMs,
      max: performanceConfig.rateLimiting.profiles.api.max,
      store: 'redis',
      redisClient: this.redisClient
    }));
  }

  setupRoutes() {
    // Add request counter middleware
    this.app.use((req, res, next) => {
      this.metrics.requestCount++;
      global.requestCount = this.metrics.requestCount;
      next();
    });

    // API routes with caching where appropriate
    this.app.use('/api/auth', authRoutes);
    
    this.app.use('/api/users', 
      performanceMiddleware.responseCache({ 
        ttl: performanceConfig.cache.strategies.shortTerm,
        keyGenerator: (req) => `users:${req.user?.id}:${req.originalUrl}`,
        skipCondition: (req) => req.method !== 'GET'
      }),
      userRoutes
    );
    
    this.app.use('/api/activities',
      performanceMiddleware.responseCache({ 
        ttl: performanceConfig.cache.strategies.mediumTerm,
        keyGenerator: (req) => `activities:${req.originalUrl}:${JSON.stringify(req.query)}`,
        skipCondition: (req) => req.method !== 'GET'
      }),
      activityRoutes
    );
    
    this.app.use('/api/interactions', interactionRoutes);
    this.app.use('/api/subscriptions', subscriptionRoutes);
    this.app.use('/api/admin', adminRoutes);

    // Performance metrics endpoint
    this.app.get('/metrics', (req, res) => {
      const metrics = {
        ...this.metrics,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        performance: performanceMiddleware.getMetrics(),
        database: DatabaseOptimizationService.getPerformanceMetrics(),
        cache: CacheService.getStats()
      };
      
      res.json(metrics);
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.originalUrl
      });
    });
  }

  setupErrorHandling() {
    // Error counting middleware
    this.app.use((err, req, res, next) => {
      this.metrics.errorCount++;
      next(err);
    });
    
    // Main error handler
    this.app.use(errorHandler);
  }

  async setupSocketIO() {
    try {
      this.io = socketIo(this.server, {
        cors: {
          origin: process.env.FRONTEND_URL || "http://localhost:3000",
          credentials: true
        },
        transports: performanceConfig.socketio.transports,
        pingTimeout: performanceConfig.socketio.pingTimeout,
        pingInterval: performanceConfig.socketio.pingInterval,
        upgradeTimeout: performanceConfig.socketio.upgradeTimeout,
        maxHttpBufferSize: performanceConfig.socketio.maxHttpBufferSize
      });

      // Setup Redis adapter for Socket.IO clustering
      if (process.env.NODE_ENV === 'production') {
        const pubClient = this.redisClient.duplicate();
        const subClient = this.redisClient.duplicate();
        
        this.io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter configured');
      }

      // Connection handling with performance monitoring
      this.io.on('connection', (socket) => {
        this.metrics.activeConnections++;
        
        socket.on('disconnect', () => {
          this.metrics.activeConnections--;
        });
        
        // Add rate limiting for socket events
        socket.use((packet, next) => {
          // Simple rate limiting - can be enhanced
          const now = Date.now();
          socket.lastEventTime = socket.lastEventTime || 0;
          
          if (now - socket.lastEventTime < 100) { // 10 events per second max
            return next(new Error('Rate limit exceeded'));
          }
          
          socket.lastEventTime = now;
          next();
        });
      });

      // Setup existing socket handlers
      const socketHandlers = require('./socket/socketHandlers');
      socketHandlers.initialize(this.io);
      
      logger.info('Socket.IO initialized successfully');
      
    } catch (error) {
      logger.error('Socket.IO setup failed:', error);
      throw error;
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      this.isShuttingDown = true;

      try {
        // Stop accepting new connections
        this.server.close(async () => {
          logger.info('HTTP server closed');
          
          // Close Socket.IO
          if (this.io) {
            this.io.close();
            logger.info('Socket.IO closed');
          }
          
          // Close database connection
          await optimizedDatabase.gracefulShutdown();
          
          // Close Redis connection
          if (this.redisClient) {
            await this.redisClient.quit();
            logger.info('Redis connection closed');
          }
          
          // Close cache service
          await CacheService.close();
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        });

        // Force shutdown after timeout
        setTimeout(() => {
          logger.error('Graceful shutdown timeout, forcing exit');
          process.exit(1);
        }, 30000); // 30 seconds timeout

      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // PM2 reload
  }

  setupHealthMonitoring() {
    // Performance monitoring interval
    setInterval(() => {
      this.logPerformanceMetrics();
      this.checkSystemHealth();
    }, performanceConfig.monitoring.metrics.interval);
    
    // Memory cleanup interval
    setInterval(() => {
      if (global.gc && process.memoryUsage().heapUsed / process.memoryUsage().heapTotal > 0.8) {
        logger.info('Running garbage collection due to high memory usage');
        global.gc();
      }
    }, 60000); // Every minute
  }

  logPerformanceMetrics() {
    const memUsage = process.memoryUsage();
    const memoryUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
    
    if (this.metrics.requestCount % 1000 === 0 || memoryUsagePercent > 0.8) {
      logger.info('Performance metrics:', {
        requests: this.metrics.requestCount,
        errors: this.metrics.errorCount,
        activeConnections: this.metrics.activeConnections,
        memoryUsagePercent: (memoryUsagePercent * 100).toFixed(2),
        memoryUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        uptime: Math.round(process.uptime()),
        pid: process.pid
      });
    }
  }

  checkSystemHealth() {
    const memUsage = process.memoryUsage();
    const memoryUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
    
    // Memory warnings
    if (memoryUsagePercent > performanceConfig.memory.monitoring.warningThreshold) {
      logger.warn('High memory usage detected', {
        percentage: (memoryUsagePercent * 100).toFixed(2),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
      });
    }
    
    // Check for too many active connections
    if (this.metrics.activeConnections > 1000) {
      logger.warn('High number of active connections', {
        activeConnections: this.metrics.activeConnections
      });
    }
  }

  async start() {
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';

    return new Promise((resolve, reject) => {
      this.server.listen(port, host, (error) => {
        if (error) {
          logger.error('Server failed to start:', error);
          return reject(error);
        }

        logger.info(`Production server started successfully`, {
          port,
          host,
          environment: process.env.NODE_ENV,
          pid: process.pid,
          clustering: performanceConfig.server.clustering.enabled,
          startTime: new Date(this.metrics.startTime).toISOString()
        });

        // Store server reference globally for graceful shutdown
        global.server = this.server;
        
        resolve();
      });
    });
  }
}

// Initialize and start server
async function startServer() {
  try {
    const server = new ProductionServer();
    await server.initialize();
    await server.start();
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle clustering
if (performanceConfig.server.clustering.enabled && cluster.isMaster) {
  // Let cluster manager handle master process
  require('./cluster/clusterManager');
} else {
  // Start server (either single process or worker)
  startServer();
}

module.exports = ProductionServer;