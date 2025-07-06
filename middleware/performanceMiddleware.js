/**
 * Performance Middleware
 * Request/response optimization, metrics collection, and performance monitoring
 */

const compression = require('compression');
const helmet = require('helmet');
const performanceConfig = require('../config/performance');
const CacheService = require('../services/CacheService');
const logger = require('../utils/logger');

class PerformanceMiddleware {
  constructor() {
    this.requestMetrics = {
      totalRequests: 0,
      activeRequests: 0,
      averageResponseTime: 0,
      slowRequests: [],
      errorCount: 0
    };

    this.responseTimeHistory = [];
    this.memoryUsage = [];
    
    this.initialize();
  }

  initialize() {
    // Start performance monitoring
    this.startPerformanceMonitoring();
    
    // Schedule cleanup tasks
    this.scheduleCleanup();
    
    logger.info('Performance middleware initialized');
  }

  // Core middleware functions
  requestTiming() {
    return (req, res, next) => {
      req.startTime = process.hrtime.bigint();
      req.timestamp = new Date();
      
      this.requestMetrics.totalRequests++;
      this.requestMetrics.activeRequests++;

      // Override res.end to capture response time
      const originalEnd = res.end;
      res.end = function(...args) {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - req.startTime) / 1000000; // Convert to milliseconds
        
        // Update metrics
        this.requestMetrics.activeRequests--;
        this.updateResponseTimeMetrics(duration);
        
        // Log slow requests
        if (duration > 1000) {
          this.logSlowRequest(req, res, duration);
        }

        // Add performance headers
        res.set('X-Response-Time', `${duration.toFixed(2)}ms`);
        res.set('X-Request-ID', req.id || 'unknown');
        
        originalEnd.apply(this, args);
      }.bind(this);

      next();
    };
  }

  // Request optimization middleware
  requestOptimization() {
    return (req, res, next) => {
      // Set optimal headers
      res.set({
        'X-DNS-Prefetch-Control': 'on',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });

      // Enable keep-alive
      res.set('Connection', 'keep-alive');

      // Cache control for API responses
      if (req.path.startsWith('/api/')) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      }

      next();
    };
  }

  // Response caching middleware
  responseCache(options = {}) {
    const {
      ttl = 300, // 5 minutes default
      keyGenerator = null,
      skipCondition = null
    } = options;

    return async (req, res, next) => {
      // Skip caching for non-GET requests
      if (req.method !== 'GET') {
        return next();
      }

      // Skip if condition is met
      if (skipCondition && skipCondition(req)) {
        return next();
      }

      // Generate cache key
      const cacheKey = keyGenerator 
        ? keyGenerator(req)
        : `response:${req.originalUrl}:${JSON.stringify(req.query)}`;

      try {
        // Try to get cached response
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          res.set('X-Cache', 'HIT');
          res.set('X-Cache-Key', cacheKey);
          return res.json(cached);
        }

        // Override res.json to cache the response
        const originalJson = res.json;
        res.json = function(data) {
          // Cache successful responses
          if (res.statusCode >= 200 && res.statusCode < 300) {
            CacheService.set(cacheKey, data, ttl).catch(err => {
              logger.error('Response cache error:', err);
            });
          }
          
          res.set('X-Cache', 'MISS');
          res.set('X-Cache-Key', cacheKey);
          return originalJson.call(this, data);
        };

        next();

      } catch (error) {
        logger.error('Response cache middleware error:', error);
        next();
      }
    };
  }

  // Memory monitoring middleware
  memoryMonitoring() {
    return (req, res, next) => {
      const memUsage = process.memoryUsage();
      const memoryUsagePercent = memUsage.heapUsed / memUsage.heapTotal;

      // Add memory info to request
      req.memoryInfo = {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        usagePercent: memoryUsagePercent
      };

      // Warn on high memory usage
      if (memoryUsagePercent > performanceConfig.memory.monitoring.warningThreshold) {
        logger.warn('High memory usage detected:', {
          usagePercent: (memoryUsagePercent * 100).toFixed(2),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
        });
      }

      // Critical memory usage
      if (memoryUsagePercent > performanceConfig.memory.monitoring.criticalThreshold) {
        logger.error('Critical memory usage:', {
          usagePercent: (memoryUsagePercent * 100).toFixed(2),
          triggering: 'garbage collection'
        });
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      next();
    };
  }

  // Request size limiting
  requestSizeLimiting() {
    return (req, res, next) => {
      const contentLength = parseInt(req.get('content-length')) || 0;
      const maxSize = this.parseSize(performanceConfig.server.requests.bodyLimit);

      if (contentLength > maxSize) {
        return res.status(413).json({
          success: false,
          error: 'Request entity too large',
          maxSize: performanceConfig.server.requests.bodyLimit
        });
      }

      next();
    };
  }

  // Security headers middleware
  securityHeaders() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false
    });
  }

  // Compression middleware with custom settings
  compressionMiddleware() {
    return compression({
      level: performanceConfig.compression.level,
      threshold: performanceConfig.compression.threshold,
      filter: performanceConfig.compression.filter,
      
      // Custom compression for JSON responses
      chunkSize: 16 * 1024, // 16KB chunks
      windowBits: 15,
      memLevel: 8
    });
  }

  // Graceful shutdown middleware
  gracefulShutdown() {
    let isShuttingDown = false;

    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, starting graceful shutdown...');
      isShuttingDown = true;
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, starting graceful shutdown...');
      isShuttingDown = true;
    });

    return (req, res, next) => {
      if (isShuttingDown) {
        res.set('Connection', 'close');
        return res.status(503).json({
          success: false,
          error: 'Server is shutting down',
          retryAfter: 10
        });
      }
      next();
    };
  }

  // Health check middleware
  healthCheck() {
    return (req, res, next) => {
      if (req.path === '/health' || req.path === '/health/') {
        const healthData = this.getHealthStatus();
        
        const status = healthData.status === 'healthy' ? 200 : 503;
        return res.status(status).json(healthData);
      }
      next();
    };
  }

  // Metrics collection
  updateResponseTimeMetrics(duration) {
    this.responseTimeHistory.push({
      duration,
      timestamp: new Date()
    });

    // Keep only recent history (last 1000 requests)
    if (this.responseTimeHistory.length > 1000) {
      this.responseTimeHistory = this.responseTimeHistory.slice(-1000);
    }

    // Update average response time
    const recent = this.responseTimeHistory.slice(-100); // Last 100 requests
    this.requestMetrics.averageResponseTime = 
      recent.reduce((sum, req) => sum + req.duration, 0) / recent.length;
  }

  logSlowRequest(req, res, duration) {
    const slowRequest = {
      method: req.method,
      url: req.originalUrl,
      userAgent: req.get('user-agent'),
      ip: req.ip,
      duration,
      statusCode: res.statusCode,
      timestamp: new Date()
    };

    this.requestMetrics.slowRequests.push(slowRequest);
    
    // Keep only recent slow requests
    if (this.requestMetrics.slowRequests.length > 100) {
      this.requestMetrics.slowRequests = this.requestMetrics.slowRequests.slice(-100);
    }

    logger.warn('Slow request detected:', slowRequest);
  }

  // Performance monitoring
  startPerformanceMonitoring() {
    setInterval(() => {
      this.collectSystemMetrics();
    }, performanceConfig.monitoring.metrics.interval);
  }

  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    this.memoryUsage.push({
      timestamp: new Date(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    });

    // Keep only recent memory usage (last hour)
    const oneHourAgo = new Date(Date.now() - 3600000);
    this.memoryUsage = this.memoryUsage.filter(m => m.timestamp > oneHourAgo);

    // Log performance metrics
    if (this.requestMetrics.totalRequests % 1000 === 0) {
      logger.info('Performance metrics:', {
        totalRequests: this.requestMetrics.totalRequests,
        activeRequests: this.requestMetrics.activeRequests,
        averageResponseTime: this.requestMetrics.averageResponseTime.toFixed(2),
        memoryUsageMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        uptime: Math.round(process.uptime())
      });
    }
  }

  scheduleCleanup() {
    // Clean up old metrics every hour
    setInterval(() => {
      const oneHourAgo = new Date(Date.now() - 3600000);
      
      this.responseTimeHistory = this.responseTimeHistory.filter(
        r => r.timestamp > oneHourAgo
      );
      
      this.requestMetrics.slowRequests = this.requestMetrics.slowRequests.filter(
        r => r.timestamp > oneHourAgo
      );
      
    }, 3600000); // 1 hour
  }

  // Utility methods
  parseSize(size) {
    if (typeof size === 'number') return size;
    
    const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
    const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
    
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2] || 'b';
    
    return Math.floor(value * units[unit]);
  }

  getHealthStatus() {
    const memUsage = process.memoryUsage();
    const memoryUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
    
    const status = {
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        percentage: Math.round(memoryUsagePercent * 100)
      },
      requests: {
        total: this.requestMetrics.totalRequests,
        active: this.requestMetrics.activeRequests,
        averageResponseTime: Math.round(this.requestMetrics.averageResponseTime)
      },
      version: process.version,
      environment: process.env.NODE_ENV
    };

    // Determine overall health status
    if (memoryUsagePercent > 0.9 || this.requestMetrics.activeRequests > 1000) {
      status.status = 'degraded';
    }

    if (memoryUsagePercent > 0.95 || this.requestMetrics.activeRequests > 2000) {
      status.status = 'unhealthy';
    }

    return status;
  }

  getMetrics() {
    return {
      requests: this.requestMetrics,
      memory: this.memoryUsage.slice(-60), // Last hour
      responseTime: this.responseTimeHistory.slice(-100) // Last 100 requests
    };
  }
}

module.exports = new PerformanceMiddleware();