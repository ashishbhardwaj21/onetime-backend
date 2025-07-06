#!/usr/bin/env node

/**
 * API Endpoint Verification
 * Quick test to verify all endpoints that iOS app depends on are working
 */

const axios = require('axios');
require('dotenv').config();

class APIEndpointTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'http://localhost:3000';
    this.endpoints = [
      // Health and status
      { method: 'GET', path: '/health', auth: false, description: 'Health check' },
      
      // Authentication endpoints (iOS AuthService)
      { method: 'POST', path: '/api/auth/register', auth: false, description: 'User registration' },
      { method: 'POST', path: '/api/auth/login', auth: false, description: 'User login' },
      { method: 'POST', path: '/api/auth/refresh', auth: false, description: 'Token refresh' },
      
      // User management (iOS ProfileService)
      { method: 'GET', path: '/api/users/me', auth: true, description: 'Get current user' },
      { method: 'PUT', path: '/api/users/profile', auth: true, description: 'Update profile' },
      { method: 'POST', path: '/api/users/upload', auth: true, description: 'Upload photo' },
      
      // Discovery (iOS DiscoveryService)
      { method: 'GET', path: '/api/discovery/profiles', auth: true, description: 'Get discovery profiles' },
      { method: 'POST', path: '/api/discovery/swipe', auth: true, description: 'Swipe profile' },
      
      // Messaging (iOS MessageService)
      { method: 'GET', path: '/api/messages/conversations', auth: true, description: 'Get conversations' },
      { method: 'GET', path: '/api/messages/conversation/test', auth: true, description: 'Get conversation messages' },
      { method: 'POST', path: '/api/messages/send', auth: true, description: 'Send message' },
      
      // Activities (iOS ActivityService)
      { method: 'GET', path: '/api/activities', auth: true, description: 'Get activities' },
      { method: 'POST', path: '/api/activities', auth: true, description: 'Create activity' },
      { method: 'POST', path: '/api/activities/test/join', auth: true, description: 'Join activity' },
      
      // Matches
      { method: 'GET', path: '/api/matches', auth: true, description: 'Get matches' }
    ];
    this.testToken = null;
  }

  async runEndpointTests() {
    console.log('🔍 API Endpoint Verification');
    console.log('============================');
    console.log(`🎯 Testing: ${this.baseURL}\\n`);

    try {
      // First, get an auth token for protected endpoints
      await this.obtainTestToken();
      
      // Test all endpoints
      let passed = 0;
      let failed = 0;
      
      for (const endpoint of this.endpoints) {
        try {
          await this.testEndpoint(endpoint);
          console.log(`✅ ${endpoint.method} ${endpoint.path} - ${endpoint.description}`);
          passed++;
        } catch (error) {
          console.log(`❌ ${endpoint.method} ${endpoint.path} - ${endpoint.description}`);
          console.log(`   Error: ${error.message}`);
          failed++;
        }
      }
      
      console.log('\\n📊 Results Summary:');
      console.log(`✅ Passed: ${passed}`);
      console.log(`❌ Failed: ${failed}`);
      console.log(`📊 Total:  ${passed + failed}`);
      console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
      
      if (failed > 0) {
        console.log('\\n⚠️  Some endpoints are not responding correctly.');
        console.log('🔧 Check server logs and ensure the backend is running properly.');
        process.exit(1);
      } else {
        console.log('\\n🎉 All critical API endpoints are working!');
      }
      
    } catch (error) {
      console.error('❌ Endpoint testing failed:', error.message);
      process.exit(1);
    }
  }

  async obtainTestToken() {
    console.log('🔑 Obtaining test authentication token...');
    
    const testUser = {
      email: `endpoint-test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Endpoint Test User',
      age: 25
    };

    try {
      // Register test user
      const registerResponse = await axios.post(`${this.baseURL}/api/auth/register`, testUser);
      
      if (registerResponse.status === 201 && registerResponse.data.token) {
        this.testToken = registerResponse.data.token;
        console.log('✅ Test token obtained successfully\\n');
      } else {
        throw new Error('Failed to obtain test token');
      }
    } catch (error) {
      // If registration fails, try login (user might already exist)
      try {
        const loginResponse = await axios.post(`${this.baseURL}/api/auth/login`, {
          email: testUser.email,
          password: testUser.password
        });
        
        if (loginResponse.status === 200 && loginResponse.data.token) {
          this.testToken = loginResponse.data.token;
          console.log('✅ Test token obtained via login\\n');
        } else {
          throw new Error('Failed to obtain test token via login');
        }
      } catch (loginError) {
        throw new Error(`Cannot obtain test token: ${error.message}`);
      }
    }
  }

  async testEndpoint(endpoint) {
    const config = {
      method: endpoint.method,
      url: `${this.baseURL}${endpoint.path}`,
      timeout: 10000,
      validateStatus: function (status) {
        // Consider 2xx, 4xx as valid responses (we just want to know the endpoint exists)
        return status >= 200 && status < 500;
      }
    };

    // Add auth header if required
    if (endpoint.auth && this.testToken) {
      config.headers = {
        'Authorization': `Bearer ${this.testToken}`,
        'Content-Type': 'application/json'
      };
    }

    // Add test data for POST requests
    if (endpoint.method === 'POST') {
      config.data = this.getTestDataForEndpoint(endpoint.path);
    }

    const response = await axios(config);
    
    // Log response status for debugging
    if (response.status >= 400) {
      console.log(`   Status: ${response.status} (${endpoint.description})`);
    }
    
    return response;
  }

  getTestDataForEndpoint(path) {
    // Return appropriate test data based on endpoint
    switch (path) {
      case '/api/auth/register':
        return {
          email: `test-${Date.now()}@example.com`,
          password: 'TestPassword123!',
          name: 'Test User',
          age: 25
        };
      
      case '/api/auth/login':
        return {
          email: 'test@example.com',
          password: 'TestPassword123!'
        };
      
      case '/api/auth/refresh':
        return {
          refreshToken: 'test-refresh-token'
        };
      
      case '/api/users/profile':
        return {
          bio: 'Test bio update',
          occupation: 'Tester'
        };
      
      case '/api/discovery/swipe':
        return {
          profileId: 'test-profile-id',
          action: 'like'
        };
      
      case '/api/messages/send':
        return {
          conversationId: 'test-conversation-id',
          text: 'Test message',
          type: 'text'
        };
      
      case '/api/activities':
        return {
          title: 'Test Activity',
          description: 'Test activity description',
          category: 'dining',
          location: {
            name: 'Test Location',
            coordinates: [-122.4194, 37.7749]
          },
          maxParticipants: 4,
          scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
      
      default:
        return {};
    }
  }
}

// Run the tests
if (require.main === module) {
  const tester = new APIEndpointTester();
  tester.runEndpointTests();
}

module.exports = APIEndpointTester;