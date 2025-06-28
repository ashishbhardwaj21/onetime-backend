#!/usr/bin/env node

/**
 * Production Monitoring and Health Check System
 * Continuously monitors the production API and sends alerts
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ProductionMonitor {
  constructor() {
    this.apiUrl = process.env.API_BASE_URL || 'https://onetime-backend.onrender.com';
    this.checkInterval = 5 * 60 * 1000; // 5 minutes
    this.alertThreshold = 3; // Alert after 3 consecutive failures
    this.consecutiveFailures = 0;
    this.lastAlertTime = 0;
    this.alertCooldown = 30 * 60 * 1000; // 30 minutes between alerts
    this.logFile = path.join(__dirname, 'logs', 'production-monitor.log');
  }

  async startMonitoring() {
    console.log('🔍 Starting OneTime Production Monitoring...');
    console.log(`📡 Monitoring API: ${this.apiUrl}`);
    console.log(`⏱️ Check interval: ${this.checkInterval / 1000}s`);
    console.log(`🚨 Alert threshold: ${this.alertThreshold} failures`);
    console.log('=====================================\n');

    // Initial check
    await this.performHealthCheck();

    // Start periodic monitoring
    setInterval(async () => {
      await this.performHealthCheck();
    }, this.checkInterval);
  }

  async performHealthCheck() {
    const timestamp = new Date().toISOString();
    
    try {
      // Health endpoint check
      const healthResponse = await axios.get(`${this.apiUrl}/health`, {
        timeout: 10000,
        headers: { 'User-Agent': 'OneTime-Monitor/1.0' }
      });

      // API endpoints check
      const apiChecks = await Promise.allSettled([
        axios.get(`${this.apiUrl}/api/auth/register`, { timeout: 5000 }),
        axios.get(`${this.apiUrl}/api/discovery`, { timeout: 5000 }),
        axios.get(`${this.apiUrl}/api/activities/suggestions`, { timeout: 5000 })
      ]);

      const status = {
        timestamp,
        health: healthResponse.status === 200,
        responseTime: healthResponse.headers['x-response-time'] || 'N/A',
        database: healthResponse.data?.database === 'connected',
        apiEndpoints: apiChecks.map(result => result.status === 'fulfilled'),
        status: 'HEALTHY'
      };

      this.consecutiveFailures = 0;
      this.logStatus(status);
      console.log(`✅ ${timestamp} - API Health: OK (Response: ${status.responseTime})`);

    } catch (error) {
      this.consecutiveFailures++;
      
      const status = {
        timestamp,
        health: false,
        error: error.message,
        status: 'UNHEALTHY',
        consecutiveFailures: this.consecutiveFailures
      };

      this.logStatus(status);
      console.log(`❌ ${timestamp} - API Health: FAILED (${error.message})`);

      // Send alert if threshold reached
      if (this.consecutiveFailures >= this.alertThreshold) {
        await this.sendAlert(status);
      }
    }
  }

  async sendAlert(status) {
    const now = Date.now();
    
    // Check cooldown period
    if (now - this.lastAlertTime < this.alertCooldown) {
      return;
    }

    console.log('🚨 ALERT: API is down! Sending notification...');
    
    // Here you would integrate with your alerting service
    // Examples: email, Slack, Discord, PagerDuty, etc.
    
    const alertMessage = {
      title: '🚨 OneTime API Down',
      message: `API has been down for ${this.consecutiveFailures} consecutive checks`,
      timestamp: status.timestamp,
      error: status.error,
      url: this.apiUrl
    };

    // Log the alert
    this.logAlert(alertMessage);
    
    // Example: Send to webhook (uncomment and configure)
    /*
    try {
      await axios.post('YOUR_WEBHOOK_URL', alertMessage);
      console.log('📧 Alert sent successfully');
    } catch (error) {
      console.log('❌ Failed to send alert:', error.message);
    }
    */

    this.lastAlertTime = now;
  }

  logStatus(status) {
    const logEntry = JSON.stringify(status) + '\n';
    
    try {
      // Ensure logs directory exists
      const logsDir = path.dirname(this.logFile);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      console.error('Failed to write log:', error.message);
    }
  }

  logAlert(alert) {
    const alertLogFile = path.join(__dirname, 'logs', 'alerts.log');
    const logEntry = JSON.stringify(alert) + '\n';
    
    try {
      fs.appendFileSync(alertLogFile, logEntry);
    } catch (error) {
      console.error('Failed to write alert log:', error.message);
    }
  }

  // Performance monitoring
  async performanceCheck() {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${this.apiUrl}/health`);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const performance = {
        timestamp: new Date().toISOString(),
        responseTime,
        status: response.status,
        contentLength: response.headers['content-length'] || 0
      };

      console.log(`⚡ Performance: ${responseTime}ms`);
      return performance;
      
    } catch (error) {
      console.log(`❌ Performance check failed: ${error.message}`);
      return null;
    }
  }
}

// Create webhook notification function
async function sendWebhookAlert(webhook_url, message) {
  try {
    await axios.post(webhook_url, {
      text: message.title,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${message.title}*\n${message.message}\n*Time:* ${message.timestamp}\n*Error:* ${message.error}`
          }
        }
      ]
    });
    return true;
  } catch (error) {
    console.error('Webhook failed:', error.message);
    return false;
  }
}

// Generate monitoring report
function generateMonitoringReport() {
  const monitor = new ProductionMonitor();
  const logFile = monitor.logFile;
  
  if (!fs.existsSync(logFile)) {
    console.log('No monitoring data available');
    return;
  }

  const logs = fs.readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  const last24h = logs.filter(log => {
    const logTime = new Date(log.timestamp);
    const now = new Date();
    return (now - logTime) <= 24 * 60 * 60 * 1000;
  });

  const healthyChecks = last24h.filter(log => log.health).length;
  const totalChecks = last24h.length;
  const uptime = totalChecks > 0 ? (healthyChecks / totalChecks * 100).toFixed(2) : 0;

  console.log('\n📊 24-Hour Monitoring Report');
  console.log('============================');
  console.log(`Uptime: ${uptime}%`);
  console.log(`Total Checks: ${totalChecks}`);
  console.log(`Healthy: ${healthyChecks}`);
  console.log(`Failed: ${totalChecks - healthyChecks}`);
  console.log(`Last Check: ${last24h[last24h.length - 1]?.timestamp || 'N/A'}`);
}

// Run monitor if script is executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'report') {
    generateMonitoringReport();
  } else {
    const monitor = new ProductionMonitor();
    monitor.startMonitoring().catch(error => {
      console.error('Monitor failed to start:', error);
      process.exit(1);
    });
  }
}

module.exports = { ProductionMonitor, sendWebhookAlert, generateMonitoringReport };