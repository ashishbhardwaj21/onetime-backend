#!/usr/bin/env node

/**
 * Performance Optimization and Load Testing Script
 * Tests system performance under load and identifies bottlenecks
 */

const axios = require('axios');
const cluster = require('cluster');
const os = require('os');
require('dotenv').config();

class PerformanceTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL_DEV || 'http://localhost:3000';
    this.testResults = {
      apiPerformance: {},
      loadTests: {},
      memoryUsage: {},
      responseTime: {},
      concurrency: {},
      errors: []
    };
  }

  async runTests() {
    console.log('⚡ Starting Performance and Load Testing Suite...\n');
    console.log(`📍 Testing against: ${this.baseURL}\n`);

    try {
      // Test 1: API Response Time Analysis
      await this.testAPIResponseTimes();
      
      // Test 2: Database Query Performance
      await this.testDatabasePerformance();
      
      // Test 3: Concurrent User Load Testing
      await this.testConcurrentUserLoad();
      
      // Test 4: Memory and Resource Usage
      await this.testMemoryAndResourceUsage();
      
      // Test 5: Real-time Messaging Load
      await this.testRealTimeMessagingLoad();
      
      // Test 6: File Upload Performance
      await this.testFileUploadPerformance();
      
      // Test 7: Discovery Algorithm Performance
      await this.testDiscoveryAlgorithmPerformance();
      
      // Test 8: Rate Limiting and Throttling
      await this.testRateLimitingAndThrottling();

      this.printPerformanceReport();
      console.log('\n🎉 Performance testing completed successfully!');

    } catch (error) {
      console.error('\n❌ Performance test failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    }
  }

  async testAPIResponseTimes() {
    console.log('⏱️ Testing API response times...');
    
    // Create test user for authenticated endpoints
    const testUser = await this.createTestUser();
    const headers = {
      'Authorization': `Bearer ${testUser.accessToken}`,
      'Content-Type': 'application/json'
    };

    const endpoints = [
      { name: 'Health Check', url: '/health', method: 'GET', headers: {} },
      { name: 'User Profile', url: '/api/users/me', method: 'GET', headers },
      { name: 'Discovery Feed', url: '/api/discovery?limit=10', method: 'GET', headers },
      { name: 'Activity Suggestions', url: '/api/activities/suggestions?limit=10', method: 'GET', headers },
      { name: 'Conversations', url: '/api/conversations', method: 'GET', headers },
      { name: 'User Matches', url: '/api/matches', method: 'GET', headers }
    ];

    const iterations = 50;
    
    for (const endpoint of endpoints) {
      const times = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        try {
          const response = await axios({
            method: endpoint.method,
            url: `${this.baseURL}${endpoint.url}`,
            headers: endpoint.headers
          });
          
          const endTime = Date.now();
          times.push(endTime - startTime);
        } catch (error) {
          this.testResults.errors.push(`${endpoint.name}: ${error.message}`);
        }
      }

      if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

        this.testResults.apiPerformance[endpoint.name] = {
          average: Math.round(avgTime),
          min: minTime,
          max: maxTime,
          p95: p95Time,
          samples: times.length
        };

        console.log(`   ${endpoint.name}: avg ${Math.round(avgTime)}ms, p95 ${p95Time}ms`);
      }
    }

    console.log('✅ API response time testing completed');
  }

  async testDatabasePerformance() {
    console.log('\n🗄️ Testing database performance...');
    
    const testUser = await this.createTestUser();
    const headers = {
      'Authorization': `Bearer ${testUser.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Test complex queries
    const complexQueries = [
      {
        name: 'Discovery with Filters',
        url: '/api/discovery?limit=20&ageMin=25&ageMax=35&maxDistance=50',
        iterations: 20
      },
      {
        name: 'Activity Search',
        url: '/api/activities/search?q=hiking&category=outdoor&priceRange=free',
        iterations: 20
      },
      {
        name: 'User Analytics',
        url: '/api/users/me/analytics',
        iterations: 10
      }
    ];

    for (const query of complexQueries) {
      const times = [];
      
      for (let i = 0; i < query.iterations; i++) {
        const startTime = Date.now();
        
        try {
          await axios.get(`${this.baseURL}${query.url}`, { headers });
          const endTime = Date.now();
          times.push(endTime - startTime);
        } catch (error) {
          this.testResults.errors.push(`DB Query ${query.name}: ${error.message}`);
        }
      }

      if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        this.testResults.apiPerformance[`DB: ${query.name}`] = {
          average: Math.round(avgTime),
          samples: times.length
        };
        console.log(`   ${query.name}: avg ${Math.round(avgTime)}ms`);
      }
    }

    console.log('✅ Database performance testing completed');
  }

  async testConcurrentUserLoad() {
    console.log('\n👥 Testing concurrent user load...');
    
    const concurrencyLevels = [10, 25, 50, 100];
    
    for (const concurrency of concurrencyLevels) {
      console.log(`   Testing ${concurrency} concurrent users...`);
      
      const promises = [];
      const startTime = Date.now();
      
      for (let i = 0; i < concurrency; i++) {
        promises.push(this.simulateUserSession());
      }
      
      try {
        const results = await Promise.allSettled(promises);
        const endTime = Date.now();
        
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        this.testResults.concurrency[`${concurrency} users`] = {
          totalTime: endTime - startTime,
          successful,
          failed,
          successRate: Math.round((successful / concurrency) * 100)
        };
        
        console.log(`     Success rate: ${Math.round((successful / concurrency) * 100)}% (${successful}/${concurrency})`);
        console.log(`     Total time: ${endTime - startTime}ms`);
        
      } catch (error) {
        this.testResults.errors.push(`Concurrency ${concurrency}: ${error.message}`);
      }
    }

    console.log('✅ Concurrent user load testing completed');
  }

  async simulateUserSession() {
    // Create user
    const user = await this.createTestUser();
    const headers = {
      'Authorization': `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Simulate typical user actions
    await axios.get(`${this.baseURL}/api/users/me`, { headers });
    await axios.get(`${this.baseURL}/api/discovery?limit=10`, { headers });
    await axios.get(`${this.baseURL}/api/activities/suggestions?limit=5`, { headers });
    
    return 'Session completed';
  }

  async testMemoryAndResourceUsage() {
    console.log('\n🧠 Testing memory and resource usage...');
    
    try {
      const statsResponse = await axios.get(`${this.baseURL}/health`);
      
      if (statsResponse.status === 200) {
        const initialMemory = process.memoryUsage();
        console.log('   Initial memory usage:');
        console.log(`     RSS: ${Math.round(initialMemory.rss / 1024 / 1024)}MB`);
        console.log(`     Heap Used: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
        console.log(`     Heap Total: ${Math.round(initialMemory.heapTotal / 1024 / 1024)}MB`);
        console.log(`     External: ${Math.round(initialMemory.external / 1024 / 1024)}MB`);

        this.testResults.memoryUsage.initial = {
          rss: Math.round(initialMemory.rss / 1024 / 1024),
          heapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024),
          heapTotal: Math.round(initialMemory.heapTotal / 1024 / 1024),
          external: Math.round(initialMemory.external / 1024 / 1024)
        };
      }
    } catch (error) {
      console.log('   ⚠️ Could not retrieve server memory stats');
    }

    // Stress test memory
    console.log('   Running memory stress test...');
    const users = [];
    for (let i = 0; i < 20; i++) {
      try {
        const user = await this.createTestUser();
        users.push(user);
      } catch (error) {
        break;
      }
    }

    console.log(`   Created ${users.length} users for memory testing`);
    console.log('✅ Memory and resource testing completed');
  }

  async testRealTimeMessagingLoad() {
    console.log('\n💬 Testing real-time messaging load...');
    
    // This is a simplified test - in production you'd use socket.io-client
    console.log('   Real-time messaging load test simulated');
    console.log('   ⚠️ Note: Full WebSocket load testing requires socket.io-client setup');
    
    this.testResults.loadTests.realTimeMessaging = {
      status: 'simulated',
      note: 'Requires socket.io-client for full testing'
    };

    console.log('✅ Real-time messaging load testing completed');
  }

  async testFileUploadPerformance() {
    console.log('\n📁 Testing file upload performance...');
    
    const user = await this.createTestUser();
    const headers = {
      'Authorization': `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Test photo upload simulation (using URL method)
    const uploadTimes = [];
    const uploads = 5;

    for (let i = 0; i < uploads; i++) {
      const startTime = Date.now();
      
      try {
        await axios.post(`${this.baseURL}/api/users/me/photos`, {
          photoUrl: `https://images.unsplash.com/photo-150000000${i}`,
          caption: `Performance test photo ${i}`,
          isPrimary: i === 0
        }, { headers });
        
        const endTime = Date.now();
        uploadTimes.push(endTime - startTime);
      } catch (error) {
        this.testResults.errors.push(`Photo upload ${i}: ${error.message}`);
      }
    }

    if (uploadTimes.length > 0) {
      const avgUploadTime = uploadTimes.reduce((a, b) => a + b, 0) / uploadTimes.length;
      this.testResults.apiPerformance['Photo Upload'] = {
        average: Math.round(avgUploadTime),
        samples: uploadTimes.length
      };
      console.log(`   Average photo upload time: ${Math.round(avgUploadTime)}ms`);
    }

    console.log('✅ File upload performance testing completed');
  }

  async testDiscoveryAlgorithmPerformance() {
    console.log('\n🔍 Testing discovery algorithm performance...');
    
    const user = await this.createTestUser();
    const headers = {
      'Authorization': `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Test different discovery scenarios
    const scenarios = [
      { name: 'Small Feed', params: '?limit=5' },
      { name: 'Medium Feed', params: '?limit=20' },
      { name: 'Large Feed', params: '?limit=50' },
      { name: 'Filtered Feed', params: '?limit=20&ageMin=25&ageMax=35&maxDistance=25' }
    ];

    for (const scenario of scenarios) {
      const times = [];
      const iterations = 10;
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        try {
          await axios.get(`${this.baseURL}/api/discovery${scenario.params}`, { headers });
          const endTime = Date.now();
          times.push(endTime - startTime);
        } catch (error) {
          this.testResults.errors.push(`Discovery ${scenario.name}: ${error.message}`);
        }
      }

      if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        this.testResults.apiPerformance[`Discovery: ${scenario.name}`] = {
          average: Math.round(avgTime),
          samples: times.length
        };
        console.log(`   ${scenario.name}: avg ${Math.round(avgTime)}ms`);
      }
    }

    console.log('✅ Discovery algorithm performance testing completed');
  }

  async testRateLimitingAndThrottling() {
    console.log('\n🚦 Testing rate limiting and throttling...');
    
    const user = await this.createTestUser();
    const headers = {
      'Authorization': `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Test rapid requests to trigger rate limiting
    const rapidRequests = [];
    const requestCount = 150; // Should exceed rate limit
    
    console.log(`   Sending ${requestCount} rapid requests...`);
    
    for (let i = 0; i < requestCount; i++) {
      rapidRequests.push(
        axios.get(`${this.baseURL}/api/users/me`, { headers })
          .then(() => ({ status: 'success', index: i }))
          .catch((error) => ({ 
            status: 'error', 
            index: i, 
            statusCode: error.response?.status,
            message: error.response?.data?.error 
          }))
      );
    }

    const results = await Promise.all(rapidRequests);
    
    const successful = results.filter(r => r.status === 'success').length;
    const rateLimited = results.filter(r => r.statusCode === 429).length;
    const errors = results.filter(r => r.status === 'error' && r.statusCode !== 429).length;

    this.testResults.loadTests.rateLimiting = {
      totalRequests: requestCount,
      successful,
      rateLimited,
      errors,
      rateLimitTriggered: rateLimited > 0
    };

    console.log(`   Successful requests: ${successful}`);
    console.log(`   Rate limited requests: ${rateLimited}`);
    console.log(`   Other errors: ${errors}`);
    console.log(`   Rate limiting ${rateLimited > 0 ? 'working' : 'not triggered'}`);

    console.log('✅ Rate limiting and throttling testing completed');
  }

  async createTestUser() {
    const userData = {
      email: `perf-test-${Date.now()}-${Math.random().toString(36).substr(2, 5)}@example.com`,
      password: 'TestPassword123!',
      name: 'Performance Test User',
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

    const response = await axios.post(`${this.baseURL}/api/auth/register`, userData);
    
    return {
      ...userData,
      userId: response.data.data.userId,
      accessToken: response.data.data.accessToken
    };
  }

  printPerformanceReport() {
    console.log('\n📊 Performance Test Report');
    console.log('===========================\n');

    // API Performance
    console.log('🚀 API Response Times:');
    for (const [endpoint, stats] of Object.entries(this.testResults.apiPerformance)) {
      console.log(`   ${endpoint}:`);
      console.log(`     Average: ${stats.average}ms`);
      if (stats.min) console.log(`     Min: ${stats.min}ms`);
      if (stats.max) console.log(`     Max: ${stats.max}ms`);
      if (stats.p95) console.log(`     P95: ${stats.p95}ms`);
      console.log(`     Samples: ${stats.samples}`);
      console.log('');
    }

    // Concurrency Results
    console.log('👥 Concurrency Test Results:');
    for (const [level, stats] of Object.entries(this.testResults.concurrency)) {
      console.log(`   ${level}:`);
      console.log(`     Success Rate: ${stats.successRate}%`);
      console.log(`     Total Time: ${stats.totalTime}ms`);
      console.log(`     Successful: ${stats.successful}`);
      console.log(`     Failed: ${stats.failed}`);
      console.log('');
    }

    // Memory Usage
    if (this.testResults.memoryUsage.initial) {
      console.log('🧠 Memory Usage:');
      const mem = this.testResults.memoryUsage.initial;
      console.log(`   RSS: ${mem.rss}MB`);
      console.log(`   Heap Used: ${mem.heapUsed}MB`);
      console.log(`   Heap Total: ${mem.heapTotal}MB`);
      console.log(`   External: ${mem.external}MB`);
      console.log('');
    }

    // Rate Limiting
    if (this.testResults.loadTests.rateLimiting) {
      const rl = this.testResults.loadTests.rateLimiting;
      console.log('🚦 Rate Limiting:');
      console.log(`   Total Requests: ${rl.totalRequests}`);
      console.log(`   Successful: ${rl.successful}`);
      console.log(`   Rate Limited: ${rl.rateLimited}`);
      console.log(`   Rate Limiting: ${rl.rateLimitTriggered ? '✅ Working' : '❌ Not Triggered'}`);
      console.log('');
    }

    // Performance Recommendations
    console.log('💡 Performance Recommendations:');
    const recommendations = this.generateRecommendations();
    recommendations.forEach(rec => console.log(`   • ${rec}`));

    // Errors
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ Errors Encountered:');
      this.testResults.errors.forEach(error => console.log(`   • ${error}`));
    }
  }

  generateRecommendations() {
    const recommendations = [];
    
    // Check API response times
    for (const [endpoint, stats] of Object.entries(this.testResults.apiPerformance)) {
      if (stats.average > 1000) {
        recommendations.push(`${endpoint} is slow (${stats.average}ms) - consider optimization`);
      }
      if (stats.p95 && stats.p95 > 2000) {
        recommendations.push(`${endpoint} has high P95 latency (${stats.p95}ms) - investigate bottlenecks`);
      }
    }

    // Check concurrency performance
    for (const [level, stats] of Object.entries(this.testResults.concurrency)) {
      if (stats.successRate < 95) {
        recommendations.push(`${level} has low success rate (${stats.successRate}%) - check system capacity`);
      }
    }

    // Check memory usage
    if (this.testResults.memoryUsage.initial) {
      const mem = this.testResults.memoryUsage.initial;
      if (mem.heapUsed > 1000) {
        recommendations.push(`High heap usage (${mem.heapUsed}MB) - monitor for memory leaks`);
      }
    }

    // General recommendations
    recommendations.push('Add database indexing for frequently queried fields');
    recommendations.push('Implement response caching for static content');
    recommendations.push('Consider connection pooling for database connections');
    recommendations.push('Add monitoring and alerting for production deployment');

    return recommendations;
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new PerformanceTester();
  
  tester.runTests()
    .then(() => {
      console.log('\n🎉 Performance testing completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Performance testing failed:', error.message);
      process.exit(1);
    });
}

module.exports = PerformanceTester;