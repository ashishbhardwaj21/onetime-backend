/**
 * Comprehensive Monitoring Service
 * System health monitoring, metrics collection, and alerting
 */

const os = require('os');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const performanceConfig = require('../config/performance');
const CacheService = require('./CacheService');
const logger = require('../utils/logger');

class MonitoringService {
  constructor() {
    this.metrics = {
      system: {
        cpu: [],
        memory: [],
        disk: [],
        network: []
      },
      application: {
        requests: [],
        errors: [],
        responseTime: [],
        activeUsers: []
      },
      database: {
        connections: [],
        queryTime: [],
        slowQueries: [],
        operations: []
      },
      cache: {
        hitRate: [],
        operations: [],
        memory: []
      }
    };

    this.alerts = {
      active: new Map(),
      history: [],
      rules: new Map()
    };

    this.thresholds = {
      cpu: { warning: 70, critical: 90 },
      memory: { warning: 80, critical: 95 },
      disk: { warning: 85, critical: 95 },
      responseTime: { warning: 1000, critical: 5000 },
      errorRate: { warning: 5, critical: 10 },
      dbConnections: { warning: 80, critical: 95 }
    };

    this.collectInterval = 10000; // 10 seconds
    this.retentionPeriod = 24 * 60 * 60 * 1000; // 24 hours
    
    this.initialize();
  }

  initialize() {
    logger.info('Initializing monitoring service...');
    
    // Setup metric collection
    this.startMetricCollection();
    
    // Setup alert rules
    this.setupDefaultAlertRules();
    
    // Setup cleanup tasks
    this.setupCleanupTasks();
    
    // Setup health checks
    this.setupHealthChecks();
    
    logger.info('Monitoring service initialized successfully');
  }

  // Metric Collection
  startMetricCollection() {
    setInterval(async () => {
      try {
        await Promise.all([
          this.collectSystemMetrics(),
          this.collectApplicationMetrics(),
          this.collectDatabaseMetrics(),
          this.collectCacheMetrics()
        ]);
        
        // Evaluate alerts after collecting metrics
        this.evaluateAlerts();
        
      } catch (error) {
        logger.error('Error collecting metrics:', error);
      }
    }, this.collectInterval);
  }

  async collectSystemMetrics() {
    const timestamp = Date.now();
    
    // CPU metrics
    const cpuUsage = await this.getCPUUsage();
    this.metrics.system.cpu.push({
      timestamp,
      usage: cpuUsage,
      loadAverage: os.loadavg()
    });

    // Memory metrics
    const memoryUsage = this.getMemoryUsage();
    this.metrics.system.memory.push({
      timestamp,
      ...memoryUsage
    });

    // Disk metrics
    const diskUsage = await this.getDiskUsage();
    this.metrics.system.disk.push({
      timestamp,
      ...diskUsage
    });

    // Network metrics
    const networkStats = this.getNetworkStats();
    this.metrics.system.network.push({
      timestamp,
      ...networkStats
    });
  }

  async collectApplicationMetrics() {
    const timestamp = Date.now();
    
    // Request metrics
    const requestStats = this.getRequestStats();
    this.metrics.application.requests.push({
      timestamp,
      ...requestStats
    });

    // Error metrics
    const errorStats = this.getErrorStats();
    this.metrics.application.errors.push({
      timestamp,
      ...errorStats
    });

    // Response time metrics
    const responseTimeStats = this.getResponseTimeStats();
    this.metrics.application.responseTime.push({
      timestamp,
      ...responseTimeStats
    });

    // Active users
    const activeUsers = await this.getActiveUserCount();
    this.metrics.application.activeUsers.push({
      timestamp,
      count: activeUsers
    });
  }

  async collectDatabaseMetrics() {
    const timestamp = Date.now();
    
    try {
      // Connection metrics
      const connectionStats = this.getDatabaseConnectionStats();
      this.metrics.database.connections.push({
        timestamp,
        ...connectionStats
      });

      // Query performance
      const queryStats = await this.getDatabaseQueryStats();
      this.metrics.database.queryTime.push({
        timestamp,
        ...queryStats
      });

      // Operations metrics
      const opStats = await this.getDatabaseOperationStats();
      this.metrics.database.operations.push({
        timestamp,
        ...opStats
      });

    } catch (error) {
      logger.error('Error collecting database metrics:', error);
    }
  }

  async collectCacheMetrics() {
    const timestamp = Date.now();
    
    try {
      const cacheStats = CacheService.getStats();
      
      this.metrics.cache.hitRate.push({
        timestamp,
        hitRate: cacheStats.hitRate,
        hits: cacheStats.hits,
        misses: cacheStats.misses
      });

      this.metrics.cache.operations.push({
        timestamp,
        sets: cacheStats.sets,
        deletes: cacheStats.deletes,
        errors: cacheStats.errors
      });

      this.metrics.cache.memory.push({
        timestamp,
        keys: cacheStats.memory?.keys || 0
      });

    } catch (error) {
      logger.error('Error collecting cache metrics:', error);
    }
  }

  // System Metric Helpers
  async getCPUUsage() {
    return new Promise((resolve) => {
      const startMeasure = process.cpuUsage();
      setTimeout(() => {
        const endMeasure = process.cpuUsage(startMeasure);
        const totalUsage = (endMeasure.user + endMeasure.system) / 1000; // Convert to milliseconds
        const cpuPercent = (totalUsage / 1000) * 100; // Convert to percentage
        resolve(Math.min(cpuPercent, 100));
      }, 100);
    });
  }

  getMemoryUsage() {
    const processMemory = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem()
    };
    
    return {
      process: {
        heapUsed: processMemory.heapUsed,
        heapTotal: processMemory.heapTotal,
        external: processMemory.external,
        rss: processMemory.rss,
        usagePercent: (processMemory.heapUsed / processMemory.heapTotal) * 100
      },
      system: {
        total: systemMemory.total,
        free: systemMemory.free,
        used: systemMemory.total - systemMemory.free,
        usagePercent: ((systemMemory.total - systemMemory.free) / systemMemory.total) * 100
      }
    };
  }

  async getDiskUsage() {
    try {
      const stats = await fs.stat(process.cwd());
      // Simplified disk usage - in production, use proper disk monitoring
      return {
        available: 0, // Would use statvfs or similar
        used: 0,
        total: 0,
        usagePercent: 0
      };
    } catch (error) {
      return {
        available: 0,
        used: 0,
        total: 0,
        usagePercent: 0,
        error: error.message
      };
    }
  }

  getNetworkStats() {
    const networkInterfaces = os.networkInterfaces();
    
    // Simplified network stats
    return {
      interfaces: Object.keys(networkInterfaces).length,
      // In production, would track bytes in/out, packets, errors
      bytesIn: 0,
      bytesOut: 0,
      packetsIn: 0,
      packetsOut: 0
    };
  }

  // Application Metric Helpers
  getRequestStats() {
    // Get from performance middleware or global counters
    return {
      total: global.requestCount || 0,
      perSecond: this.calculateRate('requests'),
      active: global.activeRequests || 0
    };
  }

  getErrorStats() {
    return {
      total: global.errorCount || 0,
      perSecond: this.calculateRate('errors'),
      rate: this.calculateErrorRate()
    };
  }

  getResponseTimeStats() {
    // Get from performance middleware
    const responseTimeHistory = global.responseTimeHistory || [];
    
    if (responseTimeHistory.length === 0) {
      return { avg: 0, min: 0, max: 0, p95: 0, p99: 0 };
    }

    const times = responseTimeHistory.map(r => r.duration).sort((a, b) => a - b);
    const length = times.length;
    
    return {
      avg: times.reduce((sum, time) => sum + time, 0) / length,
      min: times[0],
      max: times[length - 1],
      p95: times[Math.floor(length * 0.95)],
      p99: times[Math.floor(length * 0.99)]
    };
  }

  async getActiveUserCount() {
    try {
      const User = require('../models/User');
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      return await User.countDocuments({
        lastActive: { $gte: fiveMinutesAgo }
      });
    } catch (error) {
      logger.error('Error getting active user count:', error);
      return 0;
    }
  }

  // Database Metric Helpers
  getDatabaseConnectionStats() {
    const db = mongoose.connection;
    
    // Get connection pool stats if available
    const poolStats = db.db?.serverConfig?.s?.coreTopology?.s?.pool?.s || {};
    
    return {
      state: db.readyState,
      poolSize: poolStats.totalConnectionCount || 0,
      available: poolStats.availableConnectionCount || 0,
      checkedOut: poolStats.checkedOutConnectionCount || 0,
      maxPoolSize: performanceConfig.database.mongodb.maxPoolSize,
      usagePercent: poolStats.totalConnectionCount ? 
        (poolStats.checkedOutConnectionCount / poolStats.totalConnectionCount) * 100 : 0
    };
  }

  async getDatabaseQueryStats() {
    try {
      // Get database profiling info if available
      const db = mongoose.connection.db;
      
      // This requires profiling to be enabled
      const profileData = await db.collection('system.profile')
        .find({ ts: { $gte: new Date(Date.now() - this.collectInterval) } })
        .toArray()
        .catch(() => []);

      if (profileData.length === 0) {
        return { avgTime: 0, slowQueries: 0, totalQueries: 0 };
      }

      const avgTime = profileData.reduce((sum, op) => sum + op.millis, 0) / profileData.length;
      const slowQueries = profileData.filter(op => op.millis > 100).length;

      return {
        avgTime,
        slowQueries,
        totalQueries: profileData.length
      };

    } catch (error) {
      return { avgTime: 0, slowQueries: 0, totalQueries: 0, error: error.message };
    }
  }

  async getDatabaseOperationStats() {
    try {
      const db = mongoose.connection.db;
      const stats = await db.stats();
      
      return {
        collections: stats.collections || 0,
        objects: stats.objects || 0,
        dataSize: stats.dataSize || 0,
        storageSize: stats.storageSize || 0,
        indexes: stats.indexes || 0,
        indexSize: stats.indexSize || 0
      };

    } catch (error) {
      return {
        collections: 0,
        objects: 0,
        dataSize: 0,
        storageSize: 0,
        indexes: 0,
        indexSize: 0,
        error: error.message
      };
    }
  }

  // Alert System
  setupDefaultAlertRules() {
    // High CPU usage
    this.addAlertRule('high_cpu', {
      metric: 'system.cpu.usage',
      threshold: this.thresholds.cpu.warning,
      severity: 'warning',
      description: 'High CPU usage detected'
    });

    this.addAlertRule('critical_cpu', {
      metric: 'system.cpu.usage',
      threshold: this.thresholds.cpu.critical,
      severity: 'critical',
      description: 'Critical CPU usage detected'
    });

    // High memory usage
    this.addAlertRule('high_memory', {
      metric: 'system.memory.process.usagePercent',
      threshold: this.thresholds.memory.warning,
      severity: 'warning',
      description: 'High memory usage detected'
    });

    this.addAlertRule('critical_memory', {
      metric: 'system.memory.process.usagePercent',
      threshold: this.thresholds.memory.critical,
      severity: 'critical',
      description: 'Critical memory usage detected'
    });

    // High error rate
    this.addAlertRule('high_error_rate', {
      metric: 'application.errors.rate',
      threshold: this.thresholds.errorRate.warning,
      severity: 'warning',
      description: 'High error rate detected'
    });

    // Slow response times
    this.addAlertRule('slow_response', {
      metric: 'application.responseTime.avg',
      threshold: this.thresholds.responseTime.warning,
      severity: 'warning',
      description: 'Slow response times detected'
    });

    // Database connection issues
    this.addAlertRule('db_connection_high', {
      metric: 'database.connections.usagePercent',
      threshold: this.thresholds.dbConnections.warning,
      severity: 'warning',
      description: 'High database connection usage'
    });

    // Cache issues
    this.addAlertRule('low_cache_hit_rate', {
      metric: 'cache.hitRate',
      threshold: 50, // Below 50% hit rate
      operator: 'less_than',
      severity: 'warning',
      description: 'Low cache hit rate detected'
    });
  }

  addAlertRule(name, rule) {
    this.alerts.rules.set(name, {
      ...rule,
      operator: rule.operator || 'greater_than',
      enabled: true,
      cooldown: rule.cooldown || 300000, // 5 minutes default
      lastTriggered: 0
    });
  }

  evaluateAlerts() {
    const now = Date.now();
    
    for (const [ruleName, rule] of this.alerts.rules) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      if (now - rule.lastTriggered < rule.cooldown) continue;
      
      const currentValue = this.getMetricValue(rule.metric);
      if (currentValue === null) continue;
      
      const shouldAlert = rule.operator === 'greater_than' 
        ? currentValue > rule.threshold
        : currentValue < rule.threshold;
      
      if (shouldAlert) {
        this.triggerAlert(ruleName, rule, currentValue);
      } else {
        // Check if we should resolve an active alert
        if (this.alerts.active.has(ruleName)) {
          this.resolveAlert(ruleName);
        }
      }
    }
  }

  getMetricValue(metricPath) {
    const pathParts = metricPath.split('.');
    let data = this.metrics;
    
    try {
      for (const part of pathParts) {
        if (Array.isArray(data)) {
          // Get the latest value from array
          data = data[data.length - 1];
        }
        data = data[part];
      }
      
      return typeof data === 'number' ? data : null;
    } catch (error) {
      return null;
    }
  }

  triggerAlert(ruleName, rule, currentValue) {
    const alert = {
      id: `${ruleName}_${Date.now()}`,
      ruleName,
      severity: rule.severity,
      description: rule.description,
      currentValue,
      threshold: rule.threshold,
      metric: rule.metric,
      timestamp: Date.now(),
      resolved: false
    };

    this.alerts.active.set(ruleName, alert);
    this.alerts.history.push(alert);
    
    // Update last triggered time
    rule.lastTriggered = Date.now();
    
    // Log the alert
    const logLevel = rule.severity === 'critical' ? 'error' : 'warn';
    logger[logLevel]('ALERT TRIGGERED:', {
      rule: ruleName,
      severity: rule.severity,
      description: rule.description,
      currentValue,
      threshold: rule.threshold,
      metric: rule.metric
    });

    // Send notifications
    this.sendAlertNotification(alert);
  }

  resolveAlert(ruleName) {
    const alert = this.alerts.active.get(ruleName);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      
      this.alerts.active.delete(ruleName);
      
      logger.info('ALERT RESOLVED:', {
        rule: ruleName,
        duration: alert.resolvedAt - alert.timestamp
      });

      // Send resolution notification
      this.sendAlertResolutionNotification(alert);
    }
  }

  async sendAlertNotification(alert) {
    try {
      // Send email notification
      if (process.env.ALERT_EMAIL_ENABLED === 'true') {
        await this.sendEmailAlert(alert);
      }

      // Send webhook notification
      if (process.env.ALERT_WEBHOOK_URL) {
        await this.sendWebhookAlert(alert);
      }

      // Send Slack notification
      if (process.env.SLACK_WEBHOOK_URL) {
        await this.sendSlackAlert(alert);
      }

    } catch (error) {
      logger.error('Error sending alert notification:', error);
    }
  }

  async sendEmailAlert(alert) {
    const nodemailer = require('nodemailer');
    
    try {
      const transporter = nodemailer.createTransporter({
        // Configure your email provider
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'alerts@onetime.app',
        to: process.env.ALERT_EMAIL_TO,
        subject: `[${alert.severity.toUpperCase()}] OneTime Alert: ${alert.description}`,
        html: `
          <h2>Alert Triggered</h2>
          <p><strong>Severity:</strong> ${alert.severity}</p>
          <p><strong>Description:</strong> ${alert.description}</p>
          <p><strong>Metric:</strong> ${alert.metric}</p>
          <p><strong>Current Value:</strong> ${alert.currentValue}</p>
          <p><strong>Threshold:</strong> ${alert.threshold}</p>
          <p><strong>Time:</strong> ${new Date(alert.timestamp).toISOString()}</p>
        `
      };

      await transporter.sendMail(mailOptions);
      logger.info('Alert email sent successfully');

    } catch (error) {
      logger.error('Failed to send alert email:', error);
    }
  }

  async sendWebhookAlert(alert) {
    const fetch = require('node-fetch');
    
    try {
      const response = await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'alert',
          alert,
          timestamp: new Date().toISOString()
        })
      });

      if (response.ok) {
        logger.info('Alert webhook sent successfully');
      } else {
        logger.error('Alert webhook failed:', response.statusText);
      }

    } catch (error) {
      logger.error('Failed to send alert webhook:', error);
    }
  }

  async sendSlackAlert(alert) {
    const fetch = require('node-fetch');
    
    try {
      const color = alert.severity === 'critical' ? 'danger' : 'warning';
      
      const slackMessage = {
        attachments: [{
          color,
          title: `🚨 ${alert.severity.toUpperCase()} Alert`,
          fields: [
            { title: 'Description', value: alert.description, short: false },
            { title: 'Metric', value: alert.metric, short: true },
            { title: 'Current Value', value: alert.currentValue.toString(), short: true },
            { title: 'Threshold', value: alert.threshold.toString(), short: true },
            { title: 'Time', value: new Date(alert.timestamp).toISOString(), short: true }
          ]
        }]
      };

      const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackMessage)
      });

      if (response.ok) {
        logger.info('Alert Slack notification sent successfully');
      } else {
        logger.error('Alert Slack notification failed:', response.statusText);
      }

    } catch (error) {
      logger.error('Failed to send Slack alert:', error);
    }
  }

  async sendAlertResolutionNotification(alert) {
    // Similar to sendAlertNotification but for resolution
    try {
      if (process.env.SLACK_WEBHOOK_URL) {
        const slackMessage = {
          attachments: [{
            color: 'good',
            title: `✅ Alert Resolved`,
            fields: [
              { title: 'Description', value: alert.description, short: false },
              { title: 'Duration', value: this.formatDuration(alert.resolvedAt - alert.timestamp), short: true }
            ]
          }]
        };

        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackMessage)
        });
      }
    } catch (error) {
      logger.error('Failed to send resolution notification:', error);
    }
  }

  // Health Checks
  setupHealthChecks() {
    setInterval(async () => {
      await this.performHealthChecks();
    }, 30000); // Every 30 seconds
  }

  async performHealthChecks() {
    const healthStatus = {
      timestamp: Date.now(),
      overall: 'healthy',
      services: {}
    };

    // Database health
    healthStatus.services.database = await this.checkDatabaseHealth();
    
    // Cache health
    healthStatus.services.cache = await this.checkCacheHealth();
    
    // External services health
    healthStatus.services.external = await this.checkExternalServicesHealth();
    
    // Determine overall health
    const serviceStatuses = Object.values(healthStatus.services);
    if (serviceStatuses.some(status => status.status === 'unhealthy')) {
      healthStatus.overall = 'unhealthy';
    } else if (serviceStatuses.some(status => status.status === 'degraded')) {
      healthStatus.overall = 'degraded';
    }

    // Store health status
    await CacheService.set('health_status', healthStatus, 60);
    
    // Trigger alerts if unhealthy
    if (healthStatus.overall === 'unhealthy') {
      this.triggerHealthAlert(healthStatus);
    }
  }

  async checkDatabaseHealth() {
    try {
      const db = mongoose.connection;
      
      if (db.readyState !== 1) {
        return { status: 'unhealthy', message: 'Database not connected' };
      }

      // Test query
      const startTime = Date.now();
      await db.db.admin().ping();
      const responseTime = Date.now() - startTime;

      if (responseTime > 5000) {
        return { status: 'degraded', message: 'Slow database response', responseTime };
      }

      return { status: 'healthy', responseTime };

    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  async checkCacheHealth() {
    try {
      const stats = CacheService.getStats();
      
      if (!stats.initialized) {
        return { status: 'unhealthy', message: 'Cache not initialized' };
      }

      if (stats.hitRate < 30) {
        return { status: 'degraded', message: 'Low cache hit rate', hitRate: stats.hitRate };
      }

      return { status: 'healthy', hitRate: stats.hitRate };

    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  async checkExternalServicesHealth() {
    const services = {
      redis: { status: 'unknown' },
      email: { status: 'unknown' },
      storage: { status: 'unknown' }
    };

    // Add specific health checks for external services
    // This is a simplified version
    
    return services;
  }

  // Utility Methods
  calculateRate(metricType) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // This would calculate the rate based on stored metrics
    // Simplified implementation
    return 0;
  }

  calculateErrorRate() {
    const totalRequests = global.requestCount || 0;
    const totalErrors = global.errorCount || 0;
    
    if (totalRequests === 0) return 0;
    return (totalErrors / totalRequests) * 100;
  }

  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  // Cleanup
  setupCleanupTasks() {
    // Clean old metrics every hour
    setInterval(() => {
      this.cleanOldMetrics();
    }, 3600000);

    // Clean old alerts every day
    setInterval(() => {
      this.cleanOldAlerts();
    }, 86400000);
  }

  cleanOldMetrics() {
    const cutoffTime = Date.now() - this.retentionPeriod;
    
    // Clean system metrics
    for (const metricType of Object.keys(this.metrics.system)) {
      this.metrics.system[metricType] = this.metrics.system[metricType]
        .filter(metric => metric.timestamp > cutoffTime);
    }
    
    // Clean application metrics
    for (const metricType of Object.keys(this.metrics.application)) {
      this.metrics.application[metricType] = this.metrics.application[metricType]
        .filter(metric => metric.timestamp > cutoffTime);
    }
    
    // Clean database metrics
    for (const metricType of Object.keys(this.metrics.database)) {
      this.metrics.database[metricType] = this.metrics.database[metricType]
        .filter(metric => metric.timestamp > cutoffTime);
    }
    
    // Clean cache metrics
    for (const metricType of Object.keys(this.metrics.cache)) {
      this.metrics.cache[metricType] = this.metrics.cache[metricType]
        .filter(metric => metric.timestamp > cutoffTime);
    }
    
    logger.debug('Old metrics cleaned up');
  }

  cleanOldAlerts() {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    
    this.alerts.history = this.alerts.history
      .filter(alert => alert.timestamp > cutoffTime);
    
    logger.debug('Old alerts cleaned up');
  }

  // Public API
  getMetrics(timeRange = '1h') {
    const endTime = Date.now();
    let startTime;
    
    switch (timeRange) {
      case '5m':
        startTime = endTime - 5 * 60 * 1000;
        break;
      case '1h':
        startTime = endTime - 60 * 60 * 1000;
        break;
      case '24h':
        startTime = endTime - 24 * 60 * 60 * 1000;
        break;
      default:
        startTime = endTime - 60 * 60 * 1000;
    }

    const filteredMetrics = {
      system: {},
      application: {},
      database: {},
      cache: {}
    };

    // Filter metrics by time range
    for (const category of Object.keys(this.metrics)) {
      for (const metricType of Object.keys(this.metrics[category])) {
        filteredMetrics[category][metricType] = this.metrics[category][metricType]
          .filter(metric => metric.timestamp >= startTime);
      }
    }

    return filteredMetrics;
  }

  getAlerts(includeResolved = false) {
    const alerts = {
      active: Array.from(this.alerts.active.values()),
      history: includeResolved ? this.alerts.history : this.alerts.history.filter(a => !a.resolved)
    };

    return alerts;
  }

  getHealthStatus() {
    return CacheService.get('health_status');
  }

  getDashboardData() {
    const latest = {
      system: {},
      application: {},
      database: {},
      cache: {}
    };

    // Get latest values for each metric type
    for (const category of Object.keys(this.metrics)) {
      for (const metricType of Object.keys(this.metrics[category])) {
        const metrics = this.metrics[category][metricType];
        if (metrics.length > 0) {
          latest[category][metricType] = metrics[metrics.length - 1];
        }
      }
    }

    return {
      timestamp: Date.now(),
      metrics: latest,
      alerts: {
        active: this.alerts.active.size,
        critical: Array.from(this.alerts.active.values()).filter(a => a.severity === 'critical').length
      },
      health: this.getHealthStatus()
    };
  }
}

module.exports = new MonitoringService();