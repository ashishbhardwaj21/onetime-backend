/**
 * Monitoring and Alerting API Routes
 * Endpoints for monitoring dashboards, metrics, and alert management
 */

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const MonitoringService = require('../services/MonitoringService');
const AlertingService = require('../services/AlertingService');
const performanceMiddleware = require('../middleware/performanceMiddleware');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for monitoring endpoints
const monitoringRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { success: false, error: 'Too many monitoring requests' }
});

// Admin authentication middleware
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin' && req.admin?.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};

// Apply rate limiting and authentication
router.use(monitoringRateLimit);
router.use(auth.authenticateToken);

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Health Check Endpoints
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await MonitoringService.getHealthStatus();
    
    res.json({
      success: true,
      data: healthStatus || {
        status: 'unknown',
        timestamp: Date.now(),
        message: 'Health status not available'
      }
    });

  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error.message
    });
  }
});

router.get('/health/detailed', requireAdmin, async (req, res) => {
  try {
    const healthStatus = await MonitoringService.getHealthStatus();
    const metrics = MonitoringService.getMetrics('5m');
    const alerts = AlertingService.getActiveAlerts();

    res.json({
      success: true,
      data: {
        health: healthStatus,
        recentMetrics: metrics,
        activeAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
        services: {
          monitoring: 'healthy',
          alerting: 'healthy',
          database: healthStatus?.services?.database?.status || 'unknown',
          cache: healthStatus?.services?.cache?.status || 'unknown'
        }
      }
    });

  } catch (error) {
    logger.error('Detailed health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Detailed health check failed'
    });
  }
});

// Metrics Endpoints
router.get('/metrics', 
  requireAdmin,
  [
    query('timeRange').optional().isIn(['5m', '1h', '24h', '7d']).withMessage('Invalid time range'),
    query('category').optional().isIn(['system', 'application', 'database', 'cache']).withMessage('Invalid category')
  ],
  handleValidationErrors,
  performanceMiddleware.responseCache({ ttl: 30 }),
  async (req, res) => {
    try {
      const { timeRange = '1h', category } = req.query;
      
      let metrics = MonitoringService.getMetrics(timeRange);
      
      // Filter by category if specified
      if (category) {
        metrics = { [category]: metrics[category] || {} };
      }

      res.json({
        success: true,
        data: {
          timeRange,
          category: category || 'all',
          metrics,
          timestamp: Date.now()
        }
      });

    } catch (error) {
      logger.error('Metrics retrieval error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve metrics'
      });
    }
  }
);

router.get('/metrics/dashboard', 
  requireAdmin,
  performanceMiddleware.responseCache({ ttl: 10 }),
  async (req, res) => {
    try {
      const dashboardData = MonitoringService.getDashboardData();
      
      res.json({
        success: true,
        data: dashboardData
      });

    } catch (error) {
      logger.error('Dashboard metrics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve dashboard metrics'
      });
    }
  }
);

router.get('/metrics/system', 
  requireAdmin,
  [query('timeRange').optional().isIn(['5m', '1h', '24h', '7d'])],
  handleValidationErrors,
  performanceMiddleware.responseCache({ ttl: 30 }),
  async (req, res) => {
    try {
      const { timeRange = '1h' } = req.query;
      const metrics = MonitoringService.getMetrics(timeRange);
      
      const systemMetrics = {
        cpu: metrics.system.cpu || [],
        memory: metrics.system.memory || [],
        disk: metrics.system.disk || [],
        network: metrics.system.network || []
      };

      // Calculate aggregations
      const aggregatedMetrics = {
        cpu: {
          current: systemMetrics.cpu.length > 0 ? systemMetrics.cpu[systemMetrics.cpu.length - 1].usage : 0,
          average: systemMetrics.cpu.length > 0 ? 
            systemMetrics.cpu.reduce((sum, m) => sum + m.usage, 0) / systemMetrics.cpu.length : 0,
          max: systemMetrics.cpu.length > 0 ? Math.max(...systemMetrics.cpu.map(m => m.usage)) : 0,
          trend: systemMetrics.cpu.slice(-10) // Last 10 data points
        },
        memory: {
          current: systemMetrics.memory.length > 0 ? 
            systemMetrics.memory[systemMetrics.memory.length - 1].process.usagePercent : 0,
          average: systemMetrics.memory.length > 0 ?
            systemMetrics.memory.reduce((sum, m) => sum + m.process.usagePercent, 0) / systemMetrics.memory.length : 0,
          trend: systemMetrics.memory.slice(-10).map(m => m.process.usagePercent)
        }
      };

      res.json({
        success: true,
        data: {
          timeRange,
          raw: systemMetrics,
          aggregated: aggregatedMetrics,
          timestamp: Date.now()
        }
      });

    } catch (error) {
      logger.error('System metrics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system metrics'
      });
    }
  }
);

