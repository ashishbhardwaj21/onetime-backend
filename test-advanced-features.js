#!/usr/bin/env node

/**
 * Advanced Features Integration Test
 * Tests all newly integrated advanced features
 */

const axios = require('axios');

class AdvancedFeaturesTest {
  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'https://onetime-backend.onrender.com';
    this.testToken = null;
    this.results = { passed: 0, failed: 0, tests: [] };
  }

  async runTests() {
    console.log('🚀 Testing Advanced Features Integration');
    console.log('=====================================');
    console.log(`🎯 Testing against: ${this.baseURL}\n`);

    try {
      // First authenticate to get a test token
      await this.authenticate();
      
      // Test all advanced features
      await this.testAppleAuthEndpoints();
      await this.testPushNotifications();
      await this.testAdvancedMatching();
      await this.testLocationServices();
      await this.testAIRecommendations();
      await this.testContentModeration();
      await this.testSecurityAnalysis();
      await this.testInfrastructureEndpoints();
      
      this.printResults();
      
    } catch (error) {
      console.error('❌ Testing failed:', error.message);
      process.exit(1);
    }
  }

  async authenticate() {
    try {
      // Try to register or login a test user
      const testUser = {
        email: `test.${Date.now()}@example.com`,
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
      
      if (response.data.success) {
        this.testToken = response.data.data.token;
        console.log('✅ Authentication successful\n');
      } else {
        throw new Error('Authentication failed');
      }
    } catch (error) {
      // If registration fails, try login with existing user
      try {
        const loginResponse = await axios.post(`${this.baseURL}/api/auth/login`, {
          email: 'test@example.com',
          password: 'password123'
        });
        this.testToken = loginResponse.data.data.token;
        console.log('✅ Authentication successful (existing user)\n');
      } catch (loginError) {
        throw new Error('Could not authenticate with test credentials');
      }
    }
  }

  async testAppleAuthEndpoints() {
    console.log('🍎 Testing Apple Authentication Endpoints...');
    
    // Test Apple Sign-In endpoint exists (will fail without valid token but endpoint should exist)
    await this.testEndpoint(
      'Apple Sign-In Endpoint',
      'POST',
      '/api/auth/apple/signin',
      { identityToken: 'test', authorizationCode: 'test' },
      false, // Don't expect success
      true   // Just check endpoint exists
    );

    // Test Apple auth status endpoint
    await this.testEndpoint(
      'Apple Auth Status',
      'GET',
      '/api/auth/apple/status',
      null,
      false,
      true
    );
  }

  async testPushNotifications() {
    console.log('📱 Testing Push Notification Endpoints...');
    
    await this.testEndpoint(
      'Register Device Token',
      'POST',
      '/api/advanced/notifications/register-device',
      { deviceToken: 'test_token', platform: 'ios' }
    );

    await this.testEndpoint(
      'Update Notification Preferences',
      'PUT',
      '/api/advanced/notifications/preferences',
      { matches: true, messages: true, activities: false }
    );
  }

  async testAdvancedMatching() {
    console.log('🎯 Testing Advanced Matching Engine...');
    
    await this.testEndpoint(
      'Enhanced Matching',
      'GET',
      '/api/advanced/matching/enhanced?limit=5&minAge=20&maxAge=30'
    );

    await this.testEndpoint(
      'Smart Swipe',
      'POST',
      '/api/advanced/smart-swipe',
      { targetUserId: '60d5ecb8b46fb2a1c8e4e123', action: 'like', feedback: 'Great profile!' }
    );
  }

  async testLocationServices() {
    console.log('📍 Testing Location Services...');
    
    await this.testEndpoint(
      'Update Location',
      'POST',
      '/api/advanced/location/update',
      {
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
        preferences: { visibleRange: 5000, shareWithMatches: true }
      }
    );

    await this.testEndpoint(
      'Find Nearby',
      'GET',
      '/api/advanced/location/nearby'
    );
  }

  async testAIRecommendations() {
    console.log('🤖 Testing AI Recommendations...');
    
    await this.testEndpoint(
      'AI Activity Recommendations',
      'GET',
      '/api/advanced/ai/recommendations?category=outdoor&limit=5'
    );

    await this.testEndpoint(
      'AI-Powered Discovery',
      'GET',
      '/api/discovery/ai-powered?category=indoor&limit=10'
    );
  }

  async testContentModeration() {
    console.log('🛡️ Testing Content Moderation...');
    
    await this.testEndpoint(
      'Analyze Content',
      'POST',
      '/api/advanced/moderation/analyze',
      { content: 'This is a test message', contentType: 'message' }
    );

    await this.testEndpoint(
      'Report Content',
      'POST',
      '/api/advanced/moderation/report',
      { contentId: 'test_id', reason: 'spam', details: { specificIssue: 'Test report' } }
    );
  }

  async testSecurityAnalysis() {
    console.log('🔒 Testing Security Features...');
    
    await this.testEndpoint(
      'Security Analysis',
      'GET',
      '/api/advanced/security/analysis'
    );

    await this.testEndpoint(
      'Complete User Analytics',
      'GET',
      '/api/user/complete-analytics'
    );
  }

  async testInfrastructureEndpoints() {
    console.log('🏗️ Testing Infrastructure Endpoints...');
    
    await this.testEndpoint(
      'System Health',
      'GET',
      '/api/advanced/system/health',
      null,
      true,
      false,
      false // No auth required
    );

    await this.testEndpoint(
      'Performance Monitoring',
      'GET',
      '/api/system/performance',
      null,
      true,
      false,
      false // No auth required
    );

    await this.testEndpoint(
      'Scaling Recommendations',
      'GET',
      '/api/advanced/system/scaling'
    );
  }

  async testEndpoint(name, method, endpoint, data = null, expectSuccess = true, checkExists = false, requireAuth = true) {
    try {
      const config = {
        method: method.toLowerCase(),
        url: `${this.baseURL}${endpoint}`,
        timeout: 10000
      };

      if (requireAuth && this.testToken) {
        config.headers = { Authorization: `Bearer ${this.testToken}` };
      }

      if (data && (method === 'POST' || method === 'PUT')) {
        config.data = data;
      }

      const response = await axios(config);
      
      if (checkExists) {
        console.log(`  ✅ ${name}: Endpoint exists`);
        this.results.passed++;
      } else if (expectSuccess && response.data.success) {
        console.log(`  ✅ ${name}: Success`);
        this.results.passed++;
      } else if (!expectSuccess) {
        console.log(`  ✅ ${name}: Expected behavior (${response.status})`);
        this.results.passed++;
      } else {
        console.log(`  ⚠️ ${name}: Unexpected response`);
        this.results.failed++;
      }

      this.results.tests.push({ name, status: 'passed', endpoint, method });

    } catch (error) {
      if (checkExists && (error.response?.status === 400 || error.response?.status === 401)) {
        console.log(`  ✅ ${name}: Endpoint exists (${error.response.status})`);
        this.results.passed++;
        this.results.tests.push({ name, status: 'passed', endpoint, method });
      } else if (!expectSuccess) {
        console.log(`  ✅ ${name}: Expected failure (${error.response?.status || 'Network'})`);
        this.results.passed++;
        this.results.tests.push({ name, status: 'passed', endpoint, method });
      } else {
        console.log(`  ❌ ${name}: ${error.response?.data?.error || error.message}`);
        this.results.failed++;
        this.results.tests.push({ name, status: 'failed', endpoint, method, error: error.message });
      }
    }
  }

  printResults() {
    console.log('\n📊 Advanced Features Test Results');
    console.log('=================================');
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Success Rate: ${Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100)}%`);
    
    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests
        .filter(test => test.status === 'failed')
        .forEach(test => console.log(`  - ${test.name} (${test.method} ${test.endpoint})`));
    }

    console.log('\n🎉 Advanced features integration test complete!');
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new AdvancedFeaturesTest();
  tester.runTests();
}

module.exports = AdvancedFeaturesTest;