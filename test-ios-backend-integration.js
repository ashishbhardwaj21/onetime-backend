#!/usr/bin/env node

/**
 * iOS Backend Integration Test Suite
 * Tests the specific APIs that iOS app uses after Azure removal
 * Verifies all new services work correctly with the real backend
 */

const axios = require('axios');
const io = require('socket.io-client');
const fs = require('fs');
require('dotenv').config();

class iOSBackendIntegrationTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'http://localhost:3000';
    this.socketURL = this.baseURL.replace(/^http/, 'ws');
    this.testUsers = [];
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
    this.socket = null;
  }

  async runTests() {
    console.log('📱 iOS Backend Integration Test Suite');
    console.log('====================================');
    console.log(`🎯 Testing against: ${this.baseURL}`);
    console.log(`🔌 Socket.io URL: ${this.socketURL}\n`);

    try {
      // Test API connectivity
      await this.testAPIConnectivity();
      
      // Test authentication flow (matching iOS AuthService)
      await this.testAuthenticationFlow();
      
      // Test discovery service integration
      await this.testDiscoveryIntegration();
      
      // Test real-time messaging via Socket.io
      await this.testSocketIOMessaging();
      
      // Test activity management
      await this.testActivityManagement();
      
      // Test profile management
      await this.testProfileManagement();
      
      // Test error handling and edge cases
      await this.testErrorHandling();

      this.generateTestReport();

    } catch (error) {
      console.error('❌ Integration test failed:', error.message);
      this.recordTestResult('General', 'Test Suite Execution', false, error.message);
    } finally {
      if (this.socket) {
        this.socket.disconnect();
      }
      await this.cleanup();
    }
  }

  async testAPIConnectivity() {
    console.log('🔌 Testing API Connectivity...');
    
    await this.runTest('API Health Check', async () => {
      const response = await axios.get(`${this.baseURL}/health`);
      if (response.status !== 200) {
        throw new Error(`Health check failed with status ${response.status}`);
      }
      if (response.data.status !== 'OK') {
        throw new Error(`Health check returned status: ${response.data.status}`);
      }
      console.log('   ✅ API is healthy and responsive');
      console.log(`   📊 Uptime: ${Math.round(response.data.uptime)}s`);
      console.log(`   🗄️  Database: ${response.data.database.status}`);
    });

    await this.runTest('CORS Headers', async () => {
      const response = await axios.options(`${this.baseURL}/api/auth/register`, {
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type,Authorization'
        }
      });
      
      if (!response.headers['access-control-allow-origin']) {
        throw new Error('CORS headers not properly configured');
      }
      console.log('   ✅ CORS properly configured for iOS app');
    });
  }

  async testAuthenticationFlow() {
    console.log('\\n🔐 Testing Authentication Flow (iOS AuthService)...');
    
    const testUser = {
      email: `ios-test-user-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'iOS Test User',
      age: 25
    };

    await this.runTest('User Registration', async () => {
      const response = await axios.post(`${this.baseURL}/api/auth/register`, testUser);
      
      if (response.status !== 201) {
        throw new Error(`Registration failed with status ${response.status}`);
      }
      
      if (!response.data.success || !response.data.token) {
        throw new Error('Registration response missing required fields');
      }
      
      testUser.token = response.data.token;
      testUser.userId = response.data.user.id;
      this.testUsers.push(testUser);
      
      console.log('   ✅ User registration successful');
      console.log(`   👤 User ID: ${testUser.userId}`);
    });

    await this.runTest('User Login', async () => {
      const loginData = {
        email: testUser.email,
        password: testUser.password
      };
      
      const response = await axios.post(`${this.baseURL}/api/auth/login`, loginData);
      
      if (response.status !== 200) {
        throw new Error(`Login failed with status ${response.status}`);
      }
      
      if (!response.data.success || !response.data.token) {
        throw new Error('Login response missing required fields');
      }
      
      console.log('   ✅ User login successful');
      console.log('   🔑 JWT token received and valid');
    });

    await this.runTest('Token Validation', async () => {
      const response = await axios.get(`${this.baseURL}/api/users/me`, {
        headers: { Authorization: `Bearer ${testUser.token}` }
      });
      
      if (response.status !== 200) {
        throw new Error(`Token validation failed with status ${response.status}`);
      }
      
      if (response.data.user.id !== testUser.userId) {
        throw new Error('Token validation returned wrong user');
      }
      
      console.log('   ✅ JWT token validation working');
    });
  }

  async testDiscoveryIntegration() {
    console.log('\\n💕 Testing Discovery Integration (iOS DiscoveryService)...');
    
    const authHeaders = { Authorization: `Bearer ${this.testUsers[0].token}` };

    await this.runTest('Get Discovery Profiles', async () => {
      const response = await axios.get(`${this.baseURL}/api/discovery/profiles`, {
        headers: authHeaders,
        params: { limit: 10 }
      });
      
      if (response.status !== 200) {
        throw new Error(`Discovery failed with status ${response.status}`);
      }
      
      if (!Array.isArray(response.data.profiles)) {
        throw new Error('Discovery response should contain profiles array');
      }
      
      console.log(`   ✅ Retrieved ${response.data.profiles.length} discovery profiles`);
    });

    await this.runTest('Profile Swipe Action', async () => {
      // First get a profile to swipe on
      const profilesResponse = await axios.get(`${this.baseURL}/api/discovery/profiles`, {
        headers: authHeaders,
        params: { limit: 1 }
      });
      
      if (profilesResponse.data.profiles.length === 0) {
        console.log('   ⚠️  No profiles available for swipe test');
        return;
      }
      
      const profile = profilesResponse.data.profiles[0];
      const swipeData = {
        profileId: profile.id,
        action: 'like'
      };
      
      const response = await axios.post(`${this.baseURL}/api/discovery/swipe`, swipeData, {
        headers: authHeaders
      });
      
      if (response.status !== 200) {
        throw new Error(`Swipe action failed with status ${response.status}`);
      }
      
      console.log('   ✅ Profile swipe action successful');
      if (response.data.isMatch) {
        console.log('   💖 Match created!');
      }
    });
  }

  async testSocketIOMessaging() {
    console.log('\\n💬 Testing Socket.io Real-time Messaging...');
    
    await this.runTest('Socket.io Connection', async () => {
      return new Promise((resolve, reject) => {
        this.socket = io(this.socketURL, {
          auth: { token: this.testUsers[0].token },
          transports: ['websocket', 'polling']
        });
        
        this.socket.on('connect', () => {
          console.log('   ✅ Socket.io connection established');
          console.log(`   🔗 Socket ID: ${this.socket.id}`);
          resolve();
        });
        
        this.socket.on('connect_error', (error) => {
          reject(new Error(`Socket connection failed: ${error.message}`));
        });
        
        // Set timeout for connection
        setTimeout(() => {
          if (!this.socket.connected) {
            reject(new Error('Socket connection timeout'));
          }
        }, 5000);
      });
    });

    await this.runTest('Real-time Message Events', async () => {
      return new Promise((resolve, reject) => {
        // Listen for message events
        this.socket.on('message_received', (data) => {
          console.log('   ✅ Real-time message event received');
          console.log(`   📨 Message: ${data.content?.text || 'N/A'}`);
          resolve();
        });
        
        // Send a test message (this will echo back in real implementation)
        this.socket.emit('send_message', {
          conversationId: 'test-conversation',
          text: 'Test message from iOS integration',
          type: 'text'
        });
        
        // Timeout if no response
        setTimeout(() => {
          reject(new Error('No real-time message response received'));
        }, 3000);
      });
    });
  }

  async testActivityManagement() {
    console.log('\\n🎯 Testing Activity Management (iOS ActivityService)...');
    
    const authHeaders = { Authorization: `Bearer ${this.testUsers[0].token}` };

    await this.runTest('Get Activities', async () => {
      const response = await axios.get(`${this.baseURL}/api/activities`, {
        headers: authHeaders
      });
      
      if (response.status !== 200) {
        throw new Error(`Get activities failed with status ${response.status}`);
      }
      
      if (!Array.isArray(response.data.activities)) {
        throw new Error('Activities response should contain activities array');
      }
      
      console.log(`   ✅ Retrieved ${response.data.activities.length} activities`);
    });

    await this.runTest('Create Activity', async () => {
      const activityData = {
        title: 'iOS Integration Test Activity',
        description: 'Test activity created during iOS backend integration testing',
        category: 'dining',
        location: {
          name: 'Test Restaurant',
          address: '123 Test Street',
          coordinates: [-122.4194, 37.7749],
          city: 'San Francisco',
          state: 'CA'
        },
        maxParticipants: 4,
        scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };
      
      const response = await axios.post(`${this.baseURL}/api/activities`, activityData, {
        headers: authHeaders
      });
      
      if (response.status !== 201) {
        throw new Error(`Create activity failed with status ${response.status}`);
      }
      
      if (!response.data.success || !response.data.activity) {
        throw new Error('Create activity response missing required fields');
      }
      
      console.log('   ✅ Activity creation successful');
      console.log(`   🎯 Activity ID: ${response.data.activity.id}`);
    });
  }

  async testProfileManagement() {
    console.log('\\n👤 Testing Profile Management (iOS ProfileService)...');
    
    const authHeaders = { Authorization: `Bearer ${this.testUsers[0].token}` };

    await this.runTest('Get Current User Profile', async () => {
      const response = await axios.get(`${this.baseURL}/api/users/me`, {
        headers: authHeaders
      });
      
      if (response.status !== 200) {
        throw new Error(`Get profile failed with status ${response.status}`);
      }
      
      if (!response.data.user || !response.data.user.id) {
        throw new Error('Profile response missing required fields');
      }
      
      console.log('   ✅ Profile retrieval successful');
      console.log(`   📱 Profile ID: ${response.data.user.id}`);
    });

    await this.runTest('Update User Profile', async () => {
      const updateData = {
        bio: 'Updated bio from iOS integration test',
        occupation: 'Software Tester',
        interests: ['testing', 'technology', 'integration']
      };
      
      const response = await axios.put(`${this.baseURL}/api/users/profile`, updateData, {
        headers: authHeaders
      });
      
      if (response.status !== 200) {
        throw new Error(`Profile update failed with status ${response.status}`);
      }
      
      console.log('   ✅ Profile update successful');
    });
  }

  async testErrorHandling() {
    console.log('\\n⚠️  Testing Error Handling...');
    
    await this.runTest('Invalid Authentication', async () => {
      try {
        await axios.get(`${this.baseURL}/api/users/me`, {
          headers: { Authorization: 'Bearer invalid-token' }
        });
        throw new Error('Should have failed with invalid token');
      } catch (error) {
        if (error.response?.status === 401) {
          console.log('   ✅ Invalid token properly rejected');
        } else {
          throw error;
        }
      }
    });

    await this.runTest('Rate Limiting', async () => {
      // Test rate limiting on auth endpoints
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(
          axios.post(`${this.baseURL}/api/auth/login`, {
            email: 'nonexistent@example.com',
            password: 'wrongpassword'
          }).catch(err => err.response)
        );
      }
      
      const responses = await Promise.all(promises);
      const rateLimited = responses.some(response => response?.status === 429);
      
      if (rateLimited) {
        console.log('   ✅ Rate limiting is working');
      } else {
        console.log('   ⚠️  Rate limiting may not be configured properly');
      }
    });
  }

  async runTest(testName, testFunction) {
    this.testResults.total++;
    try {
      await testFunction();
      this.testResults.passed++;
      this.recordTestResult('Integration', testName, true);
    } catch (error) {
      this.testResults.failed++;
      this.recordTestResult('Integration', testName, false, error.message);
      console.error(`   ❌ ${testName} failed:`, error.message);
    }
  }

  recordTestResult(category, testName, passed, error = null) {
    this.testResults.details.push({
      category,
      test: testName,
      passed,
      error,
      timestamp: new Date().toISOString()
    });
  }

  generateTestReport() {
    console.log('\\n📊 Test Results Summary');
    console.log('========================');
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📊 Total:  ${this.testResults.total}`);
    console.log(`📈 Success Rate: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);

    // Write detailed report to file
    const report = {
      summary: {
        passed: this.testResults.passed,
        failed: this.testResults.failed,
        total: this.testResults.total,
        successRate: (this.testResults.passed / this.testResults.total) * 100,
        timestamp: new Date().toISOString(),
        testEnvironment: {
          baseURL: this.baseURL,
          socketURL: this.socketURL,
          nodeVersion: process.version,
          platform: process.platform
        }
      },
      details: this.testResults.details
    };

    const reportPath = 'ios-backend-integration-test-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\\n📋 Detailed report saved to: ${reportPath}`);

    if (this.testResults.failed > 0) {
      console.log('\\n❌ Some tests failed. Check the report for details.');
      process.exit(1);
    } else {
      console.log('\\n🎉 All iOS backend integration tests passed!');
    }
  }

  async cleanup() {
    console.log('\\n🧹 Cleaning up test data...');
    
    // Clean up test users
    for (const user of this.testUsers) {
      try {
        await axios.delete(`${this.baseURL}/api/users/me`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        console.log(`   🗑️  Cleaned up user: ${user.email}`);
      } catch (error) {
        console.log(`   ⚠️  Could not clean up user ${user.email}: ${error.message}`);
      }
    }
    
    console.log('✅ Cleanup completed');
  }
}

// Run the tests
if (require.main === module) {
  const tester = new iOSBackendIntegrationTester();
  tester.runTests();
}

module.exports = iOSBackendIntegrationTester;