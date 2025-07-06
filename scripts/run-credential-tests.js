#!/usr/bin/env node

/**
 * Comprehensive Credential Test Runner
 * Runs all credential validation tests after rotation
 */

const path = require('path');
const fs = require('fs');

class CredentialTestRunner {
  constructor() {
    this.testResults = {
      startTime: new Date(),
      endTime: null,
      overallStatus: 'pending',
      services: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };
  }

  async runAllTests() {
    console.log('🔒 OneTime Dating App - Comprehensive Credential Tests');
    console.log('====================================================\n');

    console.log('🎯 Testing all rotated credentials for production readiness...\n');

    try {
      // Run all service tests
      await this.testMongoDB();
      await this.testCloudinary();
      await this.testSendGrid();
      await this.testTwilio();
      await this.testJWTSecrets();
      
      this.testResults.endTime = new Date();
      this.calculateSummary();
      this.generateComprehensiveReport();

      if (this.testResults.summary.failed > 0) {
        console.log('\n❌ CREDENTIAL TESTS FAILED');
        console.log('Some services have issues that must be resolved before production deployment.');
        process.exit(1);
      } else {
        console.log('\n✅ ALL CREDENTIAL TESTS PASSED');
        console.log('🚀 All services are ready for production deployment!');
      }

    } catch (error) {
      console.error('💥 Credential test runner failed:', error.message);
      process.exit(1);
    }
  }

  async testMongoDB() {
    await this.runServiceTest('MongoDB Database', async () => {
      const MongoDBTester = require('./test-mongodb');
      const tester = new MongoDBTester();
      await tester.runTests();
      return {
        service: 'MongoDB Atlas',
        status: 'passed',
        details: 'Database connection, permissions, and indexes validated'
      };
    });
  }

  async testCloudinary() {
    await this.runServiceTest('Cloudinary File Storage', async () => {
      const CloudinaryTester = require('./test-cloudinary');
      const tester = new CloudinaryTester();
      await tester.runTests();
      return {
        service: 'Cloudinary',
        status: 'passed',
        details: 'File upload, transformations, and asset management validated'
      };
    });
  }

  async testSendGrid() {
    await this.runServiceTest('SendGrid Email Service', async () => {
      const SendGridTester = require('./test-sendgrid');
      const tester = new SendGridTester();
      await tester.runTests();
      return {
        service: 'SendGrid',
        status: 'passed',
        details: 'Email sending, templates, and validation confirmed'
      };
    });
  }

  async testTwilio() {
    await this.runServiceTest('Twilio SMS Service', async () => {
      const TwilioTester = require('./test-twilio');
      const tester = new TwilioTester();
      await tester.runTests();
      return {
        service: 'Twilio',
        status: 'passed',
        details: 'SMS capabilities and account access validated'
      };
    });
  }

  async testJWTSecrets() {
    await this.runServiceTest('JWT Authentication Secrets', async () => {
      console.log('   🔐 Validating JWT secrets...');

      const jwtSecret = process.env.JWT_SECRET;
      const refreshSecret = process.env.JWT_REFRESH_SECRET;

      if (!jwtSecret || !refreshSecret) {
        throw new Error('JWT secrets not configured');
      }

      if (jwtSecret.length < 32) {
        throw new Error(`JWT secret too short: ${jwtSecret.length} characters (minimum 32)`);
      }

      if (refreshSecret.length < 32) {
        throw new Error(`Refresh secret too short: ${refreshSecret.length} characters (minimum 32)`);
      }

      if (jwtSecret === refreshSecret) {
        throw new Error('JWT secret and refresh secret must be different');
      }

      // Test JWT token generation
      const jwt = require('jsonwebtoken');
      
      const testPayload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000)
      };

      const token = jwt.sign(testPayload, jwtSecret, { expiresIn: '1h' });
      const decoded = jwt.verify(token, jwtSecret);

      if (decoded.userId !== testPayload.userId) {
        throw new Error('JWT token generation/verification failed');
      }

      console.log('   ✅ JWT secrets validated');
      console.log(`   🔑 JWT Secret: ${jwtSecret.length} characters`);
      console.log(`   🔄 Refresh Secret: ${refreshSecret.length} characters`);
      console.log('   🎯 Token generation/verification: Working');

      return {
        service: 'JWT Authentication',
        status: 'passed',
        details: 'JWT and refresh secrets validated, token generation confirmed'
      };
    });
  }

  async runServiceTest(serviceName, testFunction) {
    const startTime = Date.now();
    
    try {
      console.log(`\n🔄 Testing: ${serviceName}`);
      console.log('='.repeat(50));
      
      const result = await testFunction();
      
      const duration = Date.now() - startTime;
      console.log(`\n✅ ${serviceName} test completed (${duration}ms)`);
      
      this.testResults.services.push({
        name: serviceName,
        status: 'passed',
        duration,
        details: result.details,
        timestamp: new Date()
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`\n❌ ${serviceName} test failed (${duration}ms):`);
      console.error(`   Error: ${error.message}`);
      
      this.testResults.services.push({
        name: serviceName,
        status: 'failed',
        duration,
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  calculateSummary() {
    this.testResults.summary.total = this.testResults.services.length;
    this.testResults.summary.passed = this.testResults.services.filter(s => s.status === 'passed').length;
    this.testResults.summary.failed = this.testResults.services.filter(s => s.status === 'failed').length;
    this.testResults.summary.skipped = this.testResults.services.filter(s => s.status === 'skipped').length;

    this.testResults.overallStatus = this.testResults.summary.failed === 0 ? 'passed' : 'failed';
  }

  generateComprehensiveReport() {
    const totalDuration = this.testResults.endTime - this.testResults.startTime;
    
    console.log('\n📊 Comprehensive Credential Test Report');
    console.log('=======================================');
    console.log(`⏱️  Total Duration: ${Math.round(totalDuration / 1000)} seconds`);
    console.log(`🎯 Overall Status: ${this.testResults.overallStatus.toUpperCase()}`);
    console.log(`✅ Passed: ${this.testResults.summary.passed}`);
    console.log(`❌ Failed: ${this.testResults.summary.failed}`);
    console.log(`⏭️  Skipped: ${this.testResults.summary.skipped}`);
    console.log(`📈 Success Rate: ${((this.testResults.summary.passed / this.testResults.summary.total) * 100).toFixed(1)}%`);

    console.log('\n📋 Service Test Results:');
    console.log('─'.repeat(50));
    
    this.testResults.services.forEach((service, index) => {
      const statusIcon = service.status === 'passed' ? '✅' : service.status === 'failed' ? '❌' : '⏭️';
      console.log(`${index + 1}. ${statusIcon} ${service.name}`);
      console.log(`   Status: ${service.status.toUpperCase()}`);
      console.log(`   Duration: ${service.duration}ms`);
      
      if (service.details) {
        console.log(`   Details: ${service.details}`);
      }
      
      if (service.error) {
        console.log(`   Error: ${service.error}`);
      }
      
      console.log('');
    });

    // Security status summary
    console.log('🔒 Security Status Summary:');
    console.log('─'.repeat(30));
    
    const securityChecks = [
      { item: 'Database Access', status: this.getServiceStatus('MongoDB Database') },
      { item: 'File Storage', status: this.getServiceStatus('Cloudinary File Storage') },
      { item: 'Email Service', status: this.getServiceStatus('SendGrid Email Service') },
      { item: 'SMS Service', status: this.getServiceStatus('Twilio SMS Service') },
      { item: 'Authentication', status: this.getServiceStatus('JWT Authentication Secrets') }
    ];

    securityChecks.forEach(check => {
      const icon = check.status === 'passed' ? '🟢' : check.status === 'failed' ? '🔴' : '🟡';
      console.log(`${icon} ${check.item}: ${check.status.toUpperCase()}`);
    });

    // Next steps
    console.log('\n📝 Next Steps:');
    console.log('─'.repeat(15));
    
    if (this.testResults.overallStatus === 'passed') {
      console.log('✅ All credentials are working correctly');
      console.log('🚀 Ready to proceed with production deployment');
      console.log('📋 Run database migration: node scripts/migrate-database.js');
      console.log('🔍 Run production validation: node scripts/validate-production.js');
      console.log('🌐 Deploy application to production servers');
    } else {
      console.log('❌ Fix the failed credential tests before proceeding');
      console.log('🔄 Re-run credential rotation for failed services');
      console.log('🧪 Re-test after fixing issues');
      console.log('⚠️  Do not deploy to production until all tests pass');
    }

    // Save comprehensive report
    const reportData = {
      ...this.testResults,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        testRunner: 'comprehensive-credential-test'
      }
    };

    const reportPath = 'comprehensive-credential-test-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`\n📋 Detailed report saved: ${reportPath}`);

    // Save summary for deployment pipeline
    const summaryPath = 'credential-test-summary.json';
    const summary = {
      status: this.testResults.overallStatus,
      timestamp: new Date().toISOString(),
      totalTests: this.testResults.summary.total,
      passed: this.testResults.summary.passed,
      failed: this.testResults.summary.failed,
      successRate: ((this.testResults.summary.passed / this.testResults.summary.total) * 100).toFixed(1)
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`📊 Summary saved: ${summaryPath}`);
  }

  getServiceStatus(serviceName) {
    const service = this.testResults.services.find(s => s.name === serviceName);
    return service ? service.status : 'not_tested';
  }
}

// Run all tests if called directly
if (require.main === module) {
  require('dotenv').config();
  
  const runner = new CredentialTestRunner();
  runner.runAllTests().catch(error => {
    console.error('💥 Credential test runner failed:', error);
    process.exit(1);
  });
}

module.exports = CredentialTestRunner;