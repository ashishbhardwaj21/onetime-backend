/**
 * Advanced Metrics Collector
 * Collects, aggregates, and exports metrics in various formats
 */

const os = require('os');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const monitoringConfig = require('../config/monitoring');
const CacheService = require('../services/CacheService');
const logger = require('./logger');

class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.histograms = new Map();
    this.counters = new Map();
    this.gauges = new Map();
    this.timers = new Map();
    
    this.collectionStartTime = Date.now();
    this.lastCollectionTime = Date.now();
    
    this.initialize();
  }

  initialize() {
    logger.info('Initializing metrics collector...');
    
    // Setup metric types
    this.setupMetricTypes();
    
    // Start collection intervals
    this.startCollection();
    
    // Setup cleanup
    this.setupCleanup();
    
    logger.info('Metrics collector initialized successfully');
  }

  setupMetricTypes() {
    // System metrics
    this.registerGauge('system_cpu_usage_percent', 'CPU usage percentage');
    this.registerGauge('system_memory_usage_bytes', 'Memory usage in bytes');
    this.registerGauge('system_memory_usage_percent', 'Memory usage percentage');
    this.registerGauge('system_load_average_1m', '1-minute load average');
    this.registerGauge('system_load_average_5m', '5-minute load average');
    this.registerGauge('system_load_average_15m', '15-minute load average');
    this.registerGauge('system_disk_usage_percent', 'Disk usage percentage');
    this.registerGauge('system_uptime_seconds', 'System uptime in seconds');

    // Application metrics
    this.registerCounter('app_requests_total', 'Total number of HTTP requests');
    this.registerCounter('app_errors_total', 'Total number of errors');
    this.registerHistogram('app_response_time_ms', 'HTTP response time in milliseconds');
    this.registerGauge('app_active_connections', 'Number of active connections');
    this.registerGauge('app_active_users', 'Number of active users');
    this.registerGauge('app_websocket_connections', 'Number of WebSocket connections');

    // Database metrics
    this.registerGauge('db_connections_active', 'Active database connections');
    this.registerGauge('db_connections_available', 'Available database connections');
    this.registerGauge('db_connections_usage_percent', 'Database connection usage percentage');
    this.registerHistogram('db_query_time_ms', 'Database query time in milliseconds');
    this.registerCounter('db_queries_total', 'Total number of database queries');
    this.registerCounter('db_slow_queries_total', 'Total number of slow database queries');
    this.registerGauge('db_size_bytes', 'Database size in bytes');
    this.registerGauge('db_collections_count', 'Number of database collections');

    // Cache metrics
    this.registerGauge('cache_hit_rate_percent', 'Cache hit rate percentage');
    this.registerCounter('cache_hits_total', 'Total number of cache hits');
    this.registerCounter('cache_misses_total', 'Total number of cache misses');
    this.registerCounter('cache_operations_total', 'Total number of cache operations');
    this.registerGauge('cache_memory_usage_bytes', 'Cache memory usage in bytes');
    this.registerGauge('cache_keys_count', 'Number of keys in cache');

    // Business metrics
    this.registerCounter('users_registered_total', 'Total number of user registrations');
    this.registerCounter('activities_created_total', 'Total number of activities created');
    this.registerCounter('matches_created_total', 'Total number of matches created');
    this.registerCounter('messages_sent_total', 'Total number of messages sent');
    this.registerCounter('subscriptions_created_total', 'Total number of subscriptions created');
    this.registerGauge('revenue_total_cents', 'Total revenue in cents');
    this.registerGauge('mrr_cents', 'Monthly recurring revenue in cents');

    // Security metrics
    this.registerCounter('auth_attempts_total', 'Total authentication attempts');
    this.registerCounter('auth_failures_total', 'Total authentication failures');
    this.registerCounter('rate_limit_exceeded_total', 'Total rate limit violations');
    this.registerCounter('security_events_total', 'Total security events');
  }

  // Metric registration methods
  registerCounter(name, description, labels = []) {
    this.counters.set(name, {
      name,
      description,
      labels,
      value: 0,
      type: 'counter',
      created: Date.now()
    });
  }

  registerGauge(name, description, labels = []) {
    this.gauges.set(name, {
      name,
      description,
      labels,
      value: 0,
      type: 'gauge',
      created: Date.now()
    });
  }

  registerHistogram(name, description, buckets = null, labels = []) {
    const defaultBuckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    
    this.histograms.set(name, {
      name,
      description,
      labels,
      buckets: buckets || defaultBuckets,
      observations: [],
      type: 'histogram',
      created: Date.now()
    });
  }

  registerTimer(name, description, labels = []) {
    this.timers.set(name, {
      name,
      description,
      labels,
      startTimes: new Map(),
      durations: [],
      type: 'timer',
      created: Date.now()
    });
  }

  // Metric update methods
  incrementCounter(name, value = 1, labels = {}) {
    const counter = this.counters.get(name);
    if (counter) {
      counter.value += value;
      counter.lastUpdated = Date.now();
      this.recordMetricPoint(name, counter.value, 'counter', labels);
    }
  }

  setGauge(name, value, labels = {}) {
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.value = value;
      gauge.lastUpdated = Date.now();
      this.recordMetricPoint(name, value, 'gauge', labels);
    }
  }

  observeHistogram(name, value, labels = {}) {
    const histogram = this.histograms.get(name);
    if (histogram) {
      histogram.observations.push({
        value,
        timestamp: Date.now(),
        labels
      });
      
      // Keep only recent observations
      const cutoff = Date.now() - monitoringConfig.retention.metrics;
      histogram.observations = histogram.observations.filter(obs => obs.timestamp > cutoff);
      
      this.recordMetricPoint(name, value, 'histogram', labels);
    }
  }

  startTimer(name, id = 'default') {
    const timer = this.timers.get(name);
    if (timer) {
      timer.startTimes.set(id, Date.now());
    }
    return id;
  }

  endTimer(name, id = 'default', labels = {}) {
    const timer = this.timers.get(name);
    if (timer && timer.startTimes.has(id)) {
      const startTime = timer.startTimes.get(id);
      const duration = Date.now() - startTime;
      
      timer.durations.push({
        duration,
        timestamp: Date.now(),
        labels
      });
      
      timer.startTimes.delete(id);
      
      // Keep only recent durations
      const cutoff = Date.now() - monitoringConfig.retention.metrics;
      timer.durations = timer.durations.filter(d => d.timestamp > cutoff);
      
      this.recordMetricPoint(name, duration, 'timer', labels);
      return duration;
    }
    return null;
  }

  recordMetricPoint(name, value, type, labels = {}) {
    const key = `${name}_${JSON.stringify(labels)}`;
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    const points = this.metrics.get(key);
    points.push({
      timestamp: Date.now(),
      value,
      type,
      labels
    });
    
    // Keep only recent points
    const cutoff = Date.now() - monitoringConfig.retention.metrics;
    const filtered = points.filter(point => point.timestamp > cutoff);
    this.metrics.set(key, filtered);
  }

  // Collection methods
  startCollection() {
    // Collect system metrics
    setInterval(() => {
      this.collectSystemMetrics();
    }, monitoringConfig.intervals.metrics);

    // Collect application metrics
    setInterval(() => {
      this.collectApplicationMetrics();
    }, monitoringConfig.intervals.metrics);

    // Collect database metrics
    setInterval(() => {
      this.collectDatabaseMetrics();
    }, monitoringConfig.intervals.metrics);

    // Collect cache metrics
    setInterval(() => {
      this.collectCacheMetrics();
    }, monitoringConfig.intervals.metrics);

    // Collect business metrics less frequently
    setInterval(() => {
      this.collectBusinessMetrics();
    }, monitoringConfig.intervals.metrics * 6); // Every minute if base is 10s
  }

  async collectSystemMetrics() {
    try {
      // CPU usage
      const cpuUsage = await this.getCPUUsage();
      this.setGauge('system_cpu_usage_percent', cpuUsage);

      // Memory usage
      const memUsage = process.memoryUsage();
      this.setGauge('system_memory_usage_bytes', memUsage.heapUsed);
      this.setGauge('system_memory_usage_percent', (memUsage.heapUsed / memUsage.heapTotal) * 100);

      // Load average
      const loadAvg = os.loadavg();
      this.setGauge('system_load_average_1m', loadAvg[0]);
      this.setGauge('system_load_average_5m', loadAvg[1]);
      this.setGauge('system_load_average_15m', loadAvg[2]);

      // Uptime
      this.setGauge('system_uptime_seconds', process.uptime());

      // Disk usage (simplified)
      const diskUsage = await this.getDiskUsage();
      this.setGauge('system_disk_usage_percent', diskUsage);

    } catch (error) {
      logger.error('Error collecting system metrics:', error);
    }
  }

  collectApplicationMetrics() {
    try {
      // Request metrics from global counters
      const requestCount = global.requestCount || 0;
      const errorCount = global.errorCount || 0;
      const activeConnections = global.activeConnections || 0;
      const websocketConnections = global.websocketConnections || 0;

      this.setGauge('app_requests_total', requestCount);
      this.setGauge('app_errors_total', errorCount);
      this.setGauge('app_active_connections', activeConnections);
      this.setGauge('app_websocket_connections', websocketConnections);

      // Response time from global history
      const responseTimeHistory = global.responseTimeHistory || [];
      if (responseTimeHistory.length > 0) {
        const recentResponses = responseTimeHistory.slice(-10);
        recentResponses.forEach(response => {
          this.observeHistogram('app_response_time_ms', response.duration);
        });
      }

    } catch (error) {
      logger.error('Error collecting application metrics:', error);
    }
  }

  async collectDatabaseMetrics() {
    try {
      const db = mongoose.connection;
      
      if (db.readyState === 1) {
        // Connection pool stats
        const poolStats = db.db?.serverConfig?.s?.coreTopology?.s?.pool?.s || {};
        
        const activeConnections = poolStats.totalConnectionCount || 0;
        const availableConnections = poolStats.availableConnectionCount || 0;
        const maxConnections = monitoringConfig.thresholds.database.connections.critical || 100;
        
        this.setGauge('db_connections_active', activeConnections);
        this.setGauge('db_connections_available', availableConnections);
        this.setGauge('db_connections_usage_percent', maxConnections > 0 ? (activeConnections / maxConnections) * 100 : 0);

        // Database stats
        try {
          const stats = await db.db.stats();
          this.setGauge('db_size_bytes', stats.dataSize || 0);
          this.setGauge('db_collections_count', stats.collections || 0);
        } catch (statsError) {
          // Stats might not be available
        }
      }

    } catch (error) {
      logger.error('Error collecting database metrics:', error);
    }
  }

  collectCacheMetrics() {
    try {
      const cacheStats = CacheService.getStats();
      
      this.setGauge('cache_hit_rate_percent', cacheStats.hitRate || 0);
      this.setGauge('cache_hits_total', cacheStats.hits || 0);
      this.setGauge('cache_misses_total', cacheStats.misses || 0);
      this.setGauge('cache_operations_total', (cacheStats.sets || 0) + (cacheStats.deletes || 0));
      this.setGauge('cache_keys_count', cacheStats.memory?.keys || 0);

    } catch (error) {
      logger.error('Error collecting cache metrics:', error);
    }
  }

  async collectBusinessMetrics() {
    try {
      // This would typically query the database for business metrics
      // For now, using placeholder implementations
      
      const User = require('../models/User');
      const Activity = require('../models/Activity');
      
      // Total users
      const totalUsers = await User.countDocuments({});
      this.setGauge('users_registered_total', totalUsers);

      // Total activities
      const totalActivities = await Activity.countDocuments({});
      this.setGauge('activities_created_total', totalActivities);

      // Active users (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const activeUsers = await User.countDocuments({
        lastActive: { $gte: oneDayAgo }
      });
      this.setGauge('app_active_users', activeUsers);

    } catch (error) {
      logger.error('Error collecting business metrics:', error);
    }
  }

  // Helper methods
  async getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const totalUsage = (endUsage.user + endUsage.system) / 1000; // Convert to milliseconds
        const cpuPercent = (totalUsage / 100) * 100; // Convert to percentage
        resolve(Math.min(Math.max(cpuPercent, 0), 100));
      }, 100);
    });
  }

  async getDiskUsage() {
    try {
      // Simplified disk usage - in production, use proper disk monitoring
      const stats = await fs.stat(process.cwd());
      // Return 0 for now - would implement proper disk usage calculation
      return 0;
    } catch (error) {
      return 0;
    }
  }

  // Export methods
  exportPrometheus() {
    let output = '';
    
    // Export counters
    for (const [name, counter] of this.counters) {
      output += `# HELP ${name} ${counter.description}\n`;
      output += `# TYPE ${name} counter\n`;
      output += `${name} ${counter.value}\n\n`;
    }

    // Export gauges
    for (const [name, gauge] of this.gauges) {
      output += `# HELP ${name} ${gauge.description}\n`;
      output += `# TYPE ${name} gauge\n`;
      output += `${name} ${gauge.value}\n\n`;
    }

    // Export histograms
    for (const [name, histogram] of this.histograms) {
      output += `# HELP ${name} ${histogram.description}\n`;
      output += `# TYPE ${name} histogram\n`;
      
      // Calculate histogram buckets
      const bucketCounts = new Map();
      histogram.buckets.forEach(bucket => bucketCounts.set(bucket, 0));
      
      let sum = 0;
      let count = 0;
      
      histogram.observations.forEach(obs => {
        sum += obs.value;
        count++;
        
        histogram.buckets.forEach(bucket => {
          if (obs.value <= bucket) {
            bucketCounts.set(bucket, bucketCounts.get(bucket) + 1);
          }
        });
      });

      // Output buckets
      for (const [bucket, bucketCount] of bucketCounts) {
        output += `${name}_bucket{le="${bucket}"} ${bucketCount}\n`;
      }
      
      output += `${name}_bucket{le="+Inf"} ${count}\n`;
      output += `${name}_sum ${sum}\n`;
      output += `${name}_count ${count}\n\n`;
    }

    return output;
  }

  exportJSON(timeRange = '1h') {
    const endTime = Date.now();
    const startTime = this.getStartTimeForRange(timeRange, endTime);
    
    const export_data = {
      metadata: {
        timestamp: endTime,
        timeRange,
        period: { start: startTime, end: endTime }
      },
      counters: this.exportCountersJSON(),
      gauges: this.exportGaugesJSON(),
      histograms: this.exportHistogramsJSON(startTime, endTime),
      timers: this.exportTimersJSON(startTime, endTime)
    };

    return export_data;
  }

  exportCountersJSON() {
    const counters = {};
    for (const [name, counter] of this.counters) {
      counters[name] = {
        value: counter.value,
        description: counter.description,
        lastUpdated: counter.lastUpdated
      };
    }
    return counters;
  }

  exportGaugesJSON() {
    const gauges = {};
    for (const [name, gauge] of this.gauges) {
      gauges[name] = {
        value: gauge.value,
        description: gauge.description,
        lastUpdated: gauge.lastUpdated
      };
    }
    return gauges;
  }

  exportHistogramsJSON(startTime, endTime) {
    const histograms = {};
    for (const [name, histogram] of this.histograms) {
      const observations = histogram.observations.filter(
        obs => obs.timestamp >= startTime && obs.timestamp <= endTime
      );
      
      if (observations.length > 0) {
        const values = observations.map(obs => obs.value);
        histograms[name] = {
          count: values.length,
          sum: values.reduce((sum, val) => sum + val, 0),
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((sum, val) => sum + val, 0) / values.length,
          p50: this.percentile(values, 50),
          p95: this.percentile(values, 95),
          p99: this.percentile(values, 99),
          description: histogram.description
        };
      }
    }
    return histograms;
  }

  exportTimersJSON(startTime, endTime) {
    const timers = {};
    for (const [name, timer] of this.timers) {
      const durations = timer.durations.filter(
        d => d.timestamp >= startTime && d.timestamp <= endTime
      );
      
      if (durations.length > 0) {
        const values = durations.map(d => d.duration);
        timers[name] = {
          count: values.length,
          sum: values.reduce((sum, val) => sum + val, 0),
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((sum, val) => sum + val, 0) / values.length,
          description: timer.description
        };
      }
    }
    return timers;
  }

  // Utility methods
  getStartTimeForRange(timeRange, endTime) {
    switch (timeRange) {
      case '5m':
        return endTime - 5 * 60 * 1000;
      case '1h':
        return endTime - 60 * 60 * 1000;
      case '24h':
        return endTime - 24 * 60 * 60 * 1000;
      case '7d':
        return endTime - 7 * 24 * 60 * 60 * 1000;
      default:
        return endTime - 60 * 60 * 1000;
    }
  }

  percentile(values, p) {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  setupCleanup() {
    setInterval(() => {
      this.cleanupOldMetrics();
    }, monitoringConfig.intervals.cleanup);
  }

  cleanupOldMetrics() {
    const cutoff = Date.now() - monitoringConfig.retention.metrics;
    
    // Clean metric points
    for (const [key, points] of this.metrics) {
      const filtered = points.filter(point => point.timestamp > cutoff);
      if (filtered.length === 0) {
        this.metrics.delete(key);
      } else {
        this.metrics.set(key, filtered);
      }
    }

    // Clean histogram observations
    for (const histogram of this.histograms.values()) {
      histogram.observations = histogram.observations.filter(obs => obs.timestamp > cutoff);
    }

    // Clean timer durations
    for (const timer of this.timers.values()) {
      timer.durations = timer.durations.filter(d => d.timestamp > cutoff);
    }

    logger.debug('Cleaned up old metrics');
  }

  // Public API
  getMetrics(timeRange = '1h') {
    return this.exportJSON(timeRange);
  }

  getSummary() {
    return {
      counters: this.counters.size,
      gauges: this.gauges.size,
      histograms: this.histograms.size,
      timers: this.timers.size,
      totalMetricPoints: Array.from(this.metrics.values()).reduce((sum, points) => sum + points.length, 0),
      uptime: Date.now() - this.collectionStartTime,
      lastCollection: this.lastCollectionTime
    };
  }
}

module.exports = new MetricsCollector();