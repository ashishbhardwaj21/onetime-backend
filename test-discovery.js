#!/usr/bin/env node

/**
 * Discovery System Test Script
 * Tests the complete discovery and matching functionality
 */

const axios = require('axios');
require('dotenv').config();

class DiscoveryTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL_DEV || 'http://localhost:3000';
    this.users = [];
  }

  async runTests() {
    console.log('🧪 Starting Discovery System Tests...\n');
    console.log(`📍 Testing against: ${this.baseURL}\n`);

    try {
      // Test 1: Create multiple test users
      await this.createTestUsers();
      
      // Test 2: Test discovery feed
      await this.testDiscoveryFeed();
      
      // Test 3: Test swipe functionality
      await this.testSwipeSystem();
      
      // Test 4: Test match creation
      await this.testMatchCreation();
      
      // Test 5: Test matches retrieval
      await this.testMatchesRetrieval();

      console.log('\n✅ All discovery tests passed successfully!');
      console.log('\n📊 Discovery System Test Summary:');
      console.log('- User creation: ✅');
      console.log('- Discovery feed: ✅');
      console.log('- Swipe system: ✅');
      console.log('- Match creation: ✅');
      console.log('- Matches retrieval: ✅');

    } catch (error) {
      console.error('\n❌ Discovery test failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    }
  }

  async createTestUsers() {
    console.log('👥 Creating test users for discovery...');
    
    const testUserData = [
      {
        email: `discovery-user1-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Alice Johnson',
        age: 25,
        gender: 'female',
        dateOfBirth: '1998-01-01',
        location: {
          coordinates: [-122.4194, 37.7749], // San Francisco
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        }
      },
      {
        email: `discovery-user2-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Bob Smith',
        age: 27,
        gender: 'male',
        dateOfBirth: '1996-01-01',
        location: {
          coordinates: [-122.4094, 37.7849], // Close to San Francisco
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        }
      },
      {
        email: `discovery-user3-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Charlie Davis',
        age: 24,
        gender: 'male',
        dateOfBirth: '1999-01-01',
        location: {
          coordinates: [-122.4294, 37.7649], // San Francisco area
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        }
      }
    ];

    for (const userData of testUserData) {
      const response = await axios.post(`${this.baseURL}/api/auth/register`, userData);
      
      if (response.status === 201 && response.data.success) {
        this.users.push({
          ...userData,
          userId: response.data.data.userId,
          accessToken: response.data.data.accessToken
        });
        console.log(`✅ Created user: ${userData.name}`);
      }
    }

    console.log(`✅ Created ${this.users.length} test users`);
  }

  async testDiscoveryFeed() {
    console.log('\n🔍 Testing discovery feed...');
    
    const user = this.users[0]; // Use first user
    const headers = {
      'Authorization': `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${this.baseURL}/api/discovery?limit=5`, { headers });
    
    if (response.status === 200 && response.data.success) {
      const discoveryData = response.data.data;
      console.log('✅ Discovery feed retrieved successfully');
      console.log(`   Users found: ${discoveryData.users.length}`);
      console.log(`   Has more: ${discoveryData.hasMore}`);
      
      if (discoveryData.users.length > 0) {
        const firstUser = discoveryData.users[0];
        console.log(`   First user: ${firstUser.profile.name} (${firstUser.compatibility.score}% compatible)`);
        console.log(`   Distance: ${firstUser.distance}km`);
      }
    } else {
      throw new Error('Discovery feed test failed');
    }
  }

  async testSwipeSystem() {
    console.log('\n💫 Testing swipe system...');
    
    const user1 = this.users[0];
    const user2 = this.users[1];
    
    const headers = {
      'Authorization': `Bearer ${user1.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Test swipe action
    const swipeData = {
      targetUserId: user2.userId,
      action: 'like'
    };

    const response = await axios.post(`${this.baseURL}/api/discovery/swipe`, swipeData, { headers });
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Swipe action successful');
      console.log(`   Action: ${response.data.data.action}`);
      console.log(`   Message: ${response.data.message}`);
      console.log(`   Is match: ${response.data.data.isMatch}`);
    } else {
      throw new Error('Swipe system test failed');
    }
  }

  async testMatchCreation() {
    console.log('\n🎉 Testing match creation (mutual like)...');
    
    const user1 = this.users[0];
    const user2 = this.users[1];
    
    // User 2 likes User 1 back (creating a match)
    const headers = {
      'Authorization': `Bearer ${user2.accessToken}`,
      'Content-Type': 'application/json'
    };

    const swipeData = {
      targetUserId: user1.userId,
      action: 'like'
    };

    const response = await axios.post(`${this.baseURL}/api/discovery/swipe`, swipeData, { headers });
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Mutual like processed');
      console.log(`   Message: ${response.data.message}`);
      console.log(`   Is match: ${response.data.data.isMatch}`);
      
      if (response.data.data.isMatch) {
        console.log(`   Match ID: ${response.data.data.matchId}`);
      }
    } else {
      throw new Error('Match creation test failed');
    }
  }

  async testMatchesRetrieval() {
    console.log('\n🎯 Testing matches retrieval...');
    
    const user = this.users[0];
    const headers = {
      'Authorization': `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${this.baseURL}/api/matches`, { headers });
    
    if (response.status === 200 && response.data.success) {
      const matchesData = response.data.data;
      console.log('✅ Matches retrieved successfully');
      console.log(`   Matches found: ${matchesData.matches.length}`);
      
      if (matchesData.matches.length > 0) {
        const firstMatch = matchesData.matches[0];
        console.log(`   First match: ${firstMatch.user.profile.name}`);
        console.log(`   Compatibility: ${firstMatch.compatibility.score}%`);
        console.log(`   Matched at: ${new Date(firstMatch.matchedAt).toLocaleString()}`);
      }
    } else {
      throw new Error('Matches retrieval test failed');
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new DiscoveryTester();
  
  tester.runTests()
    .then(() => {
      console.log('\n🎉 All discovery tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Discovery test suite failed:', error.message);
      process.exit(1);
    });
}

module.exports = DiscoveryTester;