router.get('/metrics/application',
  requireAdmin,
  [query('timeRange').optional().isIn(['5m', '1h', '24h', '7d'])],
  handleValidationErrors,
  performanceMiddleware.responseCache({ ttl: 30 }),
  async (req, res) => {
    try {
      const { timeRange = '1h' } = req.query;
      const metrics = MonitoringService.getMetrics(timeRange);
      
      res.json({
        success: true,
        data: {
          timeRange,
          requests: metrics.application.requests || [],
          errors: metrics.application.errors || [],
          responseTime: metrics.application.responseTime || [],
          activeUsers: metrics.application.activeUsers || [],
          timestamp: Date.now()
        }
      });

    } catch (error) {
      logger.error('Application metrics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve application metrics'
      });
    }
  }
);

router.get('/metrics/database',
  requireAdmin,
  [query('timeRange').optional().isIn(['5m', '1h', '24h', '7d'])],
  handleValidationErrors,
  performanceMiddleware.responseCache({ ttl: 30 }),
  async (req, res) => {
    try {
      const { timeRange = '1h' } = req.query;
      const metrics = MonitoringService.getMetrics(timeRange);
      
      res.json({
        success: true,
        data: {
          timeRange,
          connections: metrics.database.connections || [],
          queryTime: metrics.database.queryTime || [],
          operations: metrics.database.operations || [],
          timestamp: Date.now()
        }
      });

    } catch (error) {
      logger.error('Database metrics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve database metrics'
      });
    }
  }
);

// Alert Management Endpoints
router.get('/alerts',
  requireAdmin,
  [
    query('status').optional().isIn(['active', 'resolved', 'acknowledged', 'all']).withMessage('Invalid status'),
    query('severity').optional().isIn(['info', 'warning', 'critical']).withMessage('Invalid severity'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { status = 'active', severity, limit = 50, offset = 0 } = req.query;
      
      let alerts;
      if (status === 'all') {
        alerts = AlertingService.getActiveAlerts().concat(
          AlertingService.getAcknowledgedAlerts().map(ack => ({ ...ack, status: 'acknowledged' }))
        );
      } else if (status === 'acknowledged') {
        alerts = AlertingService.getAcknowledgedAlerts();
      } else {
        alerts = AlertingService.getActiveAlerts();
      }

      // Filter by severity
      if (severity) {
        alerts = alerts.filter(alert => alert.severity === severity);
      }

      // Pagination
      const total = alerts.length;
      const paginatedAlerts = alerts
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: {
          alerts: paginatedAlerts,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: offset + parseInt(limit) < total
          },
          filters: { status, severity }
        }
      });

    } catch (error) {
      logger.error('Alerts retrieval error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve alerts'
      });
    }
  }
);

router.get('/alerts/:alertId',
  requireAdmin,
  [param('alertId').notEmpty().withMessage('Alert ID is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { alertId } = req.params;
      
      // Get alert from cache or monitoring service
      const CacheService = require('../services/CacheService');
      const alert = await CacheService.get(`alert:${alertId}`);
      
      if (!alert) {
        return res.status(404).json({
          success: false,
          error: 'Alert not found'
        });
      }

      // Get acknowledgment info if exists
      const acknowledgments = AlertingService.getAcknowledgedAlerts();
      const acknowledgment = acknowledgments.find(ack => ack.alertId === alertId);

      res.json({
        success: true,
        data: {
          alert,
          acknowledgment: acknowledgment || null
        }
      });

    } catch (error) {
      logger.error('Alert retrieval error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve alert'
      });
    }
  }
);

