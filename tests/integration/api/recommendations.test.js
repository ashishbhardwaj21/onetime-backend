/**
 * Recommendations API Integration Tests
 * Tests recommendation endpoints and ML-powered features
 */

const request = require('supertest');
const User = require('../../../models/User');
const Activity = require('../../../models/Activity');
const Interaction = require('../../../models/Interaction');

describe('Recommendations API', () => {
  let app;
  let testUser;
  let authToken;
  let targetUser;
  let testActivity;

  beforeAll(async () => {
    app = global.testUtils.createTestServer();
    
    // Mount recommendation routes
    const recommendationRoutes = require('../../../routes/recommendations');
    const mlAnalyticsRoutes = require('../../../routes/ml-analytics');
    const authenticateToken = require('../../../middleware/auth').authenticateToken;
    
    app.use('/api/recommendations', authenticateToken, recommendationRoutes);
    app.use('/api/ml-analytics', authenticateToken, mlAnalyticsRoutes);
  });

  beforeEach(async () => {
    // Create test user
    testUser = await global.testUtils.createTestUser({
      email: global.testUtils.generateTestData.email(),
      profile: {
        name: 'John Doe',
        age: 28,
        gender: 'male',
        bio: 'Love hiking and coffee',
        location: {
          type: 'Point',
          coordinates: [-74.0059, 40.7128],
          city: 'New York',
          state: 'NY'
        }
      },
      interests: ['hiking', 'coffee', 'technology'],
      preferences: {
        ageRange: { min: 24, max: 32 },
        genderPreference: ['female'],
        maxDistance: 25
      }
    });

    // Create target user for recommendations
    targetUser = await global.testUtils.createTestUser({
      email: global.testUtils.generateTestData.email(),
      profile: {
        name: 'Jane Smith',
        age: 26,
        gender: 'female',
        bio: 'Coffee enthusiast and traveler',
        location: {
          type: 'Point',
          coordinates: [-74.0100, 40.7150],
          city: 'New York',
          state: 'NY'
        }
      },
      interests: ['coffee', 'travel', 'photography'],
      preferences: {
        ageRange: { min: 25, max: 35 },
        genderPreference: ['male']
      }
    });

    // Create test activity
    testActivity = await global.testUtils.createTestActivity({
      organizer: targetUser._id,
      title: 'Coffee Tasting Event',
      description: 'Explore different coffee blends',
      category: 'dining',
      tags: ['coffee', 'social'],
      location: {
        type: 'Point',
        coordinates: [-74.0080, 40.7140],
        address: '123 Coffee St, New York, NY'
      },
      dateTime: global.testUtils.generateTestData.futureDate(3),
      maxParticipants: 10
    });

    authToken = global.testUtils.generateTestToken(testUser._id);

    // Mock external services
    global.testUtils.mockStripe();
    global.testUtils.mockFirebaseAdmin();
    global.testUtils.mockCloudinary();
  });

  describe('GET /api/recommendations/people', () => {
    test('should get person recommendations with default parameters', async () => {
      const response = await request(app)
        .get('/api/recommendations/people')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('recommendations');
      expect(response.body.data).toHaveProperty('count');
      expect(response.body.data.recommendations).toBeArray();
    });

    test('should respect limit parameter', async () => {
      const limit = 5;
      const response = await request(app)
        .get('/api/recommendations/people')
        .query({ limit })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.recommendations.length).toBeLessThanOrEqual(limit);
      expect(response.body.data.options.limit).toBe(limit);
    });

    test('should respect distance parameter', async () => {
      const maxDistance = 10;
      const response = await request(app)
        .get('/api/recommendations/people')
        .query({ maxDistance })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.options.maxDistance).toBe(maxDistance);
    });

    test('should respect age range parameters', async () => {
      const response = await request(app)
        .get('/api/recommendations/people')
        .query({ ageMin: 25, ageMax: 30 })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.options.ageRange).toEqual({
        min: 25,
        max: 30
      });
    });

    test('should validate limit parameter', async () => {
      const response = await request(app)
        .get('/api/recommendations/people')
        .query({ limit: 100 }) // Exceeds max
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('should validate distance parameter', async () => {
      const response = await request(app)
        .get('/api/recommendations/people')
        .query({ maxDistance: 1000 }) // Exceeds max
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle force refresh parameter', async () => {
      const response = await request(app)
        .get('/api/recommendations/people')
        .query({ forceRefresh: 'true' })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.options.forceRefresh).toBe(true);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/recommendations/people')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/recommendations/activities', () => {
    test('should get activity recommendations', async () => {
      const response = await request(app)
        .get('/api/recommendations/activities')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('recommendations');
      expect(response.body.data.recommendations).toBeArray();
    });

    test('should filter by category', async () => {
      const response = await request(app)
        .get('/api/recommendations/activities')
        .query({ category: 'dining' })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.options.category).toBe('dining');
    });

    test('should validate limit for activities', async () => {
      const response = await request(app)
        .get('/api/recommendations/activities')
        .query({ limit: 0 })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/recommendations/people/:recommendedUserId/explanation', () => {
    test('should get recommendation explanation', async () => {
      const response = await request(app)
        .get(`/api/recommendations/people/${targetUser._id}/explanation`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('score');
      expect(response.body.data).toHaveProperty('breakdown');
      expect(response.body.data).toHaveProperty('reasons');
      expect(response.body.data).toHaveProperty('explanation');
    });

    test('should validate user ID format', async () => {
      const response = await request(app)
        .get('/api/recommendations/people/invalid-id/explanation')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('should handle non-existent user', async () => {
      const fakeUserId = global.testUtils.generateTestData.objectId();
      const response = await request(app)
        .get(`/api/recommendations/people/${fakeUserId}/explanation`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/recommendations/feedback', () => {
    test('should submit recommendation feedback', async () => {
      const feedback = {
        recommendationId: 'rec_123',
        action: 'like',
        reasons: ['shared_interests', 'location'],
        confidence: 0.8
      };

      const response = await request(app)
        .post('/api/recommendations/feedback')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(feedback)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.updated).toBe(true);
    });

    test('should validate feedback action', async () => {
      const feedback = {
        recommendationId: 'rec_123',
        action: 'invalid_action'
      };

      const response = await request(app)
        .post('/api/recommendations/feedback')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(feedback)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('should require recommendation ID', async () => {
      const feedback = {
        action: 'like'
      };

      const response = await request(app)
        .post('/api/recommendations/feedback')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(feedback)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should validate confidence range', async () => {
      const feedback = {
        recommendationId: 'rec_123',
        action: 'like',
        confidence: 1.5 // Invalid range
      };

      const response = await request(app)
        .post('/api/recommendations/feedback')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(feedback)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/recommendations/insights', () => {
    test('should get recommendation insights', async () => {
      const response = await request(app)
        .get('/api/recommendations/insights')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('personalizedFactors');
      expect(response.body.data).toHaveProperty('recentPerformance');
      expect(response.body.data).toHaveProperty('preferences');
    });
  });

  describe('GET /api/recommendations/categories/:category', () => {
    test('should get recommendations by category', async () => {
      const response = await request(app)
        .get('/api/recommendations/categories/people')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.category).toBe('people');
      expect(response.body.data.recommendations).toBeDefined();
    });

    test('should validate category parameter', async () => {
      const response = await request(app)
        .get('/api/recommendations/categories/invalid')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/recommendations/refresh', () => {
    test('should refresh recommendations', async () => {
      const response = await request(app)
        .post('/api/recommendations/refresh')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.refreshed).toBe(true);
    });
  });

  describe('GET /api/recommendations/trending', () => {
    test('should get trending recommendations', async () => {
      const response = await request(app)
        .get('/api/recommendations/trending')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('trending');
      expect(response.body.data.trending).toHaveProperty('activities');
      expect(response.body.data.trending).toHaveProperty('people');
      expect(response.body.data.trending).toHaveProperty('insights');
    });

    test('should accept timeframe parameter', async () => {
      const response = await request(app)
        .get('/api/recommendations/trending')
        .query({ timeframe: 'month' })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.timeframe).toBe('month');
    });
  });

  describe('GET /api/recommendations/filters/suggestions', () => {
    test('should get smart filter suggestions', async () => {
      const response = await request(app)
        .get('/api/recommendations/filters/suggestions')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('ageRange');
      expect(response.body.data).toHaveProperty('distance');
      expect(response.body.data).toHaveProperty('interests');
      expect(response.body.data).toHaveProperty('activityTypes');
    });
  });

  describe('ML Analytics Endpoints', () => {
    describe('GET /api/ml-analytics/compatibility/:targetUserId', () => {
      test('should get compatibility prediction', async () => {
        const response = await request(app)
          .get(`/api/ml-analytics/compatibility/${targetUser._id}`)
          .set(global.testUtils.getAuthHeaders(authToken))
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('compatibility');
        expect(response.body.data).toHaveProperty('confidence');
        expect(response.body.data).toHaveProperty('interpretation');
        expect(response.body.data.compatibility).toBeWithin(0, 1);
        expect(response.body.data.confidence).toBeWithin(0, 1);
      });

      test('should validate target user ID', async () => {
        const response = await request(app)
          .get('/api/ml-analytics/compatibility/invalid-id')
          .set(global.testUtils.getAuthHeaders(authToken))
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/ml-analytics/activity-engagement/:activityId', () => {
      test('should get activity engagement prediction', async () => {
        const response = await request(app)
          .get(`/api/ml-analytics/activity-engagement/${testActivity._id}`)
          .set(global.testUtils.getAuthHeaders(authToken))
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('engagementScore');
        expect(response.body.data).toHaveProperty('likelihood');
        expect(response.body.data).toHaveProperty('reasons');
        expect(response.body.data).toHaveProperty('recommendation');
      });
    });

    describe('GET /api/ml-analytics/churn-risk', () => {
      test('should get churn risk assessment', async () => {
        const response = await request(app)
          .get('/api/ml-analytics/churn-risk')
          .set(global.testUtils.getAuthHeaders(authToken))
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('churnRisk');
        expect(response.body.data).toHaveProperty('riskLevel');
        expect(response.body.data).toHaveProperty('interventions');
        expect(response.body.data).toHaveProperty('assessment');
        expect(response.body.data.churnRisk).toBeWithin(0, 1);
      });
    });

    describe('GET /api/ml-analytics/engagement-score', () => {
      test('should get engagement score', async () => {
        const response = await request(app)
          .get('/api/ml-analytics/engagement-score')
          .set(global.testUtils.getAuthHeaders(authToken))
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('engagementLevel');
        expect(response.body.data).toHaveProperty('score');
        expect(response.body.data).toHaveProperty('distribution');
        expect(response.body.data).toHaveProperty('insights');
      });
    });

    describe('POST /api/ml-analytics/feedback', () => {
      test('should submit ML feedback', async () => {
        const feedback = {
          modelType: 'compatibility',
          predictionId: 'pred_123',
          actualOutcome: 'match',
          rating: 4,
          comment: 'Good prediction'
        };

        const response = await request(app)
          .post('/api/ml-analytics/feedback')
          .set(global.testUtils.getAuthHeaders(authToken))
          .send(feedback)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.feedbackId).toBe(feedback.predictionId);
      });

      test('should validate model type', async () => {
        const feedback = {
          modelType: 'invalid',
          predictionId: 'pred_123',
          actualOutcome: 'match'
        };

        const response = await request(app)
          .post('/api/ml-analytics/feedback')
          .set(global.testUtils.getAuthHeaders(authToken))
          .send(feedback)
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      test('should validate rating range', async () => {
        const feedback = {
          modelType: 'compatibility',
          predictionId: 'pred_123',
          actualOutcome: 'match',
          rating: 6 // Invalid range
        };

        const response = await request(app)
          .post('/api/ml-analytics/feedback')
          .set(global.testUtils.getAuthHeaders(authToken))
          .send(feedback)
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/ml-analytics/insights', () => {
      test('should get ML insights dashboard', async () => {
        const response = await request(app)
          .get('/api/ml-analytics/insights')
          .set(global.testUtils.getAuthHeaders(authToken))
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('engagement');
        expect(response.body.data).toHaveProperty('retention');
        expect(response.body.data).toHaveProperty('optimization');
        expect(response.body.data).toHaveProperty('trends');
      });
    });

    describe('POST /api/ml-analytics/batch-compatibility', () => {
      test('should get batch compatibility predictions', async () => {
        const requestBody = {
          targetUserIds: [targetUser._id.toString()]
        };

        const response = await request(app)
          .post('/api/ml-analytics/batch-compatibility')
          .set(global.testUtils.getAuthHeaders(authToken))
          .send(requestBody)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('predictions');
        expect(response.body.data.predictions).toHaveLength(1);
        expect(response.body.data.predictions[0]).toHaveProperty('compatibility');
        expect(response.body.data.predictions[0]).toHaveProperty('success');
      });

      test('should validate array of user IDs', async () => {
        const requestBody = {
          targetUserIds: 'not-an-array'
        };

        const response = await request(app)
          .post('/api/ml-analytics/batch-compatibility')
          .set(global.testUtils.getAuthHeaders(authToken))
          .send(requestBody)
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      test('should limit batch size', async () => {
        const targetUserIds = Array(15).fill().map(() => 
          global.testUtils.generateTestData.objectId()
        );

        const requestBody = { targetUserIds };

        const response = await request(app)
          .post('/api/ml-analytics/batch-compatibility')
          .set(global.testUtils.getAuthHeaders(authToken))
          .send(requestBody)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Maximum 10 users');
      });
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits on recommendation endpoints', async () => {
      // Make many requests quickly
      const requests = Array(60).fill().map(() =>
        request(app)
          .get('/api/recommendations/people')
          .set(global.testUtils.getAuthHeaders(authToken))
      );

      const responses = await Promise.allSettled(requests);
      
      // Some requests should be rate limited
      const rateLimited = responses.filter(
        result => result.value?.status === 429
      );
      
      expect(rateLimited.length).toBeGreaterThan(0);
    }, 10000);

    test('should enforce stricter rate limits on ML endpoints', async () => {
      const requests = Array(35).fill().map(() =>
        request(app)
          .get('/api/ml-analytics/churn-risk')
          .set(global.testUtils.getAuthHeaders(authToken))
      );

      const responses = await Promise.allSettled(requests);
      
      const rateLimited = responses.filter(
        result => result.value?.status === 429
      );
      
      expect(rateLimited.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      // Mock database error
      const originalFind = User.find;
      User.find = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/recommendations/people')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get recommendations');

      // Restore original method
      User.find = originalFind;
    });

    test('should handle ML service errors gracefully', async () => {
      const response = await request(app)
        .get(`/api/ml-analytics/compatibility/${global.testUtils.generateTestData.objectId()}`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Performance', () => {
    test('should respond to recommendations within reasonable time', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/recommendations/people')
        .query({ limit: 10 })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(3000); // Should respond within 3 seconds
      expect(response.body.success).toBe(true);
    });

    test('should handle concurrent requests efficiently', async () => {
      const requests = Array(10).fill().map(() =>
        request(app)
          .get('/api/recommendations/people')
          .query({ limit: 5 })
          .set(global.testUtils.getAuthHeaders(authToken))
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // All requests within 5 seconds
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });
});