/**
 * Test Setup Configuration
 * Sets up testing environment, database connections, and test utilities
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('dotenv').config({ path: '.env.test' });

let mongoServer;

// Global test setup
beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
  
  // Start in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect to test database
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  
  console.log('✅ Test database connected');
});

// Global test teardown
afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  
  // Close database connection
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  
  // Stop MongoDB instance
  await mongoServer.stop();
  
  console.log('✅ Test environment cleaned up');
});

// Clear database between tests
beforeEach(async () => {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Test utilities
global.testUtils = {
  // Create test user
  createTestUser: async (overrides = {}) => {
    const User = require('../models/User');
    const bcrypt = require('bcryptjs');
    
    const defaultUser = {
      email: 'test@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      profile: {
        name: 'Test User',
        age: 25,
        dateOfBirth: new Date('1998-01-01'),
        gender: 'male',
        bio: 'Test bio',
        location: {
          type: 'Point',
          coordinates: [-74.0059, 40.7128], // NYC
          city: 'New York',
          state: 'NY',
          country: 'US'
        }
      },
      verification: {
        email: { verified: true }
      },
      ...overrides
    };
    
    return await User.create(defaultUser);
  },
  
  // Create test activity
  createTestActivity: async (overrides = {}) => {
    const Activity = require('../models/Activity');
    
    const defaultActivity = {
      title: 'Test Activity',
      description: 'Test activity description',
      category: 'dining',
      location: {
        type: 'Point',
        coordinates: [-74.0059, 40.7128],
        address: 'Test Address, New York, NY'
      },
      dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      maxParticipants: 4,
      participants: [],
      ...overrides
    };
    
    return await Activity.create(defaultActivity);
  },
  
  // Create test match
  createTestMatch: async (user1, user2, overrides = {}) => {
    const Match = require('../models/Match');
    
    const defaultMatch = {
      user1: user1._id,
      user2: user2._id,
      status: 'pending',
      matchedAt: new Date(),
      ...overrides
    };
    
    return await Match.create(defaultMatch);
  },
  
  // Generate JWT token for testing
  generateTestToken: (userId) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '1h'
    });
  },
  
  // Create authenticated request headers
  getAuthHeaders: (token) => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }),
  
  // Wait for async operations
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Mock external services
  mockStripe: () => {
    const stripe = require('stripe');
    jest.mock('stripe', () => ({
      customers: {
        create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
        retrieve: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
        update: jest.fn().mockResolvedValue({ id: 'cus_test123' })
      },
      subscriptions: {
        create: jest.fn().mockResolvedValue({ 
          id: 'sub_test123', 
          status: 'active',
          latest_invoice: { payment_intent: { client_secret: 'pi_test_secret' } }
        }),
        update: jest.fn().mockResolvedValue({ id: 'sub_test123' }),
        retrieve: jest.fn().mockResolvedValue({ id: 'sub_test123' })
      },
      paymentIntents: {
        create: jest.fn().mockResolvedValue({ 
          id: 'pi_test123', 
          status: 'succeeded' 
        })
      }
    }));
  },
  
  // Mock Firebase Admin
  mockFirebaseAdmin: () => {
    jest.mock('firebase-admin', () => ({
      messaging: () => ({
        send: jest.fn().mockResolvedValue({ messageId: 'test_message_id' }),
        sendMulticast: jest.fn().mockResolvedValue({ 
          successCount: 1, 
          failureCount: 0 
        })
      }),
      initializeApp: jest.fn(),
      credential: {
        cert: jest.fn()
      }
    }));
  },
  
  // Mock Cloudinary
  mockCloudinary: () => {
    jest.mock('cloudinary', () => ({
      v2: {
        uploader: {
          upload_stream: jest.fn().mockImplementation((options, callback) => {
            callback(null, {
              public_id: 'test_photo_123',
              secure_url: 'https://test.cloudinary.com/test_photo_123.jpg',
              width: 1080,
              height: 1080,
              format: 'jpg',
              bytes: 150000
            });
          }),
          destroy: jest.fn().mockResolvedValue({ result: 'ok' })
        }
      }
    }));
  },
  
  // Create test server instance
  createTestServer: () => {
    const express = require('express');
    const cors = require('cors');
    const app = express();
    
    app.use(cors());
    app.use(express.json());
    
    // Add test middleware
    app.use((req, res, next) => {
      req.testing = true;
      next();
    });
    
    return app;
  },
  
  // Validate API response structure
  validateApiResponse: (response, expectedFields = []) => {
    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('message');
    
    if (response.success) {
      expect(response).toHaveProperty('data');
      
      expectedFields.forEach(field => {
        expect(response.data).toHaveProperty(field);
      });
    } else {
      expect(response).toHaveProperty('error');
    }
  },
  
  // Generate test data
  generateTestData: {
    email: () => `test${Date.now()}@example.com`,
    phone: () => `+1555${Math.floor(Math.random() * 1000000).toString().padStart(7, '0')}`,
    coordinates: () => [
      -74.0059 + (Math.random() - 0.5) * 0.1, // NYC area
      40.7128 + (Math.random() - 0.5) * 0.1
    ],
    futureDate: (daysFromNow = 1) => new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000),
    pastDate: (daysAgo = 1) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  }
};

// Jest custom matchers
expect.extend({
  toBeValidObjectId(received) {
    const pass = mongoose.Types.ObjectId.isValid(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid ObjectId`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid ObjectId`,
        pass: false,
      };
    }
  },
  
  toBeWithinRange(received, min, max) {
    const pass = received >= min && received <= max;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${min}-${max}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${min}-${max}`,
        pass: false,
      };
    }
  },
  
  toHaveValidTimestamp(received, field = 'createdAt') {
    const timestamp = received[field];
    const pass = timestamp && timestamp instanceof Date && !isNaN(timestamp.getTime());
    if (pass) {
      return {
        message: () => `expected ${received} not to have valid timestamp in ${field}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to have valid timestamp in ${field}`,
        pass: false,
      };
    }
  }
});

// Console overrides for cleaner test output
const originalConsole = console;
if (process.env.NODE_ENV === 'test') {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  
  // Only show console output in debug mode
  if (process.env.DEBUG_TESTS) {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  }
}

module.exports = {
  mongoServer
};