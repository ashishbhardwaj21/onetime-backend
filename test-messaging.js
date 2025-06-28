#!/usr/bin/env node

/**
 * Real-time Messaging System Test Script
 * Tests the complete messaging functionality including Socket.io
 */

const axios = require('axios');
const io = require('socket.io-client');
require('dotenv').config();

class MessagingTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL_DEV || 'http://localhost:3000';
    this.users = [];
    this.sockets = [];
  }

  async runTests() {
    console.log('💬 Starting Real-time Messaging Tests...\n');
    console.log(`📍 Testing against: ${this.baseURL}\n`);

    try {
      // Test 1: Create test users and authenticate
      await this.createTestUsers();
      
      // Test 2: Create a match between users
      await this.createTestMatch();
      
      // Test 3: Create conversation from match
      await this.createConversation();
      
      // Test 4: Test Socket.io connections
      await this.testSocketConnections();
      
      // Test 5: Test real-time messaging
      await this.testRealTimeMessaging();
      
      // Test 6: Test conversation retrieval
      await this.testConversationRetrieval();
      
      // Test 7: Test message history
      await this.testMessageHistory();

      console.log('\n✅ All messaging tests passed successfully!');
      console.log('\n📊 Real-time Messaging Test Summary:');
      console.log('- User authentication: ✅');
      console.log('- Match creation: ✅');
      console.log('- Conversation creation: ✅');
      console.log('- Socket.io connections: ✅');
      console.log('- Real-time messaging: ✅');
      console.log('- Message history: ✅');

    } catch (error) {
      console.error('\n❌ Messaging test failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    } finally {
      // Clean up socket connections
      this.sockets.forEach(socket => {
        if (socket.connected) {
          socket.disconnect();
        }
      });
    }
  }

  async createTestUsers() {
    console.log('👥 Creating test users for messaging...');
    
    const testUserData = [
      {
        email: `messaging-user1-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Emma Wilson',
        age: 26,
        gender: 'female',
        dateOfBirth: '1997-01-01',
        location: {
          coordinates: [-122.4194, 37.7749], // San Francisco
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        }
      },
      {
        email: `messaging-user2-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'James Brown',
        age: 28,
        gender: 'male',
        dateOfBirth: '1995-01-01',
        location: {
          coordinates: [-122.4094, 37.7849], // Close to San Francisco
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

  async createTestMatch() {
    console.log('\n🎯 Creating test match between users...');
    
    const user1 = this.users[0];
    const user2 = this.users[1];
    
    // User 1 likes User 2
    const headers1 = {
      'Authorization': `Bearer ${user1.accessToken}`,
      'Content-Type': 'application/json'
    };

    await axios.post(`${this.baseURL}/api/discovery/swipe`, {
      targetUserId: user2.userId,
      action: 'like'
    }, { headers: headers1 });

    // User 2 likes User 1 back (creating a match)
    const headers2 = {
      'Authorization': `Bearer ${user2.accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(`${this.baseURL}/api/discovery/swipe`, {
      targetUserId: user1.userId,
      action: 'like'
    }, { headers: headers2 });
    
    if (response.status === 200 && response.data.success && response.data.data.isMatch) {
      this.matchId = response.data.data.matchId;
      console.log('✅ Match created successfully');
      console.log(`   Match ID: ${this.matchId}`);
    } else {
      throw new Error('Failed to create match');
    }
  }

  async createConversation() {
    console.log('\n💬 Creating conversation from match...');
    
    const user1 = this.users[0];
    const headers = {
      'Authorization': `Bearer ${user1.accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(`${this.baseURL}/api/conversations`, {
      matchId: this.matchId
    }, { headers });
    
    if (response.status === 201 && response.data.success) {
      this.conversationId = response.data.data.conversation._id;
      console.log('✅ Conversation created successfully');
      console.log(`   Conversation ID: ${this.conversationId}`);
    } else {
      throw new Error('Failed to create conversation');
    }
  }

  async testSocketConnections() {
    console.log('\n🔌 Testing Socket.io connections...');
    
    return new Promise((resolve, reject) => {
      let connectedCount = 0;
      const expectedConnections = 2;
      
      this.users.forEach((user, index) => {
        const socket = io(this.baseURL, {
          auth: {
            token: user.accessToken
          },
          transports: ['websocket']
        });
        
        socket.on('connect', () => {
          console.log(`✅ Socket connected for ${user.name}`);
          connectedCount++;
          
          if (connectedCount === expectedConnections) {
            console.log('✅ All socket connections established');
            resolve();
          }
        });
        
        socket.on('connect_error', (error) => {
          console.error(`❌ Socket connection failed for ${user.name}:`, error.message);
          reject(error);
        });
        
        this.sockets.push(socket);
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (connectedCount < expectedConnections) {
          reject(new Error('Socket connection timeout'));
        }
      }, 10000);
    });
  }

  async testRealTimeMessaging() {
    console.log('\n📤 Testing real-time messaging...');
    
    return new Promise((resolve, reject) => {
      const user1 = this.users[0];
      const user2 = this.users[1];
      const socket1 = this.sockets[0];
      const socket2 = this.sockets[1];
      
      let messagesReceived = 0;
      const expectedMessages = 2;
      
      // Set up message listeners
      socket1.on('new_message', (message) => {
        console.log(`✅ User 1 received message: ${message.content.text}`);
        messagesReceived++;
        if (messagesReceived === expectedMessages) {
          resolve();
        }
      });
      
      socket2.on('new_message', (message) => {
        console.log(`✅ User 2 received message: ${message.content.text}`);
        messagesReceived++;
        if (messagesReceived === expectedMessages) {
          resolve();
        }
      });
      
      // Join conversation rooms
      socket1.emit('join_conversation', { conversationId: this.conversationId });
      socket2.emit('join_conversation', { conversationId: this.conversationId });
      
      // Wait a bit for room joining
      setTimeout(async () => {
        try {
          // Send messages via REST API
          const headers1 = {
            'Authorization': `Bearer ${user1.accessToken}`,
            'Content-Type': 'application/json'
          };
          
          const headers2 = {
            'Authorization': `Bearer ${user2.accessToken}`,
            'Content-Type': 'application/json'
          };
          
          // User 1 sends a message
          await axios.post(`${this.baseURL}/api/conversations/${this.conversationId}/messages`, {
            content: 'Hello from User 1! 👋',
            type: 'text'
          }, { headers: headers1 });
          
          // User 2 sends a message
          setTimeout(async () => {
            await axios.post(`${this.baseURL}/api/conversations/${this.conversationId}/messages`, {
              content: 'Hello back from User 2! 😊',
              type: 'text'
            }, { headers: headers2 });
          }, 1000);
          
        } catch (error) {
          reject(error);
        }
      }, 2000);
      
      // Timeout after 15 seconds
      setTimeout(() => {
        if (messagesReceived < expectedMessages) {
          reject(new Error(`Real-time messaging timeout. Received ${messagesReceived}/${expectedMessages} messages`));
        }
      }, 15000);
    });
  }

  async testConversationRetrieval() {
    console.log('\n📋 Testing conversation retrieval...');
    
    const user1 = this.users[0];
    const headers = {
      'Authorization': `Bearer ${user1.accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${this.baseURL}/api/conversations`, { headers });
    
    if (response.status === 200 && response.data.success) {
      const conversations = response.data.data.conversations;
      console.log('✅ Conversations retrieved successfully');
      console.log(`   Conversations found: ${conversations.length}`);
      
      if (conversations.length > 0) {
        const firstConversation = conversations[0];
        console.log(`   First conversation ID: ${firstConversation._id}`);
        console.log(`   Other user: ${firstConversation.otherUser?.profile.name}`);
      }
    } else {
      throw new Error('Failed to retrieve conversations');
    }
  }

  async testMessageHistory() {
    console.log('\n📜 Testing message history retrieval...');
    
    const user1 = this.users[0];
    const headers = {
      'Authorization': `Bearer ${user1.accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${this.baseURL}/api/conversations/${this.conversationId}/messages`, { headers });
    
    if (response.status === 200 && response.data.success) {
      const messages = response.data.data.messages;
      console.log('✅ Message history retrieved successfully');
      console.log(`   Messages found: ${messages.length}`);
      
      if (messages.length > 0) {
        console.log('   Recent messages:');
        messages.forEach((msg, index) => {
          console.log(`     ${index + 1}. ${msg.sender.profile.name}: ${msg.content.text}`);
        });
      }
    } else {
      throw new Error('Failed to retrieve message history');
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new MessagingTester();
  
  tester.runTests()
    .then(() => {
      console.log('\n🎉 All messaging tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Messaging test suite failed:', error.message);
      process.exit(1);
    });
}

module.exports = MessagingTester;