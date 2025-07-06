/**
 * Monitoring Configuration
 * Centralized configuration for monitoring, alerting, and observability
 */

const monitoringConfig = {
  // Collection intervals (milliseconds)
  intervals: {
    metrics: parseInt(process.env.METRICS_INTERVAL) || 10000,      // 10 seconds
    health: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,  // 30 seconds
    cleanup: parseInt(process.env.CLEANUP_INTERVAL) || 3600000,    // 1 hour
    alerts: parseInt(process.env.ALERT_EVAL_INTERVAL) || 30000     // 30 seconds
  },

  // Data retention periods (milliseconds)
  retention: {
    metrics: parseInt(process.env.METRICS_RETENTION) || 86400000,    // 24 hours
    alerts: parseInt(process.env.ALERTS_RETENTION) || 604800000,     // 7 days
    health: parseInt(process.env.HEALTH_RETENTION) || 86400000,      // 24 hours
    performance: parseInt(process.env.PERFORMANCE_RETENTION) || 172800000 // 48 hours
  },

  // Alert thresholds
  thresholds: {
    system: {
      cpu: {
        warning: parseFloat(process.env.CPU_WARNING_THRESHOLD) || 70,    // 70%
        critical: parseFloat(process.env.CPU_CRITICAL_THRESHOLD) || 90   // 90%
      },
      memory: {
        warning: parseFloat(process.env.MEMORY_WARNING_THRESHOLD) || 80,   // 80%
        critical: parseFloat(process.env.MEMORY_CRITICAL_THRESHOLD) || 95  // 95%
      },
      disk: {
        warning: parseFloat(process.env.DISK_WARNING_THRESHOLD) || 85,    // 85%
        critical: parseFloat(process.env.DISK_CRITICAL_THRESHOLD) || 95   // 95%
      },
      loadAverage: {
        warning: parseFloat(process.env.LOAD_WARNING_THRESHOLD) || 2.0,
        critical: parseFloat(process.env.LOAD_CRITICAL_THRESHOLD) || 4.0
      }
    },

    application: {
      responseTime: {
        warning: parseInt(process.env.RESPONSE_TIME_WARNING) || 1000,    // 1 second
        critical: parseInt(process.env.RESPONSE_TIME_CRITICAL) || 5000   // 5 seconds
      },
      errorRate: {
        warning: parseFloat(process.env.ERROR_RATE_WARNING) || 5,        // 5%
        critical: parseFloat(process.env.ERROR_RATE_CRITICAL) || 10      // 10%
      },
      activeUsers: {
        min: parseInt(process.env.MIN_ACTIVE_USERS) || 1,
        warning: parseInt(process.env.ACTIVE_USERS_WARNING) || 1000,
        critical: parseInt(process.env.ACTIVE_USERS_CRITICAL) || 5000
      },
      requestRate: {
        warning: parseInt(process.env.REQUEST_RATE_WARNING) || 1000,     // requests per minute
        critical: parseInt(process.env.REQUEST_RATE_CRITICAL) || 2000
      }
    },

    database: {
      connections: {
        warning: parseFloat(process.env.DB_CONN_WARNING_THRESHOLD) || 80,  // 80%
        critical: parseFloat(process.env.DB_CONN_CRITICAL_THRESHOLD) || 95 // 95%
      },
      queryTime: {
        warning: parseInt(process.env.DB_QUERY_TIME_WARNING) || 1000,     // 1 second
        critical: parseInt(process.env.DB_QUERY_TIME_CRITICAL) || 5000    // 5 seconds
      },
      slowQueries: {
        warning: parseInt(process.env.DB_SLOW_QUERIES_WARNING) || 10,     // per minute
        critical: parseInt(process.env.DB_SLOW_QUERIES_CRITICAL) || 50
      },
      replicationLag: {
        warning: parseInt(process.env.DB_REPLICATION_LAG_WARNING) || 5000,  // 5 seconds
        critical: parseInt(process.env.DB_REPLICATION_LAG_CRITICAL) || 30000 // 30 seconds
      }
    },

    cache: {
      hitRate: {
        warning: parseFloat(process.env.CACHE_HIT_RATE_WARNING) || 50,    // 50%
        critical: parseFloat(process.env.CACHE_HIT_RATE_CRITICAL) || 30   // 30%
      },
      memory: {
        warning: parseFloat(process.env.CACHE_MEMORY_WARNING) || 80,      // 80%
        critical: parseFloat(process.env.CACHE_MEMORY_CRITICAL) || 95     // 95%
      },
      connectionErrors: {
        warning: parseInt(process.env.CACHE_ERROR_WARNING) || 5,          // per minute
        critical: parseInt(process.env.CACHE_ERROR_CRITICAL) || 20
      }
    },

    business: {
      userRegistrations: {
        min: parseInt(process.env.MIN_REGISTRATIONS_PER_HOUR) || 1,
        warning: parseInt(process.env.REGISTRATIONS_WARNING) || 100,
        critical: parseInt(process.env.REGISTRATIONS_CRITICAL) || 500
      },
      subscriptionChurn: {
        warning: parseFloat(process.env.CHURN_RATE_WARNING) || 5,         // 5%
        critical: parseFloat(process.env.CHURN_RATE_CRITICAL) || 15       // 15%
      },
      revenueDrops: {
        warning: parseFloat(process.env.REVENUE_DROP_WARNING) || 10,      // 10%
        critical: parseFloat(process.env.REVENUE_DROP_CRITICAL) || 25     // 25%
      }
    }
  },

  // Notification settings
  notifications: {
    // Email configuration
    email: {
      enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
      service: process.env.EMAIL_SERVICE || 'gmail',
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      from: process.env.EMAIL_FROM || 'alerts@onetime.app',
      to: process.env.ALERT_EMAIL_TO?.split(',') || [],
      
      // Email specific settings
      rateLimiting: {
        maxPerHour: parseInt(process.env.EMAIL_MAX_PER_HOUR) || 10,
        maxPerDay: parseInt(process.env.EMAIL_MAX_PER_DAY) || 50
      },
      templates: {
        alert: process.env.EMAIL_ALERT_TEMPLATE || 'default',
        resolution: process.env.EMAIL_RESOLUTION_TEMPLATE || 'default'
      }
    },

    // Slack configuration
    slack: {
      enabled: !!process.env.SLACK_WEBHOOK_URL,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      channel: process.env.SLACK_CHANNEL || '#alerts',
      username: process.env.SLACK_USERNAME || 'OneTime Alerts',
      iconEmoji: process.env.SLACK_ICON || ':warning:',
      
      rateLimiting: {
        maxPerHour: parseInt(process.env.SLACK_MAX_PER_HOUR) || 20,
        maxPerDay: parseInt(process.env.SLACK_MAX_PER_DAY) || 100
      },
      
      // Channel routing based on severity
      channels: {
        critical: process.env.SLACK_CRITICAL_CHANNEL || '#critical-alerts',
        warning: process.env.SLACK_WARNING_CHANNEL || '#alerts',
        info: process.env.SLACK_INFO_CHANNEL || '#monitoring'
      }
    },

    // SMS configuration (via Twilio)
    sms: {
      enabled: !!process.env.TWILIO_ACCOUNT_SID,
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.ALERT_SMS_TO?.split(',') || [],
      
      rateLimiting: {
        maxPerHour: parseInt(process.env.SMS_MAX_PER_HOUR) || 5,
        maxPerDay: parseInt(process.env.SMS_MAX_PER_DAY) || 20
      },
      
      // Only for critical alerts by default
      severityFilter: ['critical']
    },

    // Webhook configuration
    webhook: {
      enabled: !!process.env.ALERT_WEBHOOK_URL,
      url: process.env.ALERT_WEBHOOK_URL,
      method: process.env.ALERT_WEBHOOK_METHOD || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OneTime-Monitoring/1.0'
      },
      
      // Add authentication if provided
      ...(process.env.ALERT_WEBHOOK_TOKEN && {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}`
        }
      }),
      
      timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 5000,
      retries: parseInt(process.env.WEBHOOK_RETRIES) || 3,
      
      rateLimiting: {
        maxPerHour: parseInt(process.env.WEBHOOK_MAX_PER_HOUR) || 100,
        maxPerDay: parseInt(process.env.WEBHOOK_MAX_PER_DAY) || 1000
      }
    },

    // PagerDuty configuration
    pagerduty: {
      enabled: !!process.env.PAGERDUTY_INTEGRATION_KEY,
      integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
      apiUrl: process.env.PAGERDUTY_API_URL || 'https://events.pagerduty.com/v2/enqueue',
      
      rateLimiting: {
        maxPerHour: parseInt(process.env.PAGERDUTY_MAX_PER_HOUR) || 10,
        maxPerDay: parseInt(process.env.PAGERDUTY_MAX_PER_DAY) || 50
      },
      
      // Only for critical alerts
      severityFilter: ['critical']
    },

    // Microsoft Teams configuration
    teams: {
      enabled: !!process.env.TEAMS_WEBHOOK_URL,
      webhookUrl: process.env.TEAMS_WEBHOOK_URL,
      
      rateLimiting: {
        maxPerHour: parseInt(process.env.TEAMS_MAX_PER_HOUR) || 20,
        maxPerDay: parseInt(process.env.TEAMS_MAX_PER_DAY) || 100
      }
    }
  },

  // Escalation configuration
  escalation: {
    enabled: process.env.ESCALATION_ENABLED !== 'false',
    
    // Default escalation rules
    rules: {
      critical: {
        enabled: true,
        steps: [
          { delay: 0, channels: ['slack', 'email'] },
          { delay: 300000, channels: ['sms'] },                    // 5 minutes
          { delay: 900000, channels: ['pagerduty'] },              // 15 minutes
          { delay: 1800000, channels: ['email'], escalateToManagement: true } // 30 minutes
        ]
      },
      
      database: {
        enabled: true,
        steps: [
          { delay: 0, channels: ['slack', 'email'] },
          { delay: 600000, channels: ['sms'] },                    // 10 minutes
          { delay: 1800000, channels: ['pagerduty'] }              // 30 minutes
        ]
      },
      
      memory: {
        enabled: true,
        steps: [
          { delay: 0, channels: ['slack'] },
          { delay: 600000, channels: ['email'] },                  // 10 minutes
          { delay: 1800000, channels: ['sms', 'pagerduty'] }       // 30 minutes
        ]
      }
    },

    // Management escalation contacts
    management: {
      email: process.env.MANAGEMENT_EMAIL_TO?.split(',') || [],
      sms: process.env.MANAGEMENT_SMS_TO?.split(',') || [],
      slack: process.env.MANAGEMENT_SLACK_CHANNEL || '#executive-alerts'
    }
  },

  // Alert correlation and grouping
  correlation: {
    enabled: process.env.ALERT_CORRELATION_ENABLED !== 'false',
    timeWindow: parseInt(process.env.CORRELATION_TIME_WINDOW) || 300000, // 5 minutes
    
    rules: {
      systemResources: {
        enabled: true,
        metrics: ['system.cpu.usage', 'system.memory.process.usagePercent', 'system.disk.usagePercent'],
        threshold: 0.8 // 80% correlation threshold
      },
      
      databasePerformance: {
        enabled: true,
        metrics: ['database.connections.usagePercent', 'database.queryTime.avg', 'database.operations.slowQueries'],
        threshold: 0.7
      },
      
      applicationPerformance: {
        enabled: true,
        metrics: ['application.responseTime.avg', 'application.errors.rate', 'system.memory.process.usagePercent'],
        threshold: 0.6
      }
    }
  },

  // Alert suppression
  suppression: {
    enabled: process.env.ALERT_SUPPRESSION_ENABLED !== 'false',
    
    rules: {
      duplicates: {
        enabled: true,
        timeWindow: parseInt(process.env.DUPLICATE_SUPPRESSION_WINDOW) || 300000, // 5 minutes
        maxOccurrences: parseInt(process.env.MAX_DUPLICATE_ALERTS) || 3
      },
      
      maintenance: {
        enabled: true,
        // Suppress all alerts during maintenance windows
        suppressAll: true
      },
      
      cascade: {
        enabled: true,
        // Suppress child alerts when parent system is down
        parentMetrics: ['database.connections.state', 'cache.hitRate'],
        suppressionDelay: 60000 // 1 minute
      }
    }
  },

  // Health check configuration
  healthChecks: {
    enabled: process.env.HEALTH_CHECKS_ENABLED !== 'false',
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000,
    
    services: {
      database: {
        enabled: true,
        timeout: 5000,
        query: 'ping', // Simple ping operation
        threshold: 1000 // Consider unhealthy if response > 1s
      },
      
      cache: {
        enabled: true,
        timeout: 3000,
        operation: 'get',
        key: 'health_check',
        threshold: 500
      },
      
      storage: {
        enabled: process.env.STORAGE_HEALTH_CHECK === 'true',
        timeout: 5000,
        operation: 'list',
        threshold: 2000
      },
      
      external: {
        enabled: process.env.EXTERNAL_HEALTH_CHECK === 'true',
        services: [
          {
            name: 'stripe',
            url: 'https://status.stripe.com/api/v2/status.json',
            timeout: 5000
          },
          {
            name: 'twilio',
            url: 'https://status.twilio.com/api/v2/status.json',
            timeout: 5000
          }
        ]
      }
    }
  },

  // Metrics export configuration
  export: {
    prometheus: {
      enabled: process.env.PROMETHEUS_EXPORT_ENABLED === 'true',
      endpoint: '/metrics/export/prometheus',
      includeGoMetrics: false,
      includeNodeMetrics: true,
      prefix: 'onetime_'
    },
    
    datadog: {
      enabled: process.env.DATADOG_EXPORT_ENABLED === 'true',
      apiKey: process.env.DATADOG_API_KEY,
      host: process.env.DATADOG_HOST || 'https://api.datadoghq.com',
      tags: process.env.DATADOG_TAGS?.split(',') || ['env:production', 'service:onetime-backend']
    },
    
    newrelic: {
      enabled: process.env.NEWRELIC_EXPORT_ENABLED === 'true',
      licenseKey: process.env.NEWRELIC_LICENSE_KEY,
      appName: process.env.NEWRELIC_APP_NAME || 'OneTime Backend'
    }
  },

  // Dashboard configuration
  dashboard: {
    enabled: process.env.MONITORING_DASHBOARD_ENABLED !== 'false',
    refreshInterval: parseInt(process.env.DASHBOARD_REFRESH_INTERVAL) || 30000, // 30 seconds
    
    // Default dashboard layout
    layout: {
      widgets: ['system-overview', 'application-metrics', 'database-status', 'alerts-summary'],
      timeRanges: ['5m', '1h', '24h', '7d'],
      defaultTimeRange: process.env.DEFAULT_TIME_RANGE || '1h'
    },
    
    // Chart configurations
    charts: {
      maxDataPoints: parseInt(process.env.CHART_MAX_DATA_POINTS) || 100,
      smoothing: process.env.CHART_SMOOTHING === 'true',
      aggregation: process.env.CHART_AGGREGATION || 'average' // average, max, min
    }
  },

  // Security settings
  security: {
    apiKeys: {
      enabled: process.env.MONITORING_API_KEYS_ENABLED === 'true',
      keys: process.env.MONITORING_API_KEYS?.split(',') || []
    },
    
    rateLimiting: {
      enabled: true,
      windowMs: 60000, // 1 minute
      max: 100, // 100 requests per minute
      skipSuccessfulRequests: false
    },
    
    cors: {
      enabled: true,
      origins: process.env.MONITORING_CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }
  }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'development') {
  monitoringConfig.intervals.metrics = 5000; // More frequent in development
  monitoringConfig.notifications.email.enabled = false; // Disable emails in dev
  monitoringConfig.notifications.sms.enabled = false; // Disable SMS in dev
}

if (process.env.NODE_ENV === 'test') {
  monitoringConfig.intervals.metrics = 1000; // Very frequent in tests
  monitoringConfig.notifications.email.enabled = false;
  monitoringConfig.notifications.slack.enabled = false;
  monitoringConfig.notifications.sms.enabled = false;
  monitoringConfig.escalation.enabled = false;
}

if (process.env.NODE_ENV === 'production') {
  // Production-specific settings
  monitoringConfig.retention.metrics = 604800000; // 7 days in production
  monitoringConfig.retention.alerts = 2592000000; // 30 days in production
}

module.exports = monitoringConfig;