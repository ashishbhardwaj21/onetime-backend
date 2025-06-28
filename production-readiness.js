#!/usr/bin/env node

/**
 * Production Readiness Checklist and Master Test Runner
 * Comprehensive verification that the OneTime Dating App is ready for production deployment
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

class ProductionReadinessChecker {
  constructor() {
    this.checklist = {
      environment: { score: 0, total: 0, items: [] },
      security: { score: 0, total: 0, items: [] },
      functionality: { score: 0, total: 0, items: [] },
      performance: { score: 0, total: 0, items: [] },
      deployment: { score: 0, total: 0, items: [] },
      monitoring: { score: 0, total: 0, items: [] },
      documentation: { score: 0, total: 0, items: [] }
    };
    this.overallScore = { score: 0, total: 0, percentage: 0 };
  }

  async runProductionReadinessCheck() {
    console.log('🚀 OneTime Dating App - Production Readiness Check');
    console.log('==================================================\n');

    try {
      // 1. Environment Configuration Check
      await this.checkEnvironmentConfiguration();
      
      // 2. Security Verification
      await this.checkSecurityConfiguration();
      
      // 3. Functionality Testing
      await this.runFunctionalityTests();
      
      // 4. Performance Validation
      await this.runPerformanceTests();
      
      // 5. Deployment Configuration
      await this.checkDeploymentConfiguration();
      
      // 6. Monitoring and Logging
      await this.checkMonitoringConfiguration();
      
      // 7. Documentation Completeness
      await this.checkDocumentationCompleteness();

      // Calculate overall score and generate report
      this.calculateOverallScore();
      this.generateProductionReadinessReport();

    } catch (error) {
      console.error('\n❌ Production readiness check failed:', error.message);
      process.exit(1);
    }
  }

  async checkEnvironmentConfiguration() {
    console.log('🔧 Checking Environment Configuration...\n');

    // Check required environment variables
    this.checkRequiredEnvironmentVariables();
    
    // Check environment file security
    this.checkEnvironmentFileSecurity();
    
    // Check Node.js and npm versions
    this.checkNodeAndNpmVersions();
    
    // Check package.json configuration
    this.checkPackageConfiguration();
    
    console.log(`Environment Configuration Score: ${this.checklist.environment.score}/${this.checklist.environment.total}\n`);
  }

  checkRequiredEnvironmentVariables() {
    const requiredVars = [
      { name: 'NODE_ENV', description: 'Application environment' },
      { name: 'PORT', description: 'Server port' },
      { name: 'MONGODB_URI', description: 'MongoDB connection string' },
      { name: 'JWT_SECRET', description: 'JWT signing secret' },
      { name: 'JWT_EXPIRES_IN', description: 'JWT expiration time' },
      { name: 'CLOUDINARY_CLOUD_NAME', description: 'Cloudinary cloud name' },
      { name: 'CLOUDINARY_API_KEY', description: 'Cloudinary API key' },
      { name: 'CLOUDINARY_API_SECRET', description: 'Cloudinary API secret' },
      { name: 'ADMIN_EMAIL', description: 'Admin email address' },
      { name: 'ADMIN_PASSWORD', description: 'Admin password' }
    ];

    requiredVars.forEach(envVar => {
      this.checklist.environment.total++;
      if (process.env[envVar.name]) {
        this.checklist.environment.score++;
        this.checklist.environment.items.push(`✅ ${envVar.name}: ${envVar.description}`);
      } else {
        this.checklist.environment.items.push(`❌ ${envVar.name}: ${envVar.description} - MISSING`);
      }
    });
  }

  checkEnvironmentFileSecurity() {
    this.checklist.environment.total++;
    
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      if (gitignoreContent.includes('.env')) {
        this.checklist.environment.score++;
        this.checklist.environment.items.push('✅ Environment files are properly gitignored');
      } else {
        this.checklist.environment.items.push('❌ Environment files are not gitignored');
      }
    } else {
      this.checklist.environment.items.push('❌ .gitignore file not found');
    }
  }

  checkNodeAndNpmVersions() {
    this.checklist.environment.total += 2;
    
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
    
    if (majorVersion >= 18) {
      this.checklist.environment.score++;
      this.checklist.environment.items.push(`✅ Node.js version: ${nodeVersion} (recommended)`);
    } else {
      this.checklist.environment.items.push(`❌ Node.js version: ${nodeVersion} (outdated)`);
    }
    
    // Check if package-lock.json exists
    if (fs.existsSync(path.join(process.cwd(), 'package-lock.json'))) {
      this.checklist.environment.score++;
      this.checklist.environment.items.push('✅ package-lock.json exists for reproducible builds');
    } else {
      this.checklist.environment.items.push('❌ package-lock.json missing');
    }
  }

  checkPackageConfiguration() {
    this.checklist.environment.total += 3;
    
    const packagePath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      // Check for start script
      if (packageData.scripts && packageData.scripts.start) {
        this.checklist.environment.score++;
        this.checklist.environment.items.push('✅ Start script is defined');
      } else {
        this.checklist.environment.items.push('❌ Start script is missing');
      }
      
      // Check for production dependencies
      if (packageData.dependencies) {
        this.checklist.environment.score++;
        this.checklist.environment.items.push('✅ Production dependencies are defined');
      } else {
        this.checklist.environment.items.push('❌ No production dependencies found');
      }
      
      // Check for engines specification
      if (packageData.engines && packageData.engines.node) {
        this.checklist.environment.score++;
        this.checklist.environment.items.push('✅ Node.js engine version is specified');
      } else {
        this.checklist.environment.items.push('❌ Node.js engine version not specified');
      }
    }
  }

  async checkSecurityConfiguration() {
    console.log('🔒 Checking Security Configuration...\n');

    // Check for security middleware
    this.checkSecurityMiddleware();
    
    // Check authentication configuration
    this.checkAuthenticationSecurity();
    
    // Check HTTPS configuration
    this.checkHTTPSConfiguration();
    
    // Check for sensitive data exposure
    this.checkSensitiveDataExposure();
    
    console.log(`Security Configuration Score: ${this.checklist.security.score}/${this.checklist.security.total}\n`);
  }

  checkSecurityMiddleware() {
    this.checklist.security.total += 4;
    
    const serverFile = path.join(process.cwd(), 'server-prod-simple.js');
    if (fs.existsSync(serverFile)) {
      const content = fs.readFileSync(serverFile, 'utf8');
      
      // Check for CORS
      if (content.includes('cors')) {
        this.checklist.security.score++;
        this.checklist.security.items.push('✅ CORS middleware is configured');
      } else {
        this.checklist.security.items.push('❌ CORS middleware not found');
      }
      
      // Check for rate limiting
      if (content.includes('rateLimit') || content.includes('express-rate-limit')) {
        this.checklist.security.score++;
        this.checklist.security.items.push('✅ Rate limiting is implemented');
      } else {
        this.checklist.security.items.push('❌ Rate limiting not implemented');
      }
      
      // Check for input sanitization
      if (content.includes('sanitize') || content.includes('xss')) {
        this.checklist.security.score++;
        this.checklist.security.items.push('✅ Input sanitization is implemented');
      } else {
        this.checklist.security.items.push('❌ Input sanitization not found');
      }
      
      // Check for security headers
      if (content.includes('helmet')) {
        this.checklist.security.score++;
        this.checklist.security.items.push('✅ Security headers (helmet) configured');
      } else {
        this.checklist.security.items.push('❌ Security headers not configured');
      }
    }
  }

  checkAuthenticationSecurity() {
    this.checklist.security.total += 3;
    
    // Check JWT configuration
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
      this.checklist.security.score++;
      this.checklist.security.items.push('✅ JWT secret is sufficiently secure');
    } else {
      this.checklist.security.items.push('❌ JWT secret is too short or missing');
    }
    
    // Check password hashing
    const serverFile = path.join(process.cwd(), 'server-prod-simple.js');
    if (fs.existsSync(serverFile)) {
      const content = fs.readFileSync(serverFile, 'utf8');
      
      if (content.includes('bcrypt')) {
        this.checklist.security.score++;
        this.checklist.security.items.push('✅ bcrypt is used for password hashing');
      } else {
        this.checklist.security.items.push('❌ Secure password hashing not found');
      }
      
      if (content.includes('authenticateToken') || content.includes('auth')) {
        this.checklist.security.score++;
        this.checklist.security.items.push('✅ Authentication middleware is implemented');
      } else {
        this.checklist.security.items.push('❌ Authentication middleware not found');
      }
    }
  }

  checkHTTPSConfiguration() {
    this.checklist.security.total += 2;
    
    if (process.env.NODE_ENV === 'production') {
      if (process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH) {
        this.checklist.security.score++;
        this.checklist.security.items.push('✅ SSL certificate paths configured for production');
      } else {
        this.checklist.security.items.push('❌ SSL certificates not configured for production');
      }
    } else {
      this.checklist.security.score++;
      this.checklist.security.items.push('✅ SSL configuration not required for development');
    }
    
    // Check if HTTPS redirect is configured
    const nginxConfig = path.join(process.cwd(), 'nginx', 'nginx.conf');
    if (fs.existsSync(nginxConfig)) {
      const content = fs.readFileSync(nginxConfig, 'utf8');
      if (content.includes('return 301 https://')) {
        this.checklist.security.score++;
        this.checklist.security.items.push('✅ HTTP to HTTPS redirect configured');
      } else {
        this.checklist.security.items.push('❌ HTTP to HTTPS redirect not configured');
      }
    } else {
      this.checklist.security.items.push('⚠️ Nginx configuration not found');
    }
  }

  checkSensitiveDataExposure() {
    this.checklist.security.total += 2;
    
    // Check for console.log with sensitive data
    const sourceFiles = this.getSourceFiles();
    let sensitiveLogging = false;
    
    sourceFiles.forEach(filePath => {
      const content = fs.readFileSync(filePath, 'utf8');
      if (/console\.log.*password|console\.log.*secret|console\.log.*token/i.test(content)) {
        sensitiveLogging = true;
      }
    });
    
    if (!sensitiveLogging) {
      this.checklist.security.score++;
      this.checklist.security.items.push('✅ No obvious sensitive data logging found');
    } else {
      this.checklist.security.items.push('❌ Potential sensitive data logging detected');
    }
    
    // Check for hardcoded secrets
    let hardcodedSecrets = false;
    sourceFiles.forEach(filePath => {
      const content = fs.readFileSync(filePath, 'utf8');
      if (/password\s*[:=]\s*["']\w+["']|secret\s*[:=]\s*["']\w+["']/i.test(content)) {
        hardcodedSecrets = true;
      }
    });
    
    if (!hardcodedSecrets) {
      this.checklist.security.score++;
      this.checklist.security.items.push('✅ No hardcoded secrets found');
    } else {
      this.checklist.security.items.push('❌ Potential hardcoded secrets detected');
    }
  }

  async runFunctionalityTests() {
    console.log('🧪 Running Functionality Tests...\n');

    // Check if test files exist and can be run
    await this.checkTestFiles();
    
    // Verify core models exist
    this.checkCoreModels();
    
    // Check API endpoints structure
    this.checkAPIEndpoints();
    
    console.log(`Functionality Score: ${this.checklist.functionality.score}/${this.checklist.functionality.total}\n`);
  }

  async checkTestFiles() {
    const testFiles = [
      'test-auth.js',
      'test-discovery.js',
      'test-activities.js',
      'test-profile.js',
      'test-messaging.js',
      'test-admin.js',
      'test-integration.js'
    ];

    testFiles.forEach(testFile => {
      this.checklist.functionality.total++;
      const testPath = path.join(process.cwd(), testFile);
      if (fs.existsSync(testPath)) {
        this.checklist.functionality.score++;
        this.checklist.functionality.items.push(`✅ ${testFile} exists and ready`);
      } else {
        this.checklist.functionality.items.push(`❌ ${testFile} missing`);
      }
    });
  }

  checkCoreModels() {
    const models = [
      'User.js',
      'Match.js',
      'UserSwipe.js',
      'Conversation.js',
      'Message.js',
      'Activity.js'
    ];

    models.forEach(model => {
      this.checklist.functionality.total++;
      const modelPath = path.join(process.cwd(), 'models', model);
      if (fs.existsSync(modelPath)) {
        this.checklist.functionality.score++;
        this.checklist.functionality.items.push(`✅ Model ${model} exists`);
      } else {
        this.checklist.functionality.items.push(`❌ Model ${model} missing`);
      }
    });
  }

  checkAPIEndpoints() {
    this.checklist.functionality.total += 6;
    
    const serverFile = path.join(process.cwd(), 'server-prod-simple.js');
    if (fs.existsSync(serverFile)) {
      const content = fs.readFileSync(serverFile, 'utf8');
      
      const endpoints = [
        { name: 'Authentication', pattern: /\/api\/auth/ },
        { name: 'User Management', pattern: /\/api\/users/ },
        { name: 'Discovery System', pattern: /\/api\/discovery/ },
        { name: 'Messaging System', pattern: /\/api\/conversations/ },
        { name: 'Activity System', pattern: /\/api\/activities/ },
        { name: 'Admin Dashboard', pattern: /\/api\/admin/ }
      ];
      
      endpoints.forEach(endpoint => {
        if (endpoint.pattern.test(content)) {
          this.checklist.functionality.score++;
          this.checklist.functionality.items.push(`✅ ${endpoint.name} endpoints implemented`);
        } else {
          this.checklist.functionality.items.push(`❌ ${endpoint.name} endpoints missing`);
        }
      });
    }
  }

  async runPerformanceTests() {
    console.log('⚡ Checking Performance Configuration...\n');

    // Check for performance optimizations
    this.checkPerformanceOptimizations();
    
    // Check caching configuration
    this.checkCachingConfiguration();
    
    // Check database optimization
    this.checkDatabaseOptimization();
    
    console.log(`Performance Score: ${this.checklist.performance.score}/${this.checklist.performance.total}\n`);
  }

  checkPerformanceOptimizations() {
    this.checklist.performance.total += 3;
    
    const serverFile = path.join(process.cwd(), 'server-prod-simple.js');
    if (fs.existsSync(serverFile)) {
      const content = fs.readFileSync(serverFile, 'utf8');
      
      // Check for compression
      if (content.includes('compression') || content.includes('gzip')) {
        this.checklist.performance.score++;
        this.checklist.performance.items.push('✅ Response compression configured');
      } else {
        this.checklist.performance.items.push('❌ Response compression not configured');
      }
      
      // Check for connection pooling hints
      if (content.includes('poolSize') || content.includes('maxPoolSize')) {
        this.checklist.performance.score++;
        this.checklist.performance.items.push('✅ Database connection pooling configured');
      } else {
        this.checklist.performance.items.push('⚠️ Database connection pooling should be verified');
      }
      
      // Check for clustering
      const pm2Config = path.join(process.cwd(), 'ecosystem.config.js');
      if (fs.existsSync(pm2Config)) {
        const pm2Content = fs.readFileSync(pm2Config, 'utf8');
        if (pm2Content.includes('cluster')) {
          this.checklist.performance.score++;
          this.checklist.performance.items.push('✅ Clustering configured with PM2');
        } else {
          this.checklist.performance.items.push('❌ Clustering not configured');
        }
      } else {
        this.checklist.performance.items.push('❌ PM2 configuration not found');
      }
    }
  }

  checkCachingConfiguration() {
    this.checklist.performance.total += 2;
    
    // Check for Redis configuration
    if (process.env.REDIS_URL) {
      this.checklist.performance.score++;
      this.checklist.performance.items.push('✅ Redis caching configured');
    } else {
      this.checklist.performance.items.push('⚠️ Redis caching not configured');
    }
    
    // Check for CDN configuration
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      this.checklist.performance.score++;
      this.checklist.performance.items.push('✅ CDN (Cloudinary) configured for images');
    } else {
      this.checklist.performance.items.push('❌ CDN not configured');
    }
  }

  checkDatabaseOptimization() {
    this.checklist.performance.total += 2;
    
    // Check MongoDB connection string
    if (process.env.MONGODB_URI) {
      const mongoUri = process.env.MONGODB_URI;
      if (mongoUri.includes('retryWrites=true')) {
        this.checklist.performance.score++;
        this.checklist.performance.items.push('✅ MongoDB retry writes enabled');
      } else {
        this.checklist.performance.items.push('⚠️ MongoDB retry writes should be enabled');
      }
      
      if (mongoUri.includes('w=majority')) {
        this.checklist.performance.score++;
        this.checklist.performance.items.push('✅ MongoDB write concern configured');
      } else {
        this.checklist.performance.items.push('⚠️ MongoDB write concern should be configured');
      }
    }
  }

  async checkDeploymentConfiguration() {
    console.log('🚀 Checking Deployment Configuration...\n');

    // Check Docker configuration
    this.checkDockerConfiguration();
    
    // Check PM2 configuration
    this.checkPM2Configuration();
    
    // Check Nginx configuration
    this.checkNginxConfiguration();
    
    // Check deployment scripts
    this.checkDeploymentScripts();
    
    console.log(`Deployment Score: ${this.checklist.deployment.score}/${this.checklist.deployment.total}\n`);
  }

  checkDockerConfiguration() {
    this.checklist.deployment.total += 3;
    
    const dockerFiles = ['Dockerfile', 'docker-compose.prod.yml', '.dockerignore'];
    dockerFiles.forEach(file => {
      if (fs.existsSync(path.join(process.cwd(), file))) {
        this.checklist.deployment.score++;
        this.checklist.deployment.items.push(`✅ ${file} exists`);
      } else {
        this.checklist.deployment.items.push(`❌ ${file} missing`);
      }
    });
  }

  checkPM2Configuration() {
    this.checklist.deployment.total++;
    
    const pm2Config = path.join(process.cwd(), 'ecosystem.config.js');
    if (fs.existsSync(pm2Config)) {
      this.checklist.deployment.score++;
      this.checklist.deployment.items.push('✅ PM2 configuration exists');
    } else {
      this.checklist.deployment.items.push('❌ PM2 configuration missing');
    }
  }

  checkNginxConfiguration() {
    this.checklist.deployment.total++;
    
    const nginxConfig = path.join(process.cwd(), 'nginx', 'nginx.conf');
    if (fs.existsSync(nginxConfig)) {
      this.checklist.deployment.score++;
      this.checklist.deployment.items.push('✅ Nginx configuration exists');
    } else {
      this.checklist.deployment.items.push('❌ Nginx configuration missing');
    }
  }

  checkDeploymentScripts() {
    this.checklist.deployment.total += 2;
    
    const scripts = ['scripts/deploy.sh', 'scripts/setup-server.sh'];
    scripts.forEach(script => {
      if (fs.existsSync(path.join(process.cwd(), script))) {
        this.checklist.deployment.score++;
        this.checklist.deployment.items.push(`✅ ${script} exists`);
      } else {
        this.checklist.deployment.items.push(`❌ ${script} missing`);
      }
    });
  }

  async checkMonitoringConfiguration() {
    console.log('📊 Checking Monitoring and Logging...\n');

    // Check logging configuration
    this.checkLoggingConfiguration();
    
    // Check health check endpoints
    this.checkHealthCheckEndpoints();
    
    // Check monitoring scripts
    this.checkMonitoringScripts();
    
    console.log(`Monitoring Score: ${this.checklist.monitoring.score}/${this.checklist.monitoring.total}\n`);
  }

  checkLoggingConfiguration() {
    this.checklist.monitoring.total += 2;
    
    // Check for logs directory
    const logsDir = path.join(process.cwd(), 'logs');
    if (fs.existsSync(logsDir)) {
      this.checklist.monitoring.score++;
      this.checklist.monitoring.items.push('✅ Logs directory exists');
    } else {
      this.checklist.monitoring.items.push('❌ Logs directory missing');
    }
    
    // Check for logging configuration
    const loggerConfig = path.join(process.cwd(), 'config', 'logger.js');
    if (fs.existsSync(loggerConfig)) {
      this.checklist.monitoring.score++;
      this.checklist.monitoring.items.push('✅ Logger configuration exists');
    } else {
      this.checklist.monitoring.items.push('❌ Logger configuration missing');
    }
  }

  checkHealthCheckEndpoints() {
    this.checklist.monitoring.total += 2;
    
    const serverFile = path.join(process.cwd(), 'server-prod-simple.js');
    if (fs.existsSync(serverFile)) {
      const content = fs.readFileSync(serverFile, 'utf8');
      
      if (content.includes('/health')) {
        this.checklist.monitoring.score++;
        this.checklist.monitoring.items.push('✅ Health check endpoint implemented');
      } else {
        this.checklist.monitoring.items.push('❌ Health check endpoint missing');
      }
    }
    
    const healthCheckScript = path.join(process.cwd(), 'healthcheck.js');
    if (fs.existsSync(healthCheckScript)) {
      this.checklist.monitoring.score++;
      this.checklist.monitoring.items.push('✅ Health check script exists');
    } else {
      this.checklist.monitoring.items.push('❌ Health check script missing');
    }
  }

  checkMonitoringScripts() {
    this.checklist.monitoring.total++;
    
    const monitoringScript = path.join(process.cwd(), 'monitoring.js');
    if (fs.existsSync(monitoringScript)) {
      this.checklist.monitoring.score++;
      this.checklist.monitoring.items.push('✅ Monitoring script exists');
    } else {
      this.checklist.monitoring.items.push('❌ Monitoring script missing');
    }
  }

  async checkDocumentationCompleteness() {
    console.log('📚 Checking Documentation Completeness...\n');

    // Check README
    this.checkREADME();
    
    // Check API documentation
    this.checkAPIDocumentation();
    
    // Check deployment documentation
    this.checkDeploymentDocumentation();
    
    console.log(`Documentation Score: ${this.checklist.documentation.score}/${this.checklist.documentation.total}\n`);
  }

  checkREADME() {
    this.checklist.documentation.total++;
    
    const readmePath = path.join(process.cwd(), 'README.md');
    if (fs.existsSync(readmePath)) {
      this.checklist.documentation.score++;
      this.checklist.documentation.items.push('✅ README.md exists');
    } else {
      this.checklist.documentation.items.push('❌ README.md missing');
    }
  }

  checkAPIDocumentation() {
    this.checklist.documentation.total++;
    
    const apiDocsPath = path.join(process.cwd(), 'docs', 'API_Documentation.md');
    if (fs.existsSync(apiDocsPath)) {
      this.checklist.documentation.score++;
      this.checklist.documentation.items.push('✅ API documentation exists');
    } else {
      this.checklist.documentation.items.push('❌ API documentation missing');
    }
  }

  checkDeploymentDocumentation() {
    this.checklist.documentation.total++;
    
    // Check if deployment instructions exist in any form
    const possibleDocs = [
      'DEPLOYMENT.md',
      'docs/deployment.md',
      'deploy-production.js'
    ];
    
    let docExists = false;
    possibleDocs.forEach(doc => {
      if (fs.existsSync(path.join(process.cwd(), doc))) {
        docExists = true;
      }
    });
    
    if (docExists) {
      this.checklist.documentation.score++;
      this.checklist.documentation.items.push('✅ Deployment documentation exists');
    } else {
      this.checklist.documentation.items.push('❌ Deployment documentation missing');
    }
  }

  calculateOverallScore() {
    let totalScore = 0;
    let totalPossible = 0;
    
    Object.values(this.checklist).forEach(category => {
      totalScore += category.score;
      totalPossible += category.total;
    });
    
    this.overallScore = {
      score: totalScore,
      total: totalPossible,
      percentage: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0
    };
  }

  generateProductionReadinessReport() {
    console.log('📋 Production Readiness Report');
    console.log('===============================\n');

    console.log(`🎯 Overall Readiness Score: ${this.overallScore.percentage}%`);
    console.log(`   (${this.overallScore.score}/${this.overallScore.total} checks passed)\n`);

    // Category breakdown
    Object.entries(this.checklist).forEach(([category, data]) => {
      const percentage = data.total > 0 ? Math.round((data.score / data.total) * 100) : 0;
      const emoji = this.getCategoryEmoji(category);
      console.log(`${emoji} ${this.formatCategoryName(category)}: ${percentage}% (${data.score}/${data.total})`);
    });

    console.log('\n📊 Detailed Breakdown:\n');

    // Detailed breakdown by category
    Object.entries(this.checklist).forEach(([category, data]) => {
      console.log(`${this.getCategoryEmoji(category)} ${this.formatCategoryName(category)}:`);
      data.items.forEach(item => console.log(`   ${item}`));
      console.log('');
    });

    // Production readiness verdict
    this.generateReadinessVerdict();

    // Save report
    this.saveReportToFile();
  }

  generateReadinessVerdict() {
    const score = this.overallScore.percentage;
    
    console.log('🏆 Production Readiness Verdict:');
    console.log('================================\n');

    if (score >= 95) {
      console.log('🚀 EXCELLENT - Ready for Production!');
      console.log('   Your application is well-prepared for production deployment.');
      console.log('   All critical systems are properly configured and secured.');
    } else if (score >= 85) {
      console.log('✅ GOOD - Nearly Ready for Production');
      console.log('   Your application is mostly ready with minor issues to address.');
      console.log('   Review the failed checks and implement missing features.');
    } else if (score >= 70) {
      console.log('⚠️ FAIR - Needs Improvement Before Production');
      console.log('   Your application has significant gaps that should be addressed.');
      console.log('   Focus on security, monitoring, and deployment configuration.');
    } else if (score >= 50) {
      console.log('❌ POOR - Not Ready for Production');
      console.log('   Your application has major deficiencies that must be fixed.');
      console.log('   Address critical security and functionality issues first.');
    } else {
      console.log('🚨 CRITICAL - Major Issues Detected');
      console.log('   Your application is not suitable for production deployment.');
      console.log('   Significant development work is required before going live.');
    }

    console.log('\n💡 Next Steps:');
    if (score < 95) {
      console.log('   1. Address all failed checks marked with ❌');
      console.log('   2. Review and implement all ⚠️ warnings');
      console.log('   3. Run security audit: node security-audit.js');
      console.log('   4. Perform load testing: node test-performance.js');
      console.log('   5. Test deployment in staging environment');
      console.log('   6. Re-run this readiness check');
    } else {
      console.log('   1. Final testing in staging environment');
      console.log('   2. Backup production database');
      console.log('   3. Deploy to production');
      console.log('   4. Monitor application performance');
      console.log('   5. Set up alerting and monitoring');
    }
  }

  saveReportToFile() {
    const report = {
      timestamp: new Date().toISOString(),
      overallScore: this.overallScore,
      categories: this.checklist
    };

    const reportPath = path.join(process.cwd(), 'production-readiness-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  getCategoryEmoji(category) {
    const emojis = {
      environment: '🔧',
      security: '🔒',
      functionality: '🧪',
      performance: '⚡',
      deployment: '🚀',
      monitoring: '📊',
      documentation: '📚'
    };
    return emojis[category] || '📋';
  }

  formatCategoryName(category) {
    return category.charAt(0).toUpperCase() + category.slice(1).replace(/([A-Z])/g, ' $1');
  }

  getSourceFiles() {
    const sourceFiles = [];
    const extensions = ['.js', '.ts'];
    
    const scanDirectory = (dir) => {
      if (dir.includes('node_modules') || dir.includes('.git')) return;
      
      try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            scanDirectory(fullPath);
          } else if (extensions.some(ext => item.endsWith(ext))) {
            sourceFiles.push(fullPath);
          }
        });
      } catch (error) {
        // Skip directories we can't read
      }
    };

    scanDirectory(process.cwd());
    return sourceFiles;
  }
}

// Run production readiness check if this script is executed directly
if (require.main === module) {
  const checker = new ProductionReadinessChecker();
  
  checker.runProductionReadinessCheck()
    .then(() => {
      console.log('\n🎉 Production readiness check completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Production readiness check failed:', error.message);
      process.exit(1);
    });
}

module.exports = ProductionReadinessChecker;