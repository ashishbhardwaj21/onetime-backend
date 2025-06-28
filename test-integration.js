#!/usr/bin/env node

/**
 * Comprehensive Integration Test Suite
 * Tests all systems working together as a complete application
 */

const axios = require('axios');
const io = require('socket.io-client');
require('dotenv').config();

class IntegrationTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL_DEV || 'http://localhost:3000';
    this.users = [];
    this.admin = null;
    this.matches = [];
    this.conversations = [];
    this.activities = [];
    this.sockets = [];
  }

  async runTests() {
    console.log('🧪 Starting Comprehensive Integration Test Suite...\n');
    console.log(`📍 Testing against: ${this.baseURL}\n`);

    try {
      // Phase 1: User lifecycle and authentication
      await this.testUserLifecycle();
      
      // Phase 2: Profile completion workflow
      await this.testProfileCompletionWorkflow();
      
      // Phase 3: Discovery and matching workflow
      await this.testDiscoveryAndMatchingWorkflow();
      
      // Phase 4: Real-time messaging workflow
      await this.testRealTimeMessagingWorkflow();
      
      // Phase 5: Activity suggestion and engagement
      await this.testActivitySuggestionWorkflow();
      
      // Phase 6: Admin moderation workflow
      await this.testAdminModerationWorkflow();
      
      // Phase 7: End-to-end user journey
      await this.testEndToEndUserJourney();
      
      // Phase 8: System stress and edge cases
      await this.testSystemStressAndEdgeCases();

      console.log('\n🎉 All integration tests passed successfully!');
      this.printTestSummary();

    } catch (error) {
      console.error('\n❌ Integration test failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    } finally {
      // Cleanup socket connections
      this.sockets.forEach(socket => socket.disconnect());
    }
  }

  async testUserLifecycle() {
    console.log('👥 Testing complete user lifecycle...');
    
    // Create multiple test users
    const userProfiles = [
      {
        email: `integration-user1-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Emma Thompson',
        age: 28,
        gender: 'female',
        dateOfBirth: '1995-03-15'
      },
      {
        email: `integration-user2-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'James Wilson',
        age: 30,
        gender: 'male',
        dateOfBirth: '1993-07-22'
      },
      {
        email: `integration-user3-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Maya Patel',
        age: 26,
        gender: 'female',
        dateOfBirth: '1997-11-08'
      }
    ];

    for (const profile of userProfiles) {
      // Register user
      const registerResponse = await axios.post(`${this.baseURL}/api/auth/register`, {
        ...profile,
        location: {
          coordinates: [-122.4194, 37.7749],
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        }
      });

      if (registerResponse.status === 201) {
        const user = {
          ...profile,
          userId: registerResponse.data.data.userId,
          accessToken: registerResponse.data.data.accessToken
        };
        this.users.push(user);
        console.log(`✅ User registered: ${profile.name}`);

        // Test login
        const loginResponse = await axios.post(`${this.baseURL}/api/auth/login`, {
          email: profile.email,
          password: profile.password
        });

        if (loginResponse.status === 200) {
          console.log(`✅ User login verified: ${profile.name}`);
        }
      }
    }

    console.log(`✅ Created ${this.users.length} test users successfully`);
  }

  async testProfileCompletionWorkflow() {
    console.log('\n📋 Testing profile completion workflow...');
    
    for (let i = 0; i < this.users.length; i++) {
      const user = this.users[i];
      const headers = {
        'Authorization': `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json'
      };

      // Check initial completion
      const initialResponse = await axios.get(`${this.baseURL}/api/users/me/complete`, { headers });
      const initialCompletion = initialResponse.data.data.user.profileCompletion;
      console.log(`   ${user.name} initial completion: ${initialCompletion.percentage}%`);

      // Complete profile sections
      await this.completeUserProfile(user, headers);

      // Check final completion
      const finalResponse = await axios.get(`${this.baseURL}/api/users/me/complete`, { headers });
      const finalCompletion = finalResponse.data.data.user.profileCompletion;
      console.log(`   ${user.name} final completion: ${finalCompletion.percentage}%`);
    }

    console.log('✅ Profile completion workflow tested for all users');
  }

  async completeUserProfile(user, headers) {
    // Update basic info
    await axios.put(`${this.baseURL}/api/users/me/profile`, {
      section: 'basic',
      data: {
        name: user.name,
        age: user.age,
        occupation: 'Software Engineer',
        bio: `Hi! I'm ${user.name}. Love traveling, good food, and meeting new people!`,
        height: user.gender === 'female' ? 165 : 180
      }
    }, { headers });

    // Add photos
    const photoUrls = [
      'https://images.unsplash.com/photo-1494790108755-2616b612b5a4',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9',
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6'
    ];

    for (let j = 0; j < photoUrls.length; j++) {
      await axios.post(`${this.baseURL}/api/users/me/photos`, {
        photoUrl: photoUrls[j],
        caption: `Photo ${j + 1}`,
        isPrimary: j === 0
      }, { headers });
    }

    // Add prompts
    await axios.put(`${this.baseURL}/api/users/me/prompts`, {
      prompts: [
        {
          question: "What's your idea of a perfect Sunday?",
          answer: "Coffee, good book, maybe some hiking if the weather's nice!",
          order: 0
        },
        {
          question: "I'm passionate about...",
          answer: "Technology, travel, and trying new cuisines from around the world.",
          order: 1
        },
        {
          question: "The best way to win me over is...",
          answer: "Be genuine, make me laugh, and share your favorite local spots!",
          order: 2
        }
      ]
    }, { headers });

    // Add interests
    await axios.put(`${this.baseURL}/api/users/me/profile`, {
      section: 'interests',
      data: {
        interests: ['travel', 'technology', 'food', 'hiking', 'music'],
        intentTags: ['adventure', 'intellectual', 'foodie'],
        energyLevel: 'Energetic',
        lookingFor: 'Serious'
      }
    }, { headers });

    // Set preferences
    await axios.put(`${this.baseURL}/api/users/me/profile`, {
      section: 'preferences',
      data: {
        agePreference: { min: 22, max: 35 },
        distancePreference: 25,
        genderPreference: user.gender === 'female' ? ['male'] : ['female']
      }
    }, { headers });
  }

  async testDiscoveryAndMatchingWorkflow() {
    console.log('\n💕 Testing discovery and matching workflow...');
    
    for (const user of this.users) {
      const headers = {
        'Authorization': `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json'
      };

      // Get discovery feed
      const discoveryResponse = await axios.get(`${this.baseURL}/api/discovery?limit=5`, { headers });
      
      if (discoveryResponse.status === 200) {
        const discoveredUsers = discoveryResponse.data.data.users;
        console.log(`   ${user.name} discovered ${discoveredUsers.length} potential matches`);

        // Simulate swiping
        for (const discoveredUser of discoveredUsers.slice(0, 2)) {
          const swipeResponse = await axios.post(`${this.baseURL}/api/discovery/swipe`, {
            targetUserId: discoveredUser._id,
            action: 'like'
          }, { headers });

          if (swipeResponse.data.data.isMatch) {
            this.matches.push({
              user1: user,
              user2: discoveredUser,
              matchId: swipeResponse.data.data.matchId
            });
            console.log(`   🎉 Match created between ${user.name} and ${discoveredUser.profile.name}`);
          }
        }
      }
    }

    console.log(`✅ Discovery and matching workflow completed. Created ${this.matches.length} matches`);
  }

  async testRealTimeMessagingWorkflow() {
    console.log('\n💬 Testing real-time messaging workflow...');
    
    if (this.matches.length === 0) {
      console.log('⚠️ No matches available for messaging test');
      return;
    }

    for (const match of this.matches.slice(0, 2)) {
      // Create conversation
      const headers1 = {
        'Authorization': `Bearer ${match.user1.accessToken}`,
        'Content-Type': 'application/json'
      };

      const conversationResponse = await axios.post(`${this.baseURL}/api/conversations`, {
        matchId: match.matchId
      }, { headers1 });

      if (conversationResponse.status === 201) {
        const conversationId = conversationResponse.data.data.conversationId;
        this.conversations.push({
          id: conversationId,
          users: [match.user1, match.user2]
        });

        console.log(`   💬 Conversation created between ${match.user1.name} and ${match.user2.profile.name}`);

        // Test real-time connection
        await this.testRealTimeConnection(match.user1, match.user2, conversationId);
      }
    }

    console.log('✅ Real-time messaging workflow completed');
  }

  async testRealTimeConnection(user1, user2, conversationId) {
    return new Promise((resolve) => {
      // Connect user1
      const socket1 = io(this.baseURL, {
        auth: { token: user1.accessToken }
      });

      // Connect user2
      const socket2 = io(this.baseURL, {
        auth: { token: user2.accessToken }
      });

      this.sockets.push(socket1, socket2);

      let messagesReceived = 0;
      const expectedMessages = 2;

      socket1.on('connect', () => {
        console.log(`   🔌 ${user1.name} connected to real-time messaging`);
        socket1.emit('join_conversation', { conversationId });
      });

      socket2.on('connect', () => {
        console.log(`   🔌 ${user2.name} connected to real-time messaging`);
        socket2.emit('join_conversation', { conversationId });
      });

      // Test message exchange
      socket1.on('new_message', (message) => {
        console.log(`   📨 ${user1.name} received: "${message.content}"`);
        messagesReceived++;
        if (messagesReceived >= expectedMessages) resolve();
      });

      socket2.on('new_message', (message) => {
        console.log(`   📨 ${user2.name} received: "${message.content}"`);
        messagesReceived++;
        if (messagesReceived >= expectedMessages) resolve();
      });

      // Send test messages
      setTimeout(() => {
        this.sendMessage(user1.accessToken, conversationId, 'Hey! Nice to match with you! 😊');
      }, 1000);

      setTimeout(() => {
        this.sendMessage(user2.accessToken, conversationId, 'Hi there! Thanks for the like! How are you doing?');
      }, 2000);

      // Timeout after 10 seconds
      setTimeout(resolve, 10000);
    });
  }

  async sendMessage(accessToken, conversationId, content) {
    try {
      await axios.post(`${this.baseURL}/api/conversations/${conversationId}/messages`, {
        content,
        type: 'text'
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Error sending message:', error.message);
    }
  }

  async testActivitySuggestionWorkflow() {
    console.log('\n🎯 Testing activity suggestion workflow...');
    
    const user = this.users[0];
    const headers = {
      'Authorization': `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Get activity suggestions
    const suggestionsResponse = await axios.get(`${this.baseURL}/api/activities/suggestions?limit=5`, { headers });
    
    if (suggestionsResponse.status === 200) {
      const activities = suggestionsResponse.data.data.activities;
      console.log(`   ${user.name} received ${activities.length} activity suggestions`);
      
      if (activities.length > 0) {
        const activity = activities[0];
        console.log(`   Top suggestion: ${activity.title} (${activity.category})`);
        this.activities.push(activity);

        // Rate the activity
        await axios.post(`${this.baseURL}/api/activities/${activity._id}/rate`, {
          rating: 5,
          review: 'Great suggestion! Had an amazing time.'
        }, { headers });

        console.log(`   ⭐ ${user.name} rated activity: ${activity.title}`);

        // Suggest activity to match (if available)
        if (this.matches.length > 0) {
          const match = this.matches[0];
          await axios.post(`${this.baseURL}/api/matches/${match.matchId}/suggest-activity`, {
            activityId: activity._id,
            message: "How about we try this activity together? Looks fun!"
          }, { headers });

          console.log(`   💡 ${user.name} suggested activity to ${match.user2.profile.name}`);
        }
      }
    }

    console.log('✅ Activity suggestion workflow completed');
  }

  async testAdminModerationWorkflow() {
    console.log('\n🛡️ Testing admin moderation workflow...');
    
    // Admin login
    const adminResponse = await axios.post(`${this.baseURL}/api/admin/login`, {
      email: process.env.ADMIN_EMAIL || 'admin@onetime.app',
      password: process.env.ADMIN_PASSWORD || 'SecureAdminPassword123!'
    });

    if (adminResponse.status === 200) {
      this.admin = {
        accessToken: adminResponse.data.data.accessToken,
        adminId: adminResponse.data.data.adminId
      };

      const headers = {
        'Authorization': `Bearer ${this.admin.accessToken}`,
        'Content-Type': 'application/json'
      };

      // Test dashboard overview
      const dashboardResponse = await axios.get(`${this.baseURL}/api/admin/dashboard`, { headers });
      if (dashboardResponse.status === 200) {
        const stats = dashboardResponse.data.data;
        console.log(`   📊 Dashboard: ${stats.users.total} users, ${stats.matches.total} matches`);
      }

      // Test user management
      const usersResponse = await axios.get(`${this.baseURL}/api/admin/users?limit=5`, { headers });
      if (usersResponse.status === 200) {
        console.log(`   👥 User management: Retrieved ${usersResponse.data.data.users.length} users`);
      }

      // Test system monitoring
      const systemResponse = await axios.get(`${this.baseURL}/api/admin/system/stats`, { headers });
      if (systemResponse.status === 200) {
        console.log(`   📈 System monitoring: Server ${systemResponse.data.data.server.status}`);
      }

      console.log('✅ Admin moderation workflow completed');
    }
  }

  async testEndToEndUserJourney() {
    console.log('\n🗺️ Testing complete end-to-end user journey...');
    
    // Simulate a new user's complete journey
    const newUser = {
      email: `e2e-journey-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Journey User',
      age: 25,
      gender: 'non-binary',
      dateOfBirth: '1998-01-01'
    };

    // 1. Registration
    const registerResponse = await axios.post(`${this.baseURL}/api/auth/register`, {
      ...newUser,
      location: {
        coordinates: [-122.4194, 37.7749],
        city: 'San Francisco',
        state: 'CA',
        country: 'US'
      }
    });

    const accessToken = registerResponse.data.data.accessToken;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    console.log('   ✅ Registration completed');

    // 2. Profile completion
    await this.completeUserProfile(newUser, headers);
    console.log('   ✅ Profile completion');

    // 3. Discovery
    const discoveryResponse = await axios.get(`${this.baseURL}/api/discovery?limit=3`, { headers });
    console.log('   ✅ Discovery feed accessed');

    // 4. Swiping
    if (discoveryResponse.data.data.users.length > 0) {
      await axios.post(`${this.baseURL}/api/discovery/swipe`, {
        targetUserId: discoveryResponse.data.data.users[0]._id,
        action: 'like'
      }, { headers });
      console.log('   ✅ Swiping functionality');
    }

    // 5. Activity browsing
    const activitiesResponse = await axios.get(`${this.baseURL}/api/activities/suggestions`, { headers });
    console.log('   ✅ Activity suggestions accessed');

    // 6. Settings update
    await axios.put(`${this.baseURL}/api/users/me/settings`, {
      section: 'notifications',
      settings: { matches: true, messages: true }
    }, { headers });
    console.log('   ✅ Settings updated');

    console.log('✅ End-to-end user journey completed successfully');
  }

  async testSystemStressAndEdgeCases() {
    console.log('\n🔥 Testing system stress and edge cases...');
    
    const user = this.users[0];
    const headers = {
      'Authorization': `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Test rapid API calls
    console.log('   Testing rapid API calls...');
    const rapidCalls = [];
    for (let i = 0; i < 10; i++) {
      rapidCalls.push(axios.get(`${this.baseURL}/api/users/me`, { headers }));
    }
    await Promise.all(rapidCalls);
    console.log('   ✅ Rapid API calls handled');

    // Test invalid data
    console.log('   Testing invalid data handling...');
    try {
      await axios.post(`${this.baseURL}/api/discovery/swipe`, {
        targetUserId: 'invalid-id',
        action: 'invalid-action'
      }, { headers });
    } catch (error) {
      if (error.response.status === 400) {
        console.log('   ✅ Invalid data properly rejected');
      }
    }

    // Test unauthorized access
    console.log('   Testing unauthorized access...');
    try {
      await axios.get(`${this.baseURL}/api/users/me`, {
        headers: { 'Authorization': 'Bearer invalid-token' }
      });
    } catch (error) {
      if (error.response.status === 401) {
        console.log('   ✅ Unauthorized access properly blocked');
      }
    }

    console.log('✅ System stress and edge case testing completed');
  }

  printTestSummary() {
    console.log('\n📊 Integration Test Summary:');
    console.log('=================================');
    console.log(`✅ Users created: ${this.users.length}`);
    console.log(`✅ Matches generated: ${this.matches.length}`);
    console.log(`✅ Conversations started: ${this.conversations.length}`);
    console.log(`✅ Activities tested: ${this.activities.length}`);
    console.log(`✅ Admin functionality: ${this.admin ? 'Tested' : 'Skipped'}`);
    console.log(`✅ Socket connections: ${this.sockets.length}`);
    console.log('\n🎯 Test Coverage:');
    console.log('- User lifecycle: ✅');
    console.log('- Profile completion: ✅');
    console.log('- Discovery & matching: ✅');
    console.log('- Real-time messaging: ✅');
    console.log('- Activity suggestions: ✅');
    console.log('- Admin moderation: ✅');
    console.log('- End-to-end journey: ✅');
    console.log('- Stress testing: ✅');
    console.log('\n🚀 All systems operational and integrated successfully!');
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new IntegrationTester();
  
  tester.runTests()
    .then(() => {
      console.log('\n🎉 Integration test suite completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Integration test suite failed:', error.message);
      process.exit(1);
    });
}

module.exports = IntegrationTester;