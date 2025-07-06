/**
 * Advanced Alerting Service
 * Intelligent alerting with escalation, notification channels, and alert correlation
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const CacheService = require('./CacheService');

class AlertingService {
  constructor() {
    this.notificationChannels = new Map();
    this.escalationRules = new Map();
    this.alertGroups = new Map();
    this.suppressionRules = new Map();
    this.correlationRules = new Map();
    
    this.alertHistory = [];
    this.acknowledgments = new Map();
    this.maintenanceWindows = [];
    
    this.initialize();
  }

  initialize() {
    logger.info('Initializing alerting service...');
    
    // Setup default notification channels
    this.setupDefaultChannels();
    
    // Setup escalation rules
    this.setupEscalationRules();
    
    // Setup alert correlation
    this.setupCorrelationRules();
    
    // Setup alert grouping
    this.setupAlertGrouping();
    
    // Start maintenance tasks
    this.startMaintenanceTasks();
    
    logger.info('Alerting service initialized successfully');
  }

  // Notification Channels
  setupDefaultChannels() {
    // Email channel
    this.addNotificationChannel('email', {
      type: 'email',
      name: 'Email Notifications',
      enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
      config: {
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        from: process.env.EMAIL_FROM || 'alerts@onetime.app',
        to: process.env.ALERT_EMAIL_TO?.split(',') || []
      },
      severityFilter: ['warning', 'critical'],
      rateLimiting: {
        maxPerHour: 10,
        maxPerDay: 50
      }
    });

    // Slack channel
    this.addNotificationChannel('slack', {
      type: 'slack',
      name: 'Slack Notifications',
      enabled: !!process.env.SLACK_WEBHOOK_URL,
      config: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL || '#alerts',
        username: 'OneTime Alerts',
        iconEmoji: ':warning:'
      },
      severityFilter: ['warning', 'critical'],
      rateLimiting: {
        maxPerHour: 20,
        maxPerDay: 100
      }
    });

    // SMS channel (via Twilio)
    this.addNotificationChannel('sms', {
      type: 'sms',
      name: 'SMS Notifications',
      enabled: !!process.env.TWILIO_ACCOUNT_SID,
      config: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: process.env.ALERT_SMS_TO?.split(',') || []
      },
      severityFilter: ['critical'],
      rateLimiting: {
        maxPerHour: 5,
        maxPerDay: 20
      }
    });

    // Webhook channel
    this.addNotificationChannel('webhook', {
      type: 'webhook',
      name: 'Webhook Notifications',
      enabled: !!process.env.ALERT_WEBHOOK_URL,
      config: {
        url: process.env.ALERT_WEBHOOK_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.ALERT_WEBHOOK_TOKEN ? `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}` : undefined
        }
      },
      severityFilter: ['info', 'warning', 'critical'],
      rateLimiting: {
        maxPerHour: 100,
        maxPerDay: 1000
      }
    });

    // PagerDuty channel
    this.addNotificationChannel('pagerduty', {
      type: 'pagerduty',
      name: 'PagerDuty Integration',
      enabled: !!process.env.PAGERDUTY_INTEGRATION_KEY,
      config: {
        integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
        apiUrl: 'https://events.pagerduty.com/v2/enqueue'
      },
      severityFilter: ['critical'],
      rateLimiting: {
        maxPerHour: 10,
        maxPerDay: 50
      }
    });
  }

  addNotificationChannel(id, config) {
    this.notificationChannels.set(id, {
      ...config,
      id,
      lastUsed: 0,
      usageCount: { hour: 0, day: 0 },
      errors: []
    });
  }

  // Escalation Rules
  setupEscalationRules() {
    // Default escalation for critical alerts
    this.addEscalationRule('critical_escalation', {
      trigger: {
        severity: 'critical',
        unacknowledged: true
      },
      steps: [
        { delay: 0, channels: ['slack', 'email'] },
        { delay: 300000, channels: ['sms'] }, // 5 minutes
        { delay: 900000, channels: ['pagerduty'] }, // 15 minutes
        { delay: 1800000, channels: ['email'], escalateToManagement: true } // 30 minutes
      ]
    });

    // Memory alerts escalation
    this.addEscalationRule('memory_escalation', {
      trigger: {
        metric: 'system.memory.process.usagePercent',
        threshold: 90
      },
      steps: [
        { delay: 0, channels: ['slack'] },
        { delay: 600000, channels: ['email'] }, // 10 minutes
        { delay: 1800000, channels: ['sms', 'pagerduty'] } // 30 minutes
      ]
    });

    // Database alerts escalation
    this.addEscalationRule('database_escalation', {
      trigger: {
        category: 'database',
        severity: ['warning', 'critical']
      },
      steps: [
        { delay: 0, channels: ['slack', 'email'] },
        { delay: 600000, channels: ['sms'] }, // 10 minutes
        { delay: 1800000, channels: ['pagerduty'] } // 30 minutes
      ]
    });
  }

  addEscalationRule(id, rule) {
    this.escalationRules.set(id, {
      ...rule,
      id,
      enabled: true,
      activeEscalations: new Map()
    });
  }

  // Alert Processing
  async processAlert(alert) {
    try {
      // Check if alert should be suppressed
      if (this.shouldSuppressAlert(alert)) {
        logger.debug(`Alert suppressed: ${alert.id}`);
        return;
      }

      // Check maintenance windows
      if (this.isInMaintenanceWindow(alert)) {
        logger.debug(`Alert occurred during maintenance window: ${alert.id}`);
        return;
      }

      // Correlate with existing alerts
      const correlatedAlerts = this.correlateAlert(alert);
      if (correlatedAlerts.length > 0) {
        logger.debug(`Alert correlated with ${correlatedAlerts.length} existing alerts`);
        alert.correlatedWith = correlatedAlerts.map(a => a.id);
      }

      // Group similar alerts
      const groupId = this.groupAlert(alert);
      if (groupId) {
        alert.groupId = groupId;
      }

      // Store alert
      this.alertHistory.push(alert);
      await CacheService.set(`alert:${alert.id}`, alert, 86400); // 24 hours

      // Process escalation rules
      await this.processEscalation(alert);

      // Send initial notifications
      await this.sendNotifications(alert);

      logger.info('Alert processed successfully:', {
        alertId: alert.id,
        severity: alert.severity,
        groupId: alert.groupId,
        correlations: alert.correlatedWith?.length || 0
      });

    } catch (error) {
      logger.error('Error processing alert:', error);
    }
  }

  shouldSuppressAlert(alert) {
    for (const [ruleId, rule] of this.suppressionRules) {
      if (!rule.enabled) continue;

      let shouldSuppress = false;

      // Check conditions
      if (rule.conditions.severity && rule.conditions.severity.includes(alert.severity)) {
        shouldSuppress = true;
      }

      if (rule.conditions.metric && alert.metric === rule.conditions.metric) {
        shouldSuppress = true;
      }

      if (rule.conditions.source && alert.source === rule.conditions.source) {
        shouldSuppress = true;
      }

      // Check time-based suppression
      if (rule.timeWindow) {
        const now = Date.now();
        const windowStart = now - rule.timeWindow;
        
        const recentSimilarAlerts = this.alertHistory.filter(a => 
          a.timestamp > windowStart &&
          a.ruleName === alert.ruleName &&
          a.metric === alert.metric
        );

        if (recentSimilarAlerts.length >= rule.maxOccurrences) {
          shouldSuppress = true;
        }
      }

      if (shouldSuppress) {
        logger.debug(`Alert suppressed by rule: ${ruleId}`);
        return true;
      }
    }

    return false;
  }

  isInMaintenanceWindow(alert) {
    const now = Date.now();
    
    return this.maintenanceWindows.some(window => {
      if (!window.active) return false;
      
      const inTimeWindow = now >= window.startTime && now <= window.endTime;
      
      if (!inTimeWindow) return false;
      
      // Check if alert matches window criteria
      if (window.services && !window.services.includes(alert.service)) return false;
      if (window.severity && !window.severity.includes(alert.severity)) return false;
      
      return true;
    });
  }

  correlateAlert(alert) {
    const correlations = [];
    
    for (const [ruleId, rule] of this.correlationRules) {
      if (!rule.enabled) continue;
      
      const timeWindow = alert.timestamp - rule.timeWindow;
      
      const candidateAlerts = this.alertHistory.filter(a => 
        a.timestamp > timeWindow &&
        a.id !== alert.id &&
        !a.resolved
      );

      for (const candidate of candidateAlerts) {
        if (this.alertsMatch(alert, candidate, rule.conditions)) {
          correlations.push(candidate);
        }
      }
    }

    return correlations;
  }

  alertsMatch(alert1, alert2, conditions) {
    // Check if alerts match based on conditions
    if (conditions.sameService && alert1.service !== alert2.service) return false;
    if (conditions.sameHost && alert1.host !== alert2.host) return false;
    if (conditions.sameMetricFamily && !this.isSameMetricFamily(alert1.metric, alert2.metric)) return false;
    if (conditions.relatedMetrics && !conditions.relatedMetrics.includes(alert2.metric)) return false;
    
    return true;
  }

  isSameMetricFamily(metric1, metric2) {
    // Simple metric family matching
    const family1 = metric1.split('.')[0];
    const family2 = metric2.split('.')[0];
    return family1 === family2;
  }

  groupAlert(alert) {
    // Simple grouping based on service, severity, and time
    const groupKey = `${alert.service}_${alert.severity}_${Math.floor(alert.timestamp / 300000)}`; // 5-minute windows
    
    if (!this.alertGroups.has(groupKey)) {
      this.alertGroups.set(groupKey, {
        id: groupKey,
        alerts: [],
        firstAlert: alert.timestamp,
        lastAlert: alert.timestamp,
        count: 0
      });
    }

    const group = this.alertGroups.get(groupKey);
    group.alerts.push(alert.id);
    group.lastAlert = alert.timestamp;
    group.count++;

    return groupKey;
  }

  // Escalation Processing
  async processEscalation(alert) {
    for (const [ruleId, rule] of this.escalationRules) {
      if (!rule.enabled) continue;
      
      if (this.shouldEscalate(alert, rule.trigger)) {
        await this.startEscalation(alert, rule);
      }
    }
  }

  shouldEscalate(alert, trigger) {
    // Check severity
    if (trigger.severity && trigger.severity !== alert.severity) return false;
    
    // Check if unacknowledged
    if (trigger.unacknowledged && this.acknowledgments.has(alert.id)) return false;
    
    // Check metric
    if (trigger.metric && trigger.metric !== alert.metric) return false;
    
    // Check threshold
    if (trigger.threshold && alert.currentValue < trigger.threshold) return false;
    
    // Check category
    if (trigger.category && trigger.category !== alert.category) return false;
    
    return true;
  }

  async startEscalation(alert, rule) {
    const escalationId = `${alert.id}_${rule.id}`;
    
    if (rule.activeEscalations.has(escalationId)) {
      return; // Already escalating
    }

    logger.info(`Starting escalation for alert ${alert.id} with rule ${rule.id}`);
    
    const escalation = {
      id: escalationId,
      alertId: alert.id,
      ruleId: rule.id,
      startTime: Date.now(),
      currentStep: 0,
      completed: false
    };

    rule.activeEscalations.set(escalationId, escalation);
    
    // Execute escalation steps
    for (let i = 0; i < rule.steps.length; i++) {
      const step = rule.steps[i];
      
      setTimeout(async () => {
        if (this.acknowledgments.has(alert.id)) {
          logger.info(`Escalation stopped - alert ${alert.id} acknowledged`);
          rule.activeEscalations.delete(escalationId);
          return;
        }

        escalation.currentStep = i;
        await this.executeEscalationStep(alert, step, escalation);
        
        if (i === rule.steps.length - 1) {
          escalation.completed = true;
          rule.activeEscalations.delete(escalationId);
        }
      }, step.delay);
    }
  }

  async executeEscalationStep(alert, step, escalation) {
    logger.info(`Executing escalation step ${escalation.currentStep} for alert ${alert.id}`);
    
    // Send notifications through specified channels
    for (const channelId of step.channels) {
      await this.sendNotificationToChannel(alert, channelId, {
        escalation: true,
        escalationStep: escalation.currentStep
      });
    }

    // Handle management escalation
    if (step.escalateToManagement) {
      await this.escalateToManagement(alert, escalation);
    }
  }

  async escalateToManagement(alert, escalation) {
    const managementAlert = {
      ...alert,
      id: `mgmt_${alert.id}`,
      severity: 'critical',
      description: `MANAGEMENT ESCALATION: ${alert.description}`,
      escalatedFrom: alert.id,
      escalationReason: 'Unacknowledged critical alert'
    };

    // Send to management channels
    const mgmtChannels = ['email', 'sms', 'pagerduty'];
    for (const channelId of mgmtChannels) {
      const channel = this.notificationChannels.get(channelId);
      if (channel && channel.enabled) {
        // Override recipient for management escalation
        const originalConfig = { ...channel.config };
        
        if (channelId === 'email') {
          channel.config.to = process.env.MANAGEMENT_EMAIL_TO?.split(',') || channel.config.to;
        } else if (channelId === 'sms') {
          channel.config.to = process.env.MANAGEMENT_SMS_TO?.split(',') || channel.config.to;
        }

        await this.sendNotificationToChannel(managementAlert, channelId);
        
        // Restore original config
        channel.config = originalConfig;
      }
    }

    logger.warn('Alert escalated to management:', {
      originalAlert: alert.id,
      managementAlert: managementAlert.id
    });
  }

  // Notification Sending
  async sendNotifications(alert) {
    const applicableChannels = Array.from(this.notificationChannels.values())
      .filter(channel => 
        channel.enabled &&
        channel.severityFilter.includes(alert.severity) &&
        this.canSendToChannel(channel)
      );

    const notifications = applicableChannels.map(channel =>
      this.sendNotificationToChannel(alert, channel.id)
    );

    await Promise.allSettled(notifications);
  }

  canSendToChannel(channel) {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    // Reset counters if needed
    if (now - channel.lastUsed > oneHour) {
      channel.usageCount.hour = 0;
    }
    if (now - channel.lastUsed > oneDay) {
      channel.usageCount.day = 0;
    }

    // Check rate limits
    if (channel.usageCount.hour >= channel.rateLimiting.maxPerHour) {
      logger.warn(`Rate limit exceeded for channel ${channel.id} (hourly)`);
      return false;
    }
    if (channel.usageCount.day >= channel.rateLimiting.maxPerDay) {
      logger.warn(`Rate limit exceeded for channel ${channel.id} (daily)`);
      return false;
    }

    return true;
  }

  async sendNotificationToChannel(alert, channelId, options = {}) {
    const channel = this.notificationChannels.get(channelId);
    if (!channel || !channel.enabled) return;

    try {
      // Update usage counters
      channel.usageCount.hour++;
      channel.usageCount.day++;
      channel.lastUsed = Date.now();

      switch (channel.type) {
        case 'email':
          await this.sendEmailNotification(alert, channel, options);
          break;
        case 'slack':
          await this.sendSlackNotification(alert, channel, options);
          break;
        case 'sms':
          await this.sendSMSNotification(alert, channel, options);
          break;
        case 'webhook':
          await this.sendWebhookNotification(alert, channel, options);
          break;
        case 'pagerduty':
          await this.sendPagerDutyNotification(alert, channel, options);
          break;
        default:
          logger.warn(`Unknown notification channel type: ${channel.type}`);
      }

      logger.debug(`Notification sent via ${channelId} for alert ${alert.id}`);

    } catch (error) {
      logger.error(`Failed to send notification via ${channelId}:`, error);
      
      // Store error for monitoring
      channel.errors.push({
        timestamp: Date.now(),
        error: error.message,
        alertId: alert.id
      });

      // Keep only recent errors
      if (channel.errors.length > 10) {
        channel.errors = channel.errors.slice(-10);
      }
    }
  }

  async sendEmailNotification(alert, channel, options) {
    const transporter = nodemailer.createTransporter({
      service: channel.config.service,
      auth: channel.config.auth
    });

    const subject = options.escalation 
      ? `[ESCALATION] [${alert.severity.toUpperCase()}] OneTime Alert: ${alert.description}`
      : `[${alert.severity.toUpperCase()}] OneTime Alert: ${alert.description}`;

    const escalationInfo = options.escalation 
      ? `<p><strong>⚠️ ESCALATION STEP ${options.escalationStep + 1}</strong></p>`
      : '';

    const correlationInfo = alert.correlatedWith?.length 
      ? `<p><strong>Correlated Alerts:</strong> ${alert.correlatedWith.length}</p>`
      : '';

    const html = `
      <h2>🚨 Alert Notification</h2>
      ${escalationInfo}
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Severity:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${alert.severity}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Description:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${alert.description}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Metric:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${alert.metric}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Current Value:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${alert.currentValue}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Threshold:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${alert.threshold}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Time:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${new Date(alert.timestamp).toISOString()}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Alert ID:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${alert.id}</td></tr>
      </table>
      ${correlationInfo}
      <p><a href="${process.env.DASHBOARD_URL}/alerts/${alert.id}">View in Dashboard</a></p>
    `;

    await transporter.sendMail({
      from: channel.config.from,
      to: channel.config.to,
      subject,
      html
    });
  }

  async sendSlackNotification(alert, channel, options) {
    const fetch = require('node-fetch');
    
    const color = alert.severity === 'critical' ? 'danger' : 'warning';
    const icon = options.escalation ? '🚨🔥' : '🚨';
    
    const title = options.escalation 
      ? `${icon} ESCALATION STEP ${options.escalationStep + 1}: ${alert.severity.toUpperCase()} Alert`
      : `${icon} ${alert.severity.toUpperCase()} Alert`;

    const fields = [
      { title: 'Description', value: alert.description, short: false },
      { title: 'Metric', value: alert.metric, short: true },
      { title: 'Current Value', value: alert.currentValue.toString(), short: true },
      { title: 'Threshold', value: alert.threshold.toString(), short: true },
      { title: 'Time', value: new Date(alert.timestamp).toISOString(), short: true }
    ];

    if (alert.correlatedWith?.length) {
      fields.push({ title: 'Correlated Alerts', value: alert.correlatedWith.length.toString(), short: true });
    }

    const slackMessage = {
      channel: channel.config.channel,
      username: channel.config.username,
      icon_emoji: channel.config.iconEmoji,
      attachments: [{
        color,
        title,
        fields,
        footer: `Alert ID: ${alert.id}`,
        ts: Math.floor(alert.timestamp / 1000)
      }]
    };

    await fetch(channel.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });
  }

  async sendSMSNotification(alert, channel, options) {
    const twilio = require('twilio');
    const client = twilio(channel.config.accountSid, channel.config.authToken);

    const escalationPrefix = options.escalation ? `ESCALATION: ` : '';
    const message = `${escalationPrefix}OneTime Alert [${alert.severity.toUpperCase()}]: ${alert.description}. Value: ${alert.currentValue}/${alert.threshold}. Time: ${new Date(alert.timestamp).toLocaleString()}`;

    for (const to of channel.config.to) {
      await client.messages.create({
        body: message,
        from: channel.config.from,
        to: to.trim()
      });
    }
  }

  async sendWebhookNotification(alert, channel, options) {
    const fetch = require('node-fetch');
    
    const payload = {
      type: 'alert',
      alert: {
        ...alert,
        escalation: options.escalation || false,
        escalationStep: options.escalationStep
      },
      timestamp: new Date().toISOString()
    };

    await fetch(channel.config.url, {
      method: channel.config.method,
      headers: channel.config.headers,
      body: JSON.stringify(payload)
    });
  }

  async sendPagerDutyNotification(alert, channel, options) {
    const fetch = require('node-fetch');
    
    const payload = {
      routing_key: channel.config.integrationKey,
      event_action: 'trigger',
      dedup_key: alert.id,
      payload: {
        summary: `${alert.severity.toUpperCase()}: ${alert.description}`,
        source: 'OneTime Monitoring',
        severity: alert.severity === 'critical' ? 'critical' : 'warning',
        custom_details: {
          metric: alert.metric,
          current_value: alert.currentValue,
          threshold: alert.threshold,
          escalation: options.escalation || false,
          escalation_step: options.escalationStep
        }
      }
    };

    await fetch(channel.config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // Alert Management
  acknowledgeAlert(alertId, acknowledgedBy, reason) {
    this.acknowledgments.set(alertId, {
      acknowledgedBy,
      reason,
      timestamp: Date.now()
    });

    logger.info(`Alert acknowledged: ${alertId} by ${acknowledgedBy}`);
    
    // Stop any active escalations
    for (const [ruleId, rule] of this.escalationRules) {
      const escalationId = `${alertId}_${ruleId}`;
      if (rule.activeEscalations.has(escalationId)) {
        rule.activeEscalations.delete(escalationId);
        logger.info(`Escalation stopped for acknowledged alert: ${alertId}`);
      }
    }
  }

  addMaintenanceWindow(window) {
    this.maintenanceWindows.push({
      id: `mw_${Date.now()}`,
      startTime: window.startTime,
      endTime: window.endTime,
      services: window.services || [],
      severity: window.severity || ['info', 'warning', 'critical'],
      description: window.description,
      active: true,
      createdBy: window.createdBy
    });

    logger.info('Maintenance window added:', window);
  }

  // Correlation Rules Setup
  setupCorrelationRules() {
    // System resource correlation
    this.addCorrelationRule('system_resources', {
      enabled: true,
      timeWindow: 300000, // 5 minutes
      conditions: {
        sameService: true,
        sameHost: true,
        sameMetricFamily: true
      }
    });

    // Database correlation
    this.addCorrelationRule('database_issues', {
      enabled: true,
      timeWindow: 600000, // 10 minutes
      conditions: {
        relatedMetrics: [
          'database.connections.usagePercent',
          'database.queryTime.avg',
          'database.operations.slowQueries'
        ]
      }
    });

    // Application performance correlation
    this.addCorrelationRule('app_performance', {
      enabled: true,
      timeWindow: 300000, // 5 minutes
      conditions: {
        relatedMetrics: [
          'application.responseTime.avg',
          'application.errors.rate',
          'system.memory.process.usagePercent',
          'system.cpu.usage'
        ]
      }
    });
  }

  addCorrelationRule(id, rule) {
    this.correlationRules.set(id, rule);
  }

  // Maintenance Tasks
  startMaintenanceTasks() {
    // Clean old alerts every hour
    setInterval(() => {
      this.cleanOldAlerts();
    }, 3600000);

    // Clean expired maintenance windows daily
    setInterval(() => {
      this.cleanExpiredMaintenanceWindows();
    }, 86400000);

    // Reset rate limiting counters hourly
    setInterval(() => {
      this.resetRateLimitingCounters();
    }, 3600000);
  }

  cleanOldAlerts() {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    
    this.alertHistory = this.alertHistory.filter(alert => alert.timestamp > cutoffTime);
    
    // Clean acknowledgments
    for (const [alertId, ack] of this.acknowledgments) {
      if (ack.timestamp < cutoffTime) {
        this.acknowledgments.delete(alertId);
      }
    }

    logger.debug('Old alerts cleaned up');
  }

  cleanExpiredMaintenanceWindows() {
    const now = Date.now();
    
    this.maintenanceWindows = this.maintenanceWindows.filter(window => {
      if (window.endTime < now) {
        logger.info(`Maintenance window expired: ${window.id}`);
        return false;
      }
      return true;
    });
  }

  resetRateLimitingCounters() {
    for (const channel of this.notificationChannels.values()) {
      channel.usageCount.hour = 0;
    }
  }

  // Public API
  getNotificationChannels() {
    return Array.from(this.notificationChannels.values()).map(channel => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      enabled: channel.enabled,
      severityFilter: channel.severityFilter,
      usageCount: channel.usageCount,
      errors: channel.errors.slice(-5) // Last 5 errors
    }));
  }

  getEscalationRules() {
    return Array.from(this.escalationRules.values()).map(rule => ({
      id: rule.id,
      trigger: rule.trigger,
      steps: rule.steps,
      enabled: rule.enabled,
      activeEscalations: rule.activeEscalations.size
    }));
  }

  getActiveAlerts() {
    return this.alertHistory.filter(alert => !alert.resolved);
  }

  getAcknowledgedAlerts() {
    return Array.from(this.acknowledgments.entries()).map(([alertId, ack]) => ({
      alertId,
      ...ack
    }));
  }

  getMaintenanceWindows() {
    return this.maintenanceWindows.filter(window => window.active);
  }
}

module.exports = new AlertingService();