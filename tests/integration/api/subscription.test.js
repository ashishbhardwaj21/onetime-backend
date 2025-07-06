/**
 * Integration Tests for Subscription API
 * Tests complete subscription workflow through HTTP endpoints
 */

const request = require('supertest');
const User = require('../../../models/User');

describe('Subscription API Integration Tests', () => {
  let app;
  let testUser;
  let authToken;

  beforeAll(async () => {
    // Create test server
    app = global.testUtils.createTestServer();
    
    // Add subscription routes
    const subscriptionRoutes = require('../../../routes/subscription');
    const authenticateToken = require('../../../middleware/auth').authenticateToken;
    app.use('/api/subscription', authenticateToken, subscriptionRoutes);
    
    // Mock external services
    global.testUtils.mockStripe();
  });

  beforeEach(async () => {
    testUser = await global.testUtils.createTestUser({
      email: global.testUtils.generateTestData.email()
    });
    authToken = global.testUtils.generateTestToken(testUser._id);
  });

  describe('GET /api/subscription/tiers', () => {
    test('should return subscription tiers', async () => {
      const response = await request(app)
        .get('/api/subscription/tiers')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      global.testUtils.validateApiResponse(response.body, ['tiers', 'addOns', 'promotions']);
      
      expect(response.body.data.tiers).toHaveProperty('free');
      expect(response.body.data.tiers).toHaveProperty('premium');
      expect(response.body.data.tiers).toHaveProperty('vip');
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/subscription/tiers')
        .expect(401);
    });
  });

  describe('GET /api/subscription/status', () => {
    test('should return subscription status for free user', async () => {
      const response = await request(app)
        .get('/api/subscription/status')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      global.testUtils.validateApiResponse(response.body, ['currentSubscription', 'usage', 'recommendations']);
      
      expect(response.body.data.currentSubscription.tier).toBe('free');
      expect(response.body.data.recommendations).toBeInstanceOf(Array);
    });

    test('should return subscription status for premium user', async () => {
      // Update user to premium
      testUser.subscription = {
        tier: 'premium',
        status: 'active',
        features: {
          dailyLikes: 100,
          advancedFilters: true,
          seeWhoLikesYou: true
        }
      };
      await testUser.save();

      const response = await request(app)
        .get('/api/subscription/status')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.currentSubscription.tier).toBe('premium');
      expect(response.body.data.currentSubscription.features.dailyLikes).toBe(100);
    });
  });

  describe('POST /api/subscription/create', () => {
    test('should create premium subscription', async () => {
      const subscriptionData = {
        tierId: 'premium',
        paymentMethodId: 'pm_test_card_visa'
      };

      const response = await request(app)
        .post('/api/subscription/create')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(subscriptionData)
        .expect(201);

      global.testUtils.validateApiResponse(response.body, ['subscription', 'clientSecret', 'tier']);
      
      expect(response.body.data.tier).toBe('premium');
      expect(response.body.data.features).toHaveProperty('dailyLikes', 100);

      // Verify user was updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.subscription.tier).toBe('premium');
    });

    test('should create VIP subscription with promotion', async () => {
      const subscriptionData = {
        tierId: 'vip',
        paymentMethodId: 'pm_test_card_visa',
        promotionCode: 'new_user_50_off'
      };

      const response = await request(app)
        .post('/api/subscription/create')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(subscriptionData)
        .expect(201);

      expect(response.body.data.tier).toBe('vip');
      expect(response.body.data.features.passportMode).toBe(true);
    });

    test('should reject invalid subscription tier', async () => {
      const subscriptionData = {
        tierId: 'invalid_tier',
        paymentMethodId: 'pm_test_card_visa'
      };

      const response = await request(app)
        .post('/api/subscription/create')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(subscriptionData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid subscription tier');
    });

    test('should require payment method', async () => {
      const subscriptionData = {
        tierId: 'premium'
        // Missing paymentMethodId
      };

      const response = await request(app)
        .post('/api/subscription/create')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(subscriptionData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });
  });

  describe('POST /api/subscription/cancel', () => {
    beforeEach(async () => {
      // Set up active subscription
      testUser.subscription = {
        tier: 'premium',
        status: 'active',
        stripeSubscriptionId: 'sub_test123',
        startDate: new Date(),
        autoRenew: true
      };
      await testUser.save();
    });

    test('should cancel subscription at period end', async () => {
      const response = await request(app)
        .post('/api/subscription/cancel')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({ immediate: false, reason: 'too_expensive' })
        .expect(200);

      global.testUtils.validateApiResponse(response.body, ['canceled', 'immediate', 'accessUntil']);
      
      expect(response.body.data.canceled).toBe(true);
      expect(response.body.data.immediate).toBe(false);

      // Verify user analytics recorded reason
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.analytics.cancellationReasons).toHaveLength(1);
      expect(updatedUser.analytics.cancellationReasons[0].reason).toBe('too_expensive');
    });

    test('should cancel subscription immediately', async () => {
      const response = await request(app)
        .post('/api/subscription/cancel')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({ immediate: true })
        .expect(200);

      expect(response.body.data.immediate).toBe(true);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.subscription.tier).toBe('free');
    });

    test('should reject cancellation for free user', async () => {
      const freeUser = await global.testUtils.createTestUser({
        email: global.testUtils.generateTestData.email()
      });
      const freeToken = global.testUtils.generateTestToken(freeUser._id);

      const response = await request(app)
        .post('/api/subscription/cancel')
        .set(global.testUtils.getAuthHeaders(freeToken))
        .send({ immediate: false })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/subscription/addon/purchase', () => {
    test('should purchase boost add-on', async () => {
      const addOnData = {
        addOnId: 'boost',
        paymentMethodId: 'pm_test_card_visa',
        quantity: 1
      };

      const response = await request(app)
        .post('/api/subscription/addon/purchase')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(addOnData)
        .expect(201);

      global.testUtils.validateApiResponse(response.body, ['addOn', 'quantity', 'applied']);
      
      expect(response.body.data.addOn.id).toBe('boost');
      expect(response.body.data.applied).toBe(true);
    });

    test('should purchase multiple super likes packs', async () => {
      const addOnData = {
        addOnId: 'super_likes_pack',
        paymentMethodId: 'pm_test_card_visa',
        quantity: 3
      };

      const response = await request(app)
        .post('/api/subscription/addon/purchase')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(addOnData)
        .expect(201);

      expect(response.body.data.quantity).toBe(3);

      // Verify user received super likes
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.addOns.superLikes).toBe(30); // 10 per pack * 3
    });

    test('should reject invalid add-on', async () => {
      const addOnData = {
        addOnId: 'invalid_addon',
        paymentMethodId: 'pm_test_card_visa'
      };

      const response = await request(app)
        .post('/api/subscription/addon/purchase')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(addOnData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/subscription/feature/:featureName/access', () => {
    test('should check feature access for free user', async () => {
      const response = await request(app)
        .get('/api/subscription/feature/advancedFilters/access')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      global.testUtils.validateApiResponse(response.body, ['featureName', 'hasAccess', 'tier']);
      
      expect(response.body.data.featureName).toBe('advancedFilters');
      expect(response.body.data.hasAccess).toBe(false);
      expect(response.body.data.tier).toBe('free');
      expect(response.body.data.upgradeRequired).toBe(true);
    });

    test('should check feature access for premium user', async () => {
      testUser.subscription = {
        tier: 'premium',
        status: 'active'
      };
      await testUser.save();

      const response = await request(app)
        .get('/api/subscription/feature/advancedFilters/access')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.hasAccess).toBe(true);
      expect(response.body.data.upgradeRequired).toBe(false);
    });
  });

  describe('GET /api/subscription/limits/:limitType/check', () => {
    test('should check usage limits for free user', async () => {
      const response = await request(app)
        .get('/api/subscription/limits/conversationsPerDay/check')
        .query({ currentUsage: 3 })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      global.testUtils.validateApiResponse(response.body, ['limitType', 'currentUsage', 'withinLimits']);
      
      expect(response.body.data.withinLimits).toBe(true);
      expect(response.body.data.currentUsage).toBe(3);
    });

    test('should check exceeded limits for free user', async () => {
      const response = await request(app)
        .get('/api/subscription/limits/conversationsPerDay/check')
        .query({ currentUsage: 10 })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.withinLimits).toBe(false);
    });

    test('should allow unlimited usage for VIP user', async () => {
      testUser.subscription = {
        tier: 'vip',
        status: 'active'
      };
      await testUser.save();

      const response = await request(app)
        .get('/api/subscription/limits/conversationsPerDay/check')
        .query({ currentUsage: 100 })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.withinLimits).toBe(true);
    });
  });

  describe('POST /api/subscription/promotion/validate', () => {
    test('should validate correct promotion code', async () => {
      const response = await request(app)
        .post('/api/subscription/promotion/validate')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({ promotionCode: 'new_user_50_off' })
        .expect(200);

      global.testUtils.validateApiResponse(response.body, ['valid', 'couponId']);
      
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.couponId).toBeDefined();
    });

    test('should reject invalid promotion code', async () => {
      const response = await request(app)
        .post('/api/subscription/promotion/validate')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({ promotionCode: 'invalid_promo' })
        .expect(400);

      expect(response.body.data.valid).toBe(false);
    });

    test('should require promotion code', async () => {
      const response = await request(app)
        .post('/api/subscription/promotion/validate')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /api/subscription/billing/history', () => {
    beforeEach(async () => {
      // Add purchase history
      testUser.billing = {
        purchaseHistory: [
          {
            type: 'subscription',
            amount: 1999,
            currency: 'usd',
            status: 'succeeded',
            purchasedAt: new Date()
          },
          {
            type: 'addon',
            addOnId: 'boost',
            amount: 499,
            currency: 'usd',
            status: 'succeeded',
            purchasedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        ]
      };
      await testUser.save();
    });

    test('should return billing history', async () => {
      const response = await request(app)
        .get('/api/subscription/billing/history')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      global.testUtils.validateApiResponse(response.body, ['history', 'total', 'currentSubscription']);
      
      expect(response.body.data.history).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.history[0].amount).toBe(1999);
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/subscription/billing/history')
        .query({ limit: 1, offset: 0 })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data.history).toHaveLength(1);
    });
  });

  describe('POST /api/subscription/pause', () => {
    beforeEach(async () => {
      testUser.subscription = {
        tier: 'premium',
        status: 'active',
        stripeSubscriptionId: 'sub_test123'
      };
      await testUser.save();
    });

    test('should pause subscription', async () => {
      const response = await request(app)
        .post('/api/subscription/pause')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({ pauseDuration: 30 })
        .expect(200);

      global.testUtils.validateApiResponse(response.body, ['pausedAt', 'resumesAt', 'pauseDuration']);
      
      expect(response.body.data.pauseDuration).toBe(30);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.subscription.status).toBe('paused');
    });

    test('should reject pause for free user', async () => {
      const freeUser = await global.testUtils.createTestUser({
        email: global.testUtils.generateTestData.email()
      });
      const freeToken = global.testUtils.generateTestToken(freeUser._id);

      const response = await request(app)
        .post('/api/subscription/pause')
        .set(global.testUtils.getAuthHeaders(freeToken))
        .send({ pauseDuration: 30 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/subscription/resume', () => {
    beforeEach(async () => {
      testUser.subscription = {
        tier: 'premium',
        status: 'paused',
        stripeSubscriptionId: 'sub_test123',
        pausedAt: new Date(),
        resumesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };
      await testUser.save();
    });

    test('should resume paused subscription', async () => {
      const response = await request(app)
        .post('/api/subscription/resume')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      global.testUtils.validateApiResponse(response.body, ['resumedAt', 'status']);
      
      expect(response.body.data.status).toBe('active');

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.subscription.status).toBe('active');
      expect(updatedUser.subscription.pausedAt).toBeUndefined();
    });

    test('should reject resume for active subscription', async () => {
      testUser.subscription.status = 'active';
      await testUser.save();

      const response = await request(app)
        .post('/api/subscription/resume')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed requests gracefully', async () => {
      const response = await request(app)
        .post('/api/subscription/create')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send('invalid json')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle concurrent subscription operations', async () => {
      const subscriptionData = {
        tierId: 'premium',
        paymentMethodId: 'pm_test_card_visa'
      };

      // Make concurrent requests
      const requests = [
        request(app)
          .post('/api/subscription/create')
          .set(global.testUtils.getAuthHeaders(authToken))
          .send(subscriptionData),
        request(app)
          .post('/api/subscription/create')
          .set(global.testUtils.getAuthHeaders(authToken))
          .send(subscriptionData)
      ];

      const results = await Promise.allSettled(requests);
      
      // At least one should succeed or fail gracefully
      expect(results.some(r => r.status === 'fulfilled')).toBe(true);
    });

    test('should validate authentication token expiry', async () => {
      const expiredToken = global.testUtils.generateTestToken(testUser._id, '-1h');

      const response = await request(app)
        .get('/api/subscription/status')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});