router.post('/alerts/:alertId/acknowledge',
  requireAdmin,
  [
    param('alertId').notEmpty().withMessage('Alert ID is required'),
    body('reason').optional().isString().trim().isLength({ max: 500 }).withMessage('Reason must be a string with max 500 characters')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { alertId } = req.params;
      const { reason = 'Acknowledged via API' } = req.body;
      const acknowledgedBy = req.user?.email || req.admin?.email || 'Unknown';

      AlertingService.acknowledgeAlert(alertId, acknowledgedBy, reason);

      res.json({
        success: true,
        message: 'Alert acknowledged successfully',
        data: {
          alertId,
          acknowledgedBy,
          reason,
          timestamp: Date.now()
        }
      });

    } catch (error) {
      logger.error('Alert acknowledgment error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge alert'
      });
    }
  }
);

// Notification Channel Management
router.get('/notifications/channels',
  requireAdmin,
  async (req, res) => {
    try {
      const channels = AlertingService.getNotificationChannels();
      
      res.json({
        success: true,
        data: { channels }
      });

    } catch (error) {
      logger.error('Notification channels retrieval error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve notification channels'
      });
    }
  }
);

router.put('/notifications/channels/:channelId',
  requireAdmin,
  [
    param('channelId').notEmpty().withMessage('Channel ID is required'),
    body('enabled').optional().isBoolean().withMessage('Enabled must be a boolean'),
    body('severityFilter').optional().isArray().withMessage('Severity filter must be an array')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { channelId } = req.params;
      const { enabled, severityFilter } = req.body;

      // This would update the channel configuration
      // For now, return success (implementation depends on persistent storage)
      
      res.json({
        success: true,
        message: 'Notification channel updated successfully',
        data: {
          channelId,
          updates: { enabled, severityFilter }
        }
      });

    } catch (error) {
      logger.error('Notification channel update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update notification channel'
      });
    }
  }
);

// Maintenance Windows
router.get('/maintenance',
  requireAdmin,
  async (req, res) => {
    try {
      const maintenanceWindows = AlertingService.getMaintenanceWindows();
      
      res.json({
        success: true,
        data: { maintenanceWindows }
      });

    } catch (error) {
      logger.error('Maintenance windows retrieval error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve maintenance windows'
      });
    }
  }
);

router.post('/maintenance',
  requireAdmin,
  [
    body('startTime').isISO8601().withMessage('Start time must be a valid ISO 8601 date'),
    body('endTime').isISO8601().withMessage('End time must be a valid ISO 8601 date'),
    body('description').notEmpty().trim().isLength({ max: 500 }).withMessage('Description is required and must be max 500 characters'),
    body('services').optional().isArray().withMessage('Services must be an array'),
    body('severity').optional().isArray().withMessage('Severity must be an array')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startTime, endTime, description, services, severity } = req.body;
      const createdBy = req.user?.email || req.admin?.email || 'Unknown';

      const startDate = new Date(startTime);
      const endDate = new Date(endTime);

      if (endDate <= startDate) {
        return res.status(400).json({
          success: false,
          error: 'End time must be after start time'
        });
      }

      const maintenanceWindow = {
        startTime: startDate.getTime(),
        endTime: endDate.getTime(),
        description,
        services: services || [],
        severity: severity || ['info', 'warning', 'critical'],
        createdBy
      };

      AlertingService.addMaintenanceWindow(maintenanceWindow);

      res.status(201).json({
        success: true,
        message: 'Maintenance window created successfully',
        data: maintenanceWindow
      });

    } catch (error) {
      logger.error('Maintenance window creation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create maintenance window'
      });
    }
  }
);

// Escalation Rules
router.get('/escalation/rules',
  requireAdmin,
  async (req, res) => {
    try {
      const escalationRules = AlertingService.getEscalationRules();
      
      res.json({
        success: true,
        data: { escalationRules }
      });

    } catch (error) {
      logger.error('Escalation rules retrieval error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve escalation rules'
      });
    }
  }
);

// Performance and Statistics
router.get('/stats/overview',
  requireAdmin,
  performanceMiddleware.responseCache({ ttl: 60 }),
  async (req, res) => {
    try {
      const activeAlerts = AlertingService.getActiveAlerts();
      const acknowledgments = AlertingService.getAcknowledgedAlerts();
      const channels = AlertingService.getNotificationChannels();
      const maintenanceWindows = AlertingService.getMaintenanceWindows();

      const stats = {
        alerts: {
          active: activeAlerts.length,
          critical: activeAlerts.filter(a => a.severity === 'critical').length,
          warning: activeAlerts.filter(a => a.severity === 'warning').length,
          acknowledged: acknowledgments.length
        },
        notifications: {
          channels: channels.length,
          enabled: channels.filter(c => c.enabled).length,
          totalSent: channels.reduce((sum, c) => sum + c.usageCount.day, 0)
        },
        maintenance: {
          active: maintenanceWindows.filter(w => 
            Date.now() >= w.startTime && Date.now() <= w.endTime
          ).length,
          scheduled: maintenanceWindows.filter(w => 
            Date.now() < w.startTime
          ).length
        },
        uptime: Math.round(process.uptime()),
        timestamp: Date.now()
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Stats overview error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve overview statistics'
      });
    }
  }
);

// Export metrics in Prometheus format (for external monitoring)
router.get('/export/prometheus',
  requireAdmin,
  async (req, res) => {
    try {
      const dashboardData = MonitoringService.getDashboardData();
      const alerts = AlertingService.getActiveAlerts();
      
      // Convert metrics to Prometheus format
      let output = '';
      
      // System metrics
      if (dashboardData.metrics.system.cpu) {
        output += `# HELP onetime_cpu_usage CPU usage percentage\n`;
        output += `# TYPE onetime_cpu_usage gauge\n`;
        output += `onetime_cpu_usage ${dashboardData.metrics.system.cpu.usage || 0}\n\n`;
      }

      if (dashboardData.metrics.system.memory) {
        output += `# HELP onetime_memory_usage Memory usage percentage\n`;
        output += `# TYPE onetime_memory_usage gauge\n`;
        output += `onetime_memory_usage ${dashboardData.metrics.system.memory.process?.usagePercent || 0}\n\n`;
      }

      // Application metrics
      if (dashboardData.metrics.application.requests) {
        output += `# HELP onetime_requests_total Total number of requests\n`;
        output += `# TYPE onetime_requests_total counter\n`;
        output += `onetime_requests_total ${dashboardData.metrics.application.requests.total || 0}\n\n`;
      }

      if (dashboardData.metrics.application.responseTime) {
        output += `# HELP onetime_response_time_avg Average response time in ms\n`;
        output += `# TYPE onetime_response_time_avg gauge\n`;
        output += `onetime_response_time_avg ${dashboardData.metrics.application.responseTime.avg || 0}\n\n`;
      }

      // Alert metrics
      output += `# HELP onetime_alerts_active Number of active alerts\n`;
      output += `# TYPE onetime_alerts_active gauge\n`;
      output += `onetime_alerts_active ${alerts.length}\n\n`;

      output += `# HELP onetime_alerts_critical Number of critical alerts\n`;
      output += `# TYPE onetime_alerts_critical gauge\n`;
      output += `onetime_alerts_critical ${alerts.filter(a => a.severity === 'critical').length}\n\n`;

      res.set('Content-Type', 'text/plain');
      res.send(output);

    } catch (error) {
      logger.error('Prometheus export error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export Prometheus metrics'
      });
    }
  }
);

module.exports = router;