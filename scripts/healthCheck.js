#!/usr/bin/env node

/**
 * Health Check Script for OneTime Backend
 * 
 * This script performs comprehensive health checks on the application
 * including database connectivity, external services, and system resources.
 */

const http = require('http');
const mongoose = require('mongoose');
const database = require('../utils/database');
require('dotenv').config();

class HealthChecker {
  constructor() {
    this.checks = [];
    this.results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {},
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
  }

  async runAllChecks() {
    console.log('🏥 Starting health checks...\n');

    try {
      // Core service checks
      await this.checkDatabase();
      await this.checkServer();
      await this.checkMemory();
      await this.checkDisk();
      
      // External service checks (optional)
      if (process.env.REDIS_URL) {
        await this.checkRedis();
      }
      
      if (process.env.SMTP_HOST) {
        await this.checkEmail();
      }

      // Determine overall health
      this.determineOverallHealth();
      
      // Output results
      this.outputResults();
      
      // Exit with appropriate code
      process.exit(this.results.status === 'healthy' ? 0 : 1);
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      this.results.status = 'unhealthy';
      this.results.error = error.message;
      this.outputResults();
      process.exit(1);
    }
  }

  async checkDatabase() {
    const checkName = 'database';
    console.log('📊 Checking database connectivity...');
    
    try {
      // Test basic connectivity
      if (!mongoose.connection.readyState) {
        await database.connect();
      }
      
      // Get database health
      const healthResult = await database.healthCheck();
      
      if (healthResult.status === 'healthy') {
        this.results.checks[checkName] = {
          status: 'healthy',
          message: 'Database connection is healthy',
          responseTime: Date.now(),
          details: healthResult.details
        };
        console.log('✅ Database: Healthy');
      } else {
        throw new Error(healthResult.message);
      }
      
    } catch (error) {
      this.results.checks[checkName] = {
        status: 'unhealthy',
        message: error.message,
        error: error.name
      };
      console.log('❌ Database: Unhealthy -', error.message);
    }
  }

  async checkServer() {
    const checkName = 'server';
    console.log('🌐 Checking server health...');
    
    try {
      const port = process.env.PORT || 3000;
      const hostname = process.env.HOST || 'localhost';
      
      const startTime = Date.now();
      
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname,
          port,
          path: '/health',
          method: 'GET',
          timeout: 5000
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve(JSON.parse(data));
            } else {
              reject(new Error(`Server returned status ${res.statusCode}`));
            }
          });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Server health check timeout'));
        });
        
        req.end();
      });
      
      const responseTime = Date.now() - startTime;
      
      this.results.checks[checkName] = {
        status: 'healthy',
        message: 'Server is responding',
        responseTime: `${responseTime}ms`,
        endpoint: `http://${hostname}:${port}/health`
      };
      console.log(`✅ Server: Healthy (${responseTime}ms)`);
      
    } catch (error) {
      this.results.checks[checkName] = {
        status: 'unhealthy',
        message: error.message,
        error: 'Server not responding'
      };
      console.log('❌ Server: Unhealthy -', error.message);
    }
  }

  async checkMemory() {
    const checkName = 'memory';
    console.log('💾 Checking memory usage...');
    
    try {
      const memUsage = process.memoryUsage();
      const totalMem = require('os').totalmem();
      const freeMem = require('os').freemem();
      
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const memoryUsagePercent = Math.round((memUsage.rss / totalMem) * 100);
      
      const isHealthy = memoryUsagePercent < 90; // Alert if using more than 90% of available memory
      
      this.results.checks[checkName] = {
        status: isHealthy ? 'healthy' : 'warning',
        message: `Memory usage: ${memoryUsagePercent}%`,
        details: {
          heapUsed: `${heapUsedMB}MB`,
          heapTotal: `${heapTotalMB}MB`,
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
          systemTotal: `${Math.round(totalMem / 1024 / 1024)}MB`,
          systemFree: `${Math.round(freeMem / 1024 / 1024)}MB`,
          usagePercent: `${memoryUsagePercent}%`
        }
      };
      
      console.log(`${isHealthy ? '✅' : '⚠️'} Memory: ${memoryUsagePercent}% (${heapUsedMB}MB heap)`);
      
    } catch (error) {
      this.results.checks[checkName] = {
        status: 'unhealthy',
        message: error.message,
        error: 'Memory check failed'
      };
      console.log('❌ Memory: Check failed -', error.message);
    }
  }

  async checkDisk() {
    const checkName = 'disk';
    console.log('💿 Checking disk space...');
    
    try {
      const fs = require('fs');
      const stats = fs.statSync(process.cwd());
      
      // Simple disk check (more sophisticated check would require additional modules)
      this.results.checks[checkName] = {
        status: 'healthy',
        message: 'Disk access is working',
        details: {
          currentDirectory: process.cwd(),
          accessible: true
        }
      };
      
      console.log('✅ Disk: Accessible');
      
    } catch (error) {
      this.results.checks[checkName] = {
        status: 'unhealthy',
        message: error.message,
        error: 'Disk access failed'
      };
      console.log('❌ Disk: Inaccessible -', error.message);
    }
  }

  async checkRedis() {
    const checkName = 'redis';
    console.log('🔴 Checking Redis connectivity...');
    
    try {
      // This would require redis client to be properly implemented
      this.results.checks[checkName] = {
        status: 'skipped',
        message: 'Redis check not implemented',
        note: 'Add Redis client implementation for full check'
      };
      console.log('⏭️ Redis: Skipped (not implemented)');
      
    } catch (error) {
      this.results.checks[checkName] = {
        status: 'unhealthy',
        message: error.message,
        error: 'Redis connection failed'
      };
      console.log('❌ Redis: Unhealthy -', error.message);
    }
  }

  async checkEmail() {
    const checkName = 'email';
    console.log('📧 Checking email service...');
    
    try {
      // Basic SMTP configuration check
      const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        throw new Error(`Missing email configuration: ${missingVars.join(', ')}`);
      }
      
      this.results.checks[checkName] = {
        status: 'healthy',
        message: 'Email configuration is present',
        details: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          configured: true
        }
      };
      console.log('✅ Email: Configuration valid');
      
    } catch (error) {
      this.results.checks[checkName] = {
        status: 'warning',
        message: error.message,
        error: 'Email configuration issue'
      };
      console.log('⚠️ Email: Configuration issue -', error.message);
    }
  }

  determineOverallHealth() {
    const checks = Object.values(this.results.checks);
    const unhealthyChecks = checks.filter(check => check.status === 'unhealthy');
    const warningChecks = checks.filter(check => check.status === 'warning');
    
    if (unhealthyChecks.length > 0) {
      this.results.status = 'unhealthy';
      this.results.summary = `${unhealthyChecks.length} critical issues found`;
    } else if (warningChecks.length > 0) {
      this.results.status = 'warning';
      this.results.summary = `${warningChecks.length} warnings found`;
    } else {
      this.results.status = 'healthy';
      this.results.summary = 'All systems operational';
    }
  }

  outputResults() {
    console.log('\n' + '='.repeat(50));
    console.log('🏥 HEALTH CHECK RESULTS');
    console.log('='.repeat(50));
    
    console.log(`Status: ${this.getStatusEmoji()} ${this.results.status.toUpperCase()}`);
    console.log(`Summary: ${this.results.summary}`);
    console.log(`Environment: ${this.results.environment}`);
    console.log(`Uptime: ${Math.round(this.results.uptime)}s`);
    console.log(`Timestamp: ${this.results.timestamp}`);
    
    console.log('\nDetailed Results:');
    for (const [checkName, result] of Object.entries(this.results.checks)) {
      const emoji = this.getStatusEmoji(result.status);
      console.log(`  ${emoji} ${checkName}: ${result.message}`);
      
      if (result.details) {
        Object.entries(result.details).forEach(([key, value]) => {
          console.log(`    ${key}: ${value}`);
        });
      }
    }
    
    console.log('\n' + '='.repeat(50));
    
    // Output JSON for programmatic usage
    if (process.env.HEALTH_CHECK_JSON) {
      console.log('\nJSON Output:');
      console.log(JSON.stringify(this.results, null, 2));
    }
  }

  getStatusEmoji(status = this.results.status) {
    switch (status) {
      case 'healthy': return '✅';
      case 'warning': return '⚠️';
      case 'unhealthy': return '❌';
      case 'skipped': return '⏭️';
      default: return '❓';
    }
  }
}

// Run health check if this script is executed directly
if (require.main === module) {
  const healthChecker = new HealthChecker();
  healthChecker.runAllChecks().catch(console.error);
}

module.exports = HealthChecker;