/**
 * Advanced Caching Service
 * Multi-level caching with Redis, memory cache, and smart invalidation
 */

const Redis = require('redis');
const NodeCache = require('node-cache');
const performanceConfig = require('../config/performance');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.initialized = false;
    this.redisClient = null;
    this.memoryCache = null;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    
    this.initialize();
  }

  async initialize() {
    try {
      // Initialize Redis client
      this.redisClient = Redis.createClient({
        host: performanceConfig.cache.redis.host,
        port: performanceConfig.cache.redis.port,
        db: performanceConfig.cache.redis.db,
        ...performanceConfig.cache.redis
      });

      this.redisClient.on('error', (err) => {
        logger.error('Redis connection error:', err);
        this.stats.errors++;
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis cache connected successfully');
      });

      this.redisClient.on('reconnecting', () => {
        logger.warn('Redis cache reconnecting...');
      });

      await this.redisClient.connect();

      // Initialize memory cache (L1)
      this.memoryCache = new NodeCache({
        stdTTL: performanceConfig.cache.strategies.levels.l1.ttl,
        maxKeys: performanceConfig.cache.strategies.levels.l1.maxKeys,
        checkperiod: 60, // Check for expired keys every 60 seconds
        useClones: false // Better performance
      });

      this.memoryCache.on('expired', (key, value) => {
        logger.debug(`Memory cache key expired: ${key}`);
      });

      this.initialized = true;
      logger.info('Cache service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize cache service:', error);
      this.stats.errors++;
    }
  }

  // Multi-level get with fallback
  async get(key, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { skipMemory = false, skipRedis = false } = options;

    try {
      // L1: Memory cache
      if (!skipMemory) {
        const memoryValue = this.memoryCache.get(key);
        if (memoryValue !== undefined) {
          this.stats.hits++;
          logger.debug(`Cache hit (memory): ${key}`);
          return this.deserialize(memoryValue);
        }
      }

      // L2: Redis cache
      if (!skipRedis && this.redisClient) {
        const redisValue = await this.redisClient.get(key);
        if (redisValue !== null) {
          this.stats.hits++;
          logger.debug(`Cache hit (redis): ${key}`);
          
          // Populate L1 cache
          if (!skipMemory) {
            this.memoryCache.set(key, redisValue, performanceConfig.cache.strategies.levels.l1.ttl);
          }
          
          return this.deserialize(redisValue);
        }
      }

      this.stats.misses++;
      logger.debug(`Cache miss: ${key}`);
      return null;

    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      this.stats.errors++;
      return null;
    }
  }

  // Multi-level set
  async set(key, value, ttl = null, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { skipMemory = false, skipRedis = false, level = 'auto' } = options;
    const serializedValue = this.serialize(value);

    try {
      // Determine cache level and TTL
      let memoryTTL, redisTTL;
      
      if (level === 'auto') {
        memoryTTL = performanceConfig.cache.strategies.levels.l1.ttl;
        redisTTL = ttl || performanceConfig.cache.strategies.levels.l2.ttl;
      } else {
        const levelConfig = performanceConfig.cache.strategies.levels[level];
        memoryTTL = redisTTL = levelConfig?.ttl || performanceConfig.cache.strategies.mediumTerm;
      }

      // L1: Memory cache
      if (!skipMemory) {
        this.memoryCache.set(key, serializedValue, memoryTTL);
      }

      // L2: Redis cache
      if (!skipRedis && this.redisClient) {
        if (redisTTL) {
          await this.redisClient.setEx(key, redisTTL, serializedValue);
        } else {
          await this.redisClient.set(key, serializedValue);
        }
      }

      this.stats.sets++;
      logger.debug(`Cache set: ${key} (TTL: ${redisTTL})`);
      return true;

    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  // Smart caching with refresh-ahead pattern
  async getOrSet(key, fetchFunction, ttl = null, options = {}) {
    const { refreshThreshold = 0.8 } = options;
    
    try {
      // Try to get from cache
      const cachedValue = await this.get(key, options);
      if (cachedValue !== null) {
        // Check if we need refresh-ahead
        const keyTTL = await this.getTTL(key);
        const originalTTL = ttl || performanceConfig.cache.strategies.mediumTerm;
        
        if (keyTTL > 0 && keyTTL < (originalTTL * refreshThreshold)) {
          // Refresh in background
          this.refreshInBackground(key, fetchFunction, ttl, options);
        }
        
        return cachedValue;
      }

      // Cache miss - fetch and cache
      const freshValue = await fetchFunction();
      if (freshValue !== null && freshValue !== undefined) {
        await this.set(key, freshValue, ttl, options);
      }
      
      return freshValue;

    } catch (error) {
      logger.error(`Cache getOrSet error for key ${key}:`, error);
      this.stats.errors++;
      
      // Try to fetch fresh data on cache error
      try {
        return await fetchFunction();
      } catch (fetchError) {
        logger.error(`Fetch function error for key ${key}:`, fetchError);
        throw fetchError;
      }
    }
  }

  // Background refresh to prevent cache stampede
  async refreshInBackground(key, fetchFunction, ttl, options) {
    try {
      logger.debug(`Background refresh initiated for key: ${key}`);
      const freshValue = await fetchFunction();
      if (freshValue !== null && freshValue !== undefined) {
        await this.set(key, freshValue, ttl, options);
        logger.debug(`Background refresh completed for key: ${key}`);
      }
    } catch (error) {
      logger.error(`Background refresh error for key ${key}:`, error);
    }
  }

  // Delete from all cache levels
  async delete(key, options = {}) {
    const { skipMemory = false, skipRedis = false } = options;

    try {
      let deleted = false;

      // L1: Memory cache
      if (!skipMemory) {
        deleted = this.memoryCache.del(key) || deleted;
      }

      // L2: Redis cache
      if (!skipRedis && this.redisClient) {
        const redisDeleted = await this.redisClient.del(key);
        deleted = redisDeleted > 0 || deleted;
      }

      if (deleted) {
        this.stats.deletes++;
        logger.debug(`Cache delete: ${key}`);
      }

      return deleted;

    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  // Batch operations
  async mget(keys, options = {}) {
    const results = {};
    
    try {
      for (const key of keys) {
        results[key] = await this.get(key, options);
      }
      return results;
    } catch (error) {
      logger.error('Cache mget error:', error);
      this.stats.errors++;
      return {};
    }
  }

  async mset(keyValuePairs, ttl = null, options = {}) {
    try {
      const promises = Object.entries(keyValuePairs).map(([key, value]) =>
        this.set(key, value, ttl, options)
      );
      
      const results = await Promise.allSettled(promises);
      return results.every(result => result.status === 'fulfilled' && result.value);
      
    } catch (error) {
      logger.error('Cache mset error:', error);
      this.stats.errors++;
      return false;
    }
  }

  // Pattern-based operations
  async deletePattern(pattern, options = {}) {
    const { skipMemory = false, skipRedis = false } = options;
    
    try {
      let deletedCount = 0;

      // Memory cache pattern delete
      if (!skipMemory) {
        const keys = this.memoryCache.keys();
        const matchingKeys = keys.filter(key => this.matchPattern(key, pattern));
        matchingKeys.forEach(key => {
          if (this.memoryCache.del(key)) deletedCount++;
        });
      }

      // Redis pattern delete
      if (!skipRedis && this.redisClient) {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          const redisDeleted = await this.redisClient.del(keys);
          deletedCount += redisDeleted;
        }
      }

      this.stats.deletes += deletedCount;
      logger.debug(`Cache pattern delete: ${pattern} (${deletedCount} keys)`);
      return deletedCount;

    } catch (error) {
      logger.error(`Cache pattern delete error for pattern ${pattern}:`, error);
      this.stats.errors++;
      return 0;
    }
  }

  // Cache warming
  async warmup(keyValuePairs, options = {}) {
    logger.info('Starting cache warmup...');
    
    try {
      const results = await this.mset(keyValuePairs, null, options);
      logger.info(`Cache warmup completed: ${Object.keys(keyValuePairs).length} keys`);
      return results;
      
    } catch (error) {
      logger.error('Cache warmup error:', error);
      return false;
    }
  }

  // Get cache statistics
  getStats() {
    const memoryStats = this.memoryCache ? {
      keys: this.memoryCache.keys().length,
      hits: this.memoryCache.getStats().hits,
      misses: this.memoryCache.getStats().misses
    } : {};

    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) * 100 || 0,
      memory: memoryStats,
      initialized: this.initialized
    };
  }

  // Clear all caches
  async clear(options = {}) {
    const { skipMemory = false, skipRedis = false } = options;

    try {
      if (!skipMemory && this.memoryCache) {
        this.memoryCache.flushAll();
      }

      if (!skipRedis && this.redisClient) {
        await this.redisClient.flushDb();
      }

      logger.info('Cache cleared successfully');
      return true;

    } catch (error) {
      logger.error('Cache clear error:', error);
      this.stats.errors++;
      return false;
    }
  }

  // Get TTL for a key
  async getTTL(key) {
    try {
      if (this.redisClient) {
        return await this.redisClient.ttl(key);
      }
      return -1;
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  // Helper methods
  serialize(value) {
    try {
      return JSON.stringify({
        data: value,
        timestamp: Date.now(),
        type: typeof value
      });
    } catch (error) {
      logger.error('Cache serialization error:', error);
      return null;
    }
  }

  deserialize(value) {
    try {
      if (typeof value === 'string') {
        const parsed = JSON.parse(value);
        return parsed.data;
      }
      return value;
    } catch (error) {
      logger.error('Cache deserialization error:', error);
      return null;
    }
  }

  matchPattern(key, pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(key);
  }

  // Graceful shutdown
  async close() {
    try {
      if (this.memoryCache) {
        this.memoryCache.close();
      }

      if (this.redisClient) {
        await this.redisClient.quit();
      }

      logger.info('Cache service closed successfully');
    } catch (error) {
      logger.error('Cache close error:', error);
    }
  }
}

module.exports = new CacheService();