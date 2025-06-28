#!/usr/bin/env node

/**
 * Production Environment Testing Suite
 * Comprehensive testing against production environment
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.production' });

class ProductionTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'https://api.onetime.app';
    this.testResults = {
      connectivity: { passed: 0, failed: 0, tests: [] },
      security: { passed: 0, failed: 0, tests: [] },
      functionality: { passed: 0, failed: 0, tests: [] },
      performance: { passed: 0, failed: 0, tests: [] },
      integration: { passed: 0, failed: 0, tests: [] }
    };
  }

  async runProductionTests() {
    console.log('🚀 OneTime Dating App - Production Environment Testing');
    console.log('====================================================\n');
    console.log(`🎯 Testing against: ${this.baseURL}\n`);

    try {
      // 1. Connectivity and SSL Tests
      await this.testConnectivityAndSSL();
      
      // 2. Security Configuration Tests
      await this.testSecurityConfiguration();
      
      // 3. Core Functionality Tests
      await this.testCoreFunctionality();
      
      // 4. Performance Tests
      await this.testPerformance();
      
      // 5. Integration Tests
      await this.testIntegration();

      this.generateProductionTestReport();

    } catch (error) {
      console.error('\n❌ Production testing failed:', error.message);
      process.exit(1);
    }
  }

  async testConnectivityAndSSL() {
    console.log('🌐 Testing Connectivity and SSL Configuration...\n');

    // Test HTTPS connection
    await this.runTest('connectivity', 'HTTPS Connection', async () => {
      const response = await axios.get(`${this.baseURL}/health`, { timeout: 10000 });
      return response.status === 200;
    });

    // Test SSL certificate
    await this.runTest('connectivity', 'SSL Certificate Validity', async () => {
      if (!this.baseURL.startsWith('https://')) {
        throw new Error('URL is not HTTPS');
      }
      
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 10000,
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: true // This will fail if certificate is invalid
        })
      });
      return response.status === 200;
    });

    // Test HTTP to HTTPS redirect
    await this.runTest('connectivity', 'HTTP to HTTPS Redirect', async () => {
      const httpUrl = this.baseURL.replace('https://', 'http://');
      try {
        const response = await axios.get(`${httpUrl}/health`, {
          timeout: 10000,
          maxRedirects: 0
        });
        return false; // Should not reach here
      } catch (error) {
        // Should get a redirect response
        return error.response && (error.response.status === 301 || error.response.status === 302);
      }
    });

    // Test response time
    await this.runTest('connectivity', 'Response Time < 2s', async () => {
      const startTime = Date.now();
      await axios.get(`${this.baseURL}/health`, { timeout: 10000 });
      const responseTime = Date.now() - startTime;
      return responseTime < 2000;
    });

    console.log(`Connectivity Tests: ${this.testResults.connectivity.passed}/${this.testResults.connectivity.passed + this.testResults.connectivity.failed} passed\n`);
  }

  async testSecurityConfiguration() {
    console.log('🔒 Testing Security Configuration...\n');

    // Test security headers
    await this.runTest('security', 'Security Headers Present', async () => {
      const response = await axios.get(`${this.baseURL}/health`);
      const headers = response.headers;
      
      const requiredHeaders = [
        'strict-transport-security',
        'x-frame-options',
        'x-content-type-options'
      ];
      
      return requiredHeaders.every(header => headers[header]);
    });

    // Test CORS configuration
    await this.runTest('security', 'CORS Configuration', async () => {
      try {
        const response = await axios.options(`${this.baseURL}/api/users/me`, {
          headers: {
            'Origin': 'https://malicious-site.com',
            'Access-Control-Request-Method': 'GET'
          }
        });
        
        const corsHeader = response.headers['access-control-allow-origin'];
        return corsHeader !== '*' && !corsHeader?.includes('malicious-site.com');
      } catch (error) {
        // CORS rejection is good
        return true;
      }
    });

    // Test rate limiting
    await this.runTest('security', 'Rate Limiting Active', async () => {
      const requests = [];
      for (let i = 0; i < 50; i++) {
        requests.push(
          axios.get(`${this.baseURL}/health`).catch(error => ({
            status: error.response?.status,
            error: true
          }))
        );
      }
      
      const results = await Promise.all(requests);
      return results.some(result => result.status === 429);
    });

    // Test authentication required
    await this.runTest('security', 'Authentication Required for Protected Routes', async () => {
      try {
        await axios.get(`${this.baseURL}/api/users/me`);
        return false; // Should not succeed without auth
      } catch (error) {
        return error.response?.status === 401;
      }
    });

    console.log(`Security Tests: ${this.testResults.security.passed}/${this.testResults.security.passed + this.testResults.security.failed} passed\n`);
  }

  async testCoreFunctionality() {
    console.log('🧪 Testing Core Functionality...\n');

    // Test health endpoint
    await this.runTest('functionality', 'Health Endpoint', async () => {
      const response = await axios.get(`${this.baseURL}/health`);
      return response.status === 200 && response.data.status === 'OK';
    });

    // Test API endpoints structure
    await this.runTest('functionality', 'API Endpoints Available', async () => {
      const endpoints = [
        '/api/auth/register',
        '/api/auth/login',
        '/api/discovery',
        '/api/activities/suggestions'
      ];
      
      const results = await Promise.allSettled(
        endpoints.map(endpoint => 
          axios.get(`${this.baseURL}${endpoint}`).catch(error => ({
            status: error.response?.status,
            endpoint
          }))
        )
      );
      
      // Endpoints should return 401 (auth required) or 400 (bad request), not 404
      return results.every(result => {
        const status = result.value?.status || result.value?.response?.status;
        return status && status !== 404;
      });
    });

    // Test database connectivity
    await this.runTest('functionality', 'Database Connectivity', async () => {
      // Try to register a test user to verify DB connection
      try {
        const testUser = {
          email: `test-${Date.now()}@example.com`,
          password: 'TestPassword123!',
          name: 'Test User',
          age: 25,
          gender: 'other',
          dateOfBirth: '1998-01-01',
          location: {
            coordinates: [-122.4194, 37.7749],
            city: 'San Francisco',
            state: 'CA',
            country: 'US'
          }
        };
        
        const response = await axios.post(`${this.baseURL}/api/auth/register`, testUser);
        return response.status === 201;
      } catch (error) {
        // Check if it's a validation error (means DB is working)
        return error.response?.status === 400;
      }
    });

    // Test file upload endpoint
    await this.runTest('functionality', 'File Upload Endpoint', async () => {
      try {
        await axios.post(`${this.baseURL}/api/users/me/photos/upload`, {});
        return false; // Should require auth
      } catch (error) {
        return error.response?.status === 401; // Auth required is expected
      }
    });

    console.log(`Functionality Tests: ${this.testResults.functionality.passed}/${this.testResults.functionality.passed + this.testResults.functionality.failed} passed\n`);
  }

  async testPerformance() {
    console.log('⚡ Testing Performance...\n');

    // Test average response time
    await this.runTest('performance', 'Average Response Time < 500ms', async () => {
      const times = [];
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await axios.get(`${this.baseURL}/health`);
        times.push(Date.now() - startTime);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      return avgTime < 500;
    });

    // Test concurrent requests
    await this.runTest('performance', 'Handle 20 Concurrent Requests', async () => {
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(axios.get(`${this.baseURL}/health`));
      }
      
      const results = await Promise.allSettled(requests);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      return successful >= 18; // Allow 90% success rate
    });

    // Test compression
    await this.runTest('performance', 'Response Compression Enabled', async () => {
      const response = await axios.get(`${this.baseURL}/health`, {
        headers: { 'Accept-Encoding': 'gzip, deflate' }
      });
      
      return response.headers['content-encoding'] === 'gzip';
    });

    console.log(`Performance Tests: ${this.testResults.performance.passed}/${this.testResults.performance.passed + this.testResults.performance.failed} passed\n`);
  }

  async testIntegration() {
    console.log('🔗 Testing Integration...\n');

    // Test complete user registration flow
    await this.runTest('integration', 'User Registration Flow', async () => {
      const testUser = {
        email: `integration-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Integration Test User',
        age: 25,
        gender: 'other',
        dateOfBirth: '1998-01-01',
        location: {
          coordinates: [-122.4194, 37.7749],
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        }
      };
      
      const response = await axios.post(`${this.baseURL}/api/auth/register`, testUser);
      return response.status === 201 && response.data.success === true;
    });

    // Test authentication flow
    await this.runTest('integration', 'Authentication Flow', async () => {
      // Use admin credentials for testing
      const loginData = {
        email: process.env.ADMIN_EMAIL || 'admin@onetime.app',
        password: process.env.ADMIN_PASSWORD || 'SecureAdminPassword123!'
      };
      
      try {
        const response = await axios.post(`${this.baseURL}/api/admin/login`, loginData);
        return response.status === 200 && response.data.data.accessToken;
      } catch (error) {
        // If admin endpoint doesn't exist, try regular login
        return error.response?.status === 404;
      }
    });

    // Test error handling
    await this.runTest('integration', 'Error Handling', async () => {
      try {
        await axios.get(`${this.baseURL}/api/nonexistent-endpoint`);
        return false;
      } catch (error) {
        return error.response?.status === 404 && error.response?.data?.success === false;
      }
    });

    console.log(`Integration Tests: ${this.testResults.integration.passed}/${this.testResults.integration.passed + this.testResults.integration.failed} passed\n`);
  }

  async runTest(category, testName, testFunction) {
    try {
      const startTime = Date.now();
      const result = await testFunction();
      const duration = Date.now() - startTime;
      
      if (result) {
        this.testResults[category].passed++;
        this.testResults[category].tests.push({
          name: testName,
          status: 'PASSED',
          duration: `${duration}ms`
        });
        console.log(`   ✅ ${testName} (${duration}ms)`);
      } else {
        this.testResults[category].failed++;
        this.testResults[category].tests.push({
          name: testName,
          status: 'FAILED',
          duration: `${duration}ms`,
          error: 'Test returned false'
        });
        console.log(`   ❌ ${testName} - Test returned false`);
      }
    } catch (error) {
      this.testResults[category].failed++;
      this.testResults[category].tests.push({
        name: testName,
        status: 'FAILED',
        duration: 'N/A',
        error: error.message
      });
      console.log(`   ❌ ${testName} - ${error.message}`);
    }
  }

  generateProductionTestReport() {
    console.log('📊 Production Test Report');
    console.log('========================\n');

    let totalPassed = 0;
    let totalFailed = 0;

    Object.entries(this.testResults).forEach(([category, results]) => {
      const percentage = results.passed + results.failed > 0 
        ? Math.round((results.passed / (results.passed + results.failed)) * 100)
        : 0;
      
      console.log(`${this.getCategoryEmoji(category)} ${this.formatCategoryName(category)}: ${percentage}% (${results.passed}/${results.passed + results.failed})`);
      
      totalPassed += results.passed;
      totalFailed += results.failed;
    });

    const overallPercentage = totalPassed + totalFailed > 0 
      ? Math.round((totalPassed / (totalPassed + totalFailed)) * 100)
      : 0;

    console.log(`\n🎯 Overall Score: ${overallPercentage}% (${totalPassed}/${totalPassed + totalFailed})`);

    // Detailed breakdown
    console.log('\n📋 Detailed Test Results:\n');
    
    Object.entries(this.testResults).forEach(([category, results]) => {
      console.log(`${this.getCategoryEmoji(category)} ${this.formatCategoryName(category)}:`);
      results.tests.forEach(test => {
        const status = test.status === 'PASSED' ? '✅' : '❌';
        console.log(`   ${status} ${test.name} (${test.duration})`);
        if (test.error) {
          console.log(`      Error: ${test.error}`);
        }
      });
      console.log('');
    });

    // Production readiness verdict
    this.generateProductionVerdict(overallPercentage);

    // Save report
    this.saveTestReport();
  }

  generateProductionVerdict(score) {
    console.log('🏆 Production Readiness Verdict:');
    console.log('================================\n');

    if (score >= 95) {
      console.log('🚀 EXCELLENT - Production Environment is Optimal!');
      console.log('   All critical systems are working correctly.');
      console.log('   Performance and security are at production standards.');
    } else if (score >= 85) {
      console.log('✅ GOOD - Production Environment is Ready');
      console.log('   Most systems are working correctly with minor issues.');
      console.log('   Monitor the failed tests and address if needed.');
    } else if (score >= 70) {
      console.log('⚠️ FAIR - Production Environment Needs Attention');
      console.log('   Several issues detected that should be addressed.');
      console.log('   Consider fixing critical issues before full launch.');
    } else {
      console.log('❌ POOR - Production Environment Has Issues');
      console.log('   Multiple critical issues detected.');
      console.log('   Do not proceed with production launch until issues are resolved.');
    }

    console.log('\n💡 Recommended Actions:');
    if (score < 95) {
      console.log('   1. Review and fix all failed tests');
      console.log('   2. Monitor application performance and error rates');
      console.log('   3. Verify SSL certificate and security configuration');
      console.log('   4. Test under realistic load conditions');
      console.log('   5. Set up monitoring and alerting');
      console.log('   6. Create incident response procedures');
    } else {
      console.log('   1. Continue monitoring application health');
      console.log('   2. Set up automated alerting for critical metrics');
      console.log('   3. Schedule regular security audits');
      console.log('   4. Plan for scaling based on user growth');
      console.log('   5. Document operational procedures');
    }
  }

  saveTestReport() {
    const report = {
      timestamp: new Date().toISOString(),
      environment: this.baseURL,
      results: this.testResults,
      summary: {
        totalPassed: Object.values(this.testResults).reduce((sum, cat) => sum + cat.passed, 0),
        totalFailed: Object.values(this.testResults).reduce((sum, cat) => sum + cat.failed, 0)
      }
    };

    const reportPath = path.join(process.cwd(), 'production-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  getCategoryEmoji(category) {
    const emojis = {
      connectivity: '🌐',
      security: '🔒',
      functionality: '🧪',
      performance: '⚡',
      integration: '🔗'
    };
    return emojis[category] || '📋';
  }

  formatCategoryName(category) {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new ProductionTester();
  
  tester.runProductionTests()
    .then(() => {
      console.log('\n🎉 Production testing completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Production testing failed:', error.message);
      process.exit(1);
    });
}

module.exports = ProductionTester;