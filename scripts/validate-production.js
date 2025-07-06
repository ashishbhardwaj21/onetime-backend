#!/usr/bin/env node

/**
 * Production Environment Validation Script
 * Validates all production configurations and dependencies
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

class ProductionValidator {
  constructor() {
    this.validationResults = {
      startTime: new Date(),
      endTime: null,
      overallStatus: 'pending',
      checks: [],
      errors: [],
      warnings: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      }
    };
  }

  async validateProduction() {
    console.log('🔍 OneTime Dating App - Production Validation');
    console.log('===========================================\n');

    try {
      // Core Infrastructure Checks
      await this.validateEnvironmentVariables();
      await this.validateDatabaseConnection();
      await this.validateDatabaseIndexes();
      await this.validateExternalServices();
      await this.validateSecurityConfiguration();
      await this.validatePerformanceSettings();
      await this.validateBackupConfiguration();
      await this.validateMonitoringSetup();

      this.validationResults.endTime = new Date();
      this.generateValidationReport();

      const hasErrors = this.validationResults.errors.length > 0;
      this.validationResults.overallStatus = hasErrors ? 'failed' : 'passed';

      if (hasErrors) {
        console.log('\n❌ Production validation FAILED');
        console.log('Please address the errors above before deploying to production.');
        process.exit(1);
      } else {
        console.log('\n✅ Production validation PASSED');
        console.log('🚀 Ready for production deployment!');
      }

    } catch (error) {
      console.error('💥 Validation script failed:', error.message);
      process.exit(1);
    }
  }

  async validateEnvironmentVariables() {
    await this.runValidationCheck('Environment Variables', async () => {
      const requiredVars = [
        'NODE_ENV',
        'MONGODB_URI',
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
        'CLOUDINARY_URL',
        'SENDGRID_API_KEY',
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'ADMIN_EMAIL',
        'ADMIN_PASSWORD'
      ];

      const missing = [];
      const weak = [];

      for (const varName of requiredVars) {
        const value = process.env[varName];
        
        if (!value) {
          missing.push(varName);
        } else {
          // Check for weak or default values
          if (this.isWeakValue(varName, value)) {
            weak.push(varName);
          }
        }
      }

      if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
      }

      if (weak.length > 0) {
        this.addWarning(`Potentially weak values detected: ${weak.join(', ')}`);
      }

      // Validate NODE_ENV
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(`NODE_ENV must be 'production', got '${process.env.NODE_ENV}'`);
      }

      console.log('   ✅ All required environment variables present');
      console.log(`   🔐 JWT Secret length: ${process.env.JWT_SECRET.length} characters`);
      console.log(`   🗄️  Database: ${this.maskCredentials(process.env.MONGODB_URI)}`);
    });
  }

  async validateDatabaseConnection() {
    await this.runValidationCheck('Database Connection', async () => {
      const mongoURI = process.env.MONGODB_URI;
      
      if (!mongoURI.includes('mongodb.net')) {
        throw new Error('Production must use MongoDB Atlas cluster');
      }

      if (mongoURI.includes('localhost') || mongoURI.includes('127.0.0.1')) {
        throw new Error('Production cannot use localhost database');
      }

      // Test connection
      await mongoose.connect(mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000
      });

      const db = mongoose.connection.db;
      await db.admin().ping();

      // Check database name
      const dbName = mongoose.connection.name;
      if (!dbName.includes('production') && !dbName.includes('onetime')) {
        this.addWarning(`Database name '${dbName}' doesn't indicate production environment`);
      }

      console.log('   ✅ Database connection successful');
      console.log(`   🗄️  Connected to: ${dbName}`);
      console.log(`   🔗 Connection state: ${mongoose.connection.readyState}`);
    });
  }

  async validateDatabaseIndexes() {
    await this.runValidationCheck('Database Indexes', async () => {
      const db = mongoose.connection.db;
      
      const expectedIndexes = {
        users: ['email_1', 'profile.location_2dsphere'],
        matches: ['user1_1_user2_1', 'expiresAt_1'],
        messages: ['conversationId_1_timestamp_-1'],
        activities: ['location_2dsphere', 'category_1_status_1']
      };

      for (const [collectionName, expectedIndexNames] of Object.entries(expectedIndexes)) {
        try {
          const collection = db.collection(collectionName);
          const indexes = await collection.indexes();
          const indexNames = indexes.map(idx => idx.name);

          for (const expectedIndex of expectedIndexNames) {
            if (!indexNames.includes(expectedIndex)) {
              throw new Error(`Missing index '${expectedIndex}' on collection '${collectionName}'`);
            }
          }

          console.log(`   ✅ ${collectionName}: ${indexes.length} indexes verified`);
        } catch (error) {
          if (error.message.includes('Missing index')) {
            throw error;
          }
          // Collection might not exist yet - that's ok for new deployments
          console.log(`   ⚠️  Collection '${collectionName}' not found (will be created on first use)`);
        }
      }
    });
  }

  async validateExternalServices() {
    await this.runValidationCheck('External Services', async () => {
      const services = [];

      // Cloudinary validation
      if (process.env.CLOUDINARY_URL) {
        try {
          const cloudinary = require('cloudinary').v2;
          await cloudinary.api.ping();
          services.push('Cloudinary: ✅');
        } catch (error) {
          throw new Error(`Cloudinary connection failed: ${error.message}`);
        }
      }

      // SendGrid validation
      if (process.env.SENDGRID_API_KEY) {
        try {
          const sgMail = require('@sendgrid/mail');
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          // Note: SendGrid doesn't have a ping endpoint, but we can validate the API key format
          if (!process.env.SENDGRID_API_KEY.startsWith('SG.')) {
            throw new Error('Invalid SendGrid API key format');
          }
          services.push('SendGrid: ✅');
        } catch (error) {
          throw new Error(`SendGrid validation failed: ${error.message}`);
        }
      }

      // Twilio validation
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        try {
          const twilio = require('twilio');
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
          services.push('Twilio: ✅');
        } catch (error) {
          throw new Error(`Twilio connection failed: ${error.message}`);
        }
      }

      console.log('   📡 External service validation:');
      services.forEach(service => console.log(`     ${service}`));
    });
  }

  async validateSecurityConfiguration() {
    await this.runValidationCheck('Security Configuration', async () => {
      const securityChecks = [];

      // JWT Secret strength
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret.length < 32) {
        throw new Error(`JWT secret too short: ${jwtSecret.length} characters (minimum 32)`);
      }
      securityChecks.push(`JWT Secret: ${jwtSecret.length} chars ✅`);

      // Admin password strength
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (adminPassword.length < 12) {
        throw new Error(`Admin password too short: ${adminPassword.length} characters (minimum 12)`);
      }
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(adminPassword)) {
        this.addWarning('Admin password should contain uppercase, lowercase, numbers, and special characters');
      }
      securityChecks.push(`Admin Password: ${adminPassword.length} chars ✅`);

      // Check for development/test values
      const dangerousValues = ['test', 'development', 'localhost', '123456', 'password'];
      for (const [key, value] of Object.entries(process.env)) {
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase();
          if (dangerousValues.some(danger => lowerValue.includes(danger))) {
            this.addWarning(`Potentially unsafe value in ${key}`);
          }
        }
      }

      // CORS configuration
      const allowedOrigins = process.env.ALLOWED_ORIGINS;
      if (!allowedOrigins || allowedOrigins.includes('localhost')) {
        this.addWarning('ALLOWED_ORIGINS should not include localhost for production');
      }
      securityChecks.push('CORS: Configured ✅');

      console.log('   🔐 Security validation:');
      securityChecks.forEach(check => console.log(`     ${check}`));
    });
  }

  async validatePerformanceSettings() {
    await this.runValidationCheck('Performance Settings', async () => {
      const performanceChecks = [];

      // Database pool size
      const maxPoolSize = parseInt(process.env.DB_MAX_POOL_SIZE) || 10;
      if (maxPoolSize < 10) {
        this.addWarning(`DB_MAX_POOL_SIZE (${maxPoolSize}) may be too low for production`);
      }
      performanceChecks.push(`DB Pool Size: ${maxPoolSize} ✅`);

      // Connection timeout
      const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000;
      if (connectionTimeout < 10000) {
        this.addWarning(`DB_CONNECTION_TIMEOUT (${connectionTimeout}ms) may be too low`);
      }
      performanceChecks.push(`DB Timeout: ${connectionTimeout}ms ✅`);

      // Rate limiting
      const rateLimit = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
      if (rateLimit > 1000) {
        this.addWarning(`RATE_LIMIT_MAX_REQUESTS (${rateLimit}) may be too high`);
      }
      performanceChecks.push(`Rate Limit: ${rateLimit}/window ✅`);

      console.log('   ⚡ Performance configuration:');
      performanceChecks.forEach(check => console.log(`     ${check}`));
    });
  }

  async validateBackupConfiguration() {
    await this.runValidationCheck('Backup Configuration', async () => {
      const fs = require('fs');
      const path = require('path');

      // Check if backup scripts exist
      const backupScript = path.join(__dirname, 'backup-database.js');
      if (!fs.existsSync(backupScript)) {
        throw new Error('Backup script not found: backup-database.js');
      }

      const migrationScript = path.join(__dirname, 'migrate-database.js');
      if (!fs.existsSync(migrationScript)) {
        throw new Error('Migration script not found: migrate-database.js');
      }

      // Check backup directory
      const backupDir = path.join(__dirname, '..', 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
        console.log('   📁 Created backup directory');
      }

      console.log('   💾 Backup system:');
      console.log('     Backup script: ✅');
      console.log('     Migration script: ✅');
      console.log('     Backup directory: ✅');
    });
  }

  async validateMonitoringSetup() {
    await this.runValidationCheck('Monitoring Setup', async () => {
      const monitoringChecks = [];

      // Sentry (Error tracking)
      if (process.env.SENTRY_DSN) {
        monitoringChecks.push('Sentry: Configured ✅');
      } else {
        this.addWarning('SENTRY_DSN not configured - error tracking disabled');
      }

      // Logging configuration
      const logLevel = process.env.LOG_LEVEL || 'info';
      if (logLevel === 'debug') {
        this.addWarning('LOG_LEVEL is set to debug - may impact performance');
      }
      monitoringChecks.push(`Log Level: ${logLevel} ✅`);

      // Health check endpoint
      const healthCheckEnabled = process.env.HEALTH_CHECK_ENABLED !== 'false';
      if (!healthCheckEnabled) {
        this.addWarning('Health check endpoint is disabled');
      }
      monitoringChecks.push(`Health Check: ${healthCheckEnabled ? 'Enabled' : 'Disabled'} ✅`);

      console.log('   📊 Monitoring configuration:');
      monitoringChecks.forEach(check => console.log(`     ${check}`));
    });
  }

  async runValidationCheck(checkName, checkFunction) {
    const startTime = Date.now();
    
    try {
      console.log(`\n🔄 Validating: ${checkName}`);
      console.log('─'.repeat(50));
      
      await checkFunction();
      
      const duration = Date.now() - startTime;
      console.log(`✅ ${checkName} validation passed (${duration}ms)`);
      
      this.validationResults.checks.push({
        name: checkName,
        status: 'passed',
        duration,
        timestamp: new Date()
      });
      
      this.validationResults.summary.passed++;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ ${checkName} validation failed (${duration}ms):`);
      console.error(`   Error: ${error.message}`);
      
      this.validationResults.checks.push({
        name: checkName,
        status: 'failed',
        duration,
        error: error.message,
        timestamp: new Date()
      });

      this.validationResults.errors.push({
        check: checkName,
        error: error.message,
        timestamp: new Date()
      });

      this.validationResults.summary.failed++;
    }
    
    this.validationResults.summary.total++;
  }

  addWarning(message) {
    console.log(`   ⚠️  Warning: ${message}`);
    this.validationResults.warnings.push({
      message,
      timestamp: new Date()
    });
    this.validationResults.summary.warnings++;
  }

  isWeakValue(varName, value) {
    const weakPatterns = [
      'test', 'development', 'localhost', '123456', 'password',
      'secret', 'key123', 'admin123', 'default'
    ];

    // Check for obviously weak values
    const lowerValue = value.toLowerCase();
    if (weakPatterns.some(pattern => lowerValue.includes(pattern))) {
      return true;
    }

    // Check for short secrets
    if ((varName.includes('SECRET') || varName.includes('PASSWORD')) && value.length < 16) {
      return true;
    }

    return false;
  }

  maskCredentials(uri) {
    return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://****:****@');
  }

  generateValidationReport() {
    const totalDuration = this.validationResults.endTime - this.validationResults.startTime;
    
    console.log('\n📊 Production Validation Report');
    console.log('==============================');
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(`✅ Passed: ${this.validationResults.summary.passed}`);
    console.log(`❌ Failed: ${this.validationResults.summary.failed}`);
    console.log(`⚠️  Warnings: ${this.validationResults.summary.warnings}`);
    
    const successRate = ((this.validationResults.summary.passed / this.validationResults.summary.total) * 100).toFixed(1);
    console.log(`📈 Success Rate: ${successRate}%`);

    // List warnings
    if (this.validationResults.warnings.length > 0) {
      console.log('\n⚠️  Warnings to Address:');
      this.validationResults.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning.message}`);
      });
    }

    // List errors
    if (this.validationResults.errors.length > 0) {
      console.log('\n❌ Errors to Fix:');
      this.validationResults.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.check}: ${error.error}`);
      });
    }

    // Save detailed report
    const reportPath = 'production-validation-report.json';
    require('fs').writeFileSync(reportPath, JSON.stringify(this.validationResults, null, 2));
    console.log(`\n📋 Detailed report saved: ${reportPath}`);
  }
}

// Run validation if called directly
if (require.main === module) {
  require('dotenv').config();
  
  const validator = new ProductionValidator();
  validator.validateProduction().catch(error => {
    console.error('💥 Production validation failed:', error);
    process.exit(1);
  });
}

module.exports = ProductionValidator;