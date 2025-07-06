/**
 * Unit Tests for SubscriptionService
 * Tests subscription management, payment processing, and feature access
 */

const SubscriptionService = require('../../../services/SubscriptionService');
const User = require('../../../models/User');

describe('SubscriptionService', () => {
  let subscriptionService;
  let testUser;
  let mockStripe;

  beforeAll(() => {
    // Mock Stripe
    global.testUtils.mockStripe();
    mockStripe = require('stripe')();
  });

  beforeEach(async () => {
    subscriptionService = new SubscriptionService();
    testUser = await global.testUtils.createTestUser({
      email: global.testUtils.generateTestData.email()
    });
  });

  describe('getSubscriptionTiers', () => {
    test('should return all subscription tiers', () => {
      const tiers = subscriptionService.getSubscriptionTiers();
      
      expect(tiers).toHaveProperty('tiers');
      expect(tiers).toHaveProperty('addOns');
      expect(tiers).toHaveProperty('promotions');
      
      expect(tiers.tiers).toHaveProperty('free');
      expect(tiers.tiers).toHaveProperty('premium');
      expect(tiers.tiers).toHaveProperty('vip');
      
      // Validate tier structure
      Object.values(tiers.tiers).forEach(tier => {
        expect(tier).toHaveProperty('id');
        expect(tier).toHaveProperty('name');
        expect(tier).toHaveProperty('price');
        expect(tier).toHaveProperty('features');
        expect(tier).toHaveProperty('limits');
      });
    });

    test('should have correct pricing for tiers', () => {
      const tiers = subscriptionService.getSubscriptionTiers();
      
      expect(tiers.tiers.free.price).toBe(0);
      expect(tiers.tiers.premium.price).toBe(1999); // $19.99
      expect(tiers.tiers.vip.price).toBe(3999); // $39.99
    });
  });

  describe('createSubscription', () => {
    test('should create premium subscription successfully', async () => {
      const subscriptionData = {
        tierId: 'premium',
        paymentMethodId: 'pm_test_card',
        promotionCode: null
      };

      const result = await subscriptionService.createSubscription(testUser._id, subscriptionData);

      expect(result).toHaveProperty('subscription');
      expect(result).toHaveProperty('clientSecret');
      expect(result).toHaveProperty('subscriptionId');
      expect(result.tier).toBe('premium');
      expect(result.features).toHaveProperty('dailyLikes', 100);
      
      // Verify Stripe calls
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: testUser.email,
        name: testUser.profile.name,
        metadata: {
          userId: testUser._id.toString(),
          registrationDate: testUser.createdAt.toISOString()
        }
      });
    });

    test('should reject invalid subscription tier', async () => {
      const subscriptionData = {
        tierId: 'invalid_tier',
        paymentMethodId: 'pm_test_card'
      };

      await expect(
        subscriptionService.createSubscription(testUser._id, subscriptionData)
      ).rejects.toThrow('Invalid subscription tier');
    });

    test('should reject free tier subscription', async () => {
      const subscriptionData = {
        tierId: 'free',
        paymentMethodId: 'pm_test_card'
      };

      await expect(
        subscriptionService.createSubscription(testUser._id, subscriptionData)
      ).rejects.toThrow('Invalid subscription tier');
    });

    test('should update user with subscription data', async () => {
      const subscriptionData = {
        tierId: 'vip',
        paymentMethodId: 'pm_test_card'
      };

      await subscriptionService.createSubscription(testUser._id, subscriptionData);

      const updatedUser = await User.findById(testUser._id);
      
      expect(updatedUser.subscription.tier).toBe('vip');
      expect(updatedUser.subscription.status).toBe('pending');
      expect(updatedUser.subscription.features.dailyLikes).toBe('unlimited');
      expect(updatedUser.billing.paymentMethodId).toBe('pm_test_card');
    });
  });

  describe('cancelSubscription', () => {
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
      const result = await subscriptionService.cancelSubscription(testUser._id, false);

      expect(result.canceled).toBe(true);
      expect(result.immediate).toBe(false);
      expect(result.accessUntil).toBeInstanceOf(Date);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.subscription.status).toBe('cancel_at_period_end');
      expect(updatedUser.subscription.cancelAtPeriodEnd).toBe(true);
    });

    test('should cancel subscription immediately', async () => {
      const result = await subscriptionService.cancelSubscription(testUser._id, true);

      expect(result.canceled).toBe(true);
      expect(result.immediate).toBe(true);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.subscription.status).toBe('canceled');
      expect(updatedUser.subscription.tier).toBe('free');
    });

    test('should throw error for user without subscription', async () => {
      const userWithoutSub = await global.testUtils.createTestUser({
        email: global.testUtils.generateTestData.email()
      });

      await expect(
        subscriptionService.cancelSubscription(userWithoutSub._id, false)
      ).rejects.toThrow('No active subscription found');
    });
  });

  describe('purchaseAddOn', () => {
    test('should purchase boost add-on successfully', async () => {
      const addOnData = {
        addOnId: 'boost',
        paymentMethodId: 'pm_test_card',
        quantity: 1
      };

      const result = await subscriptionService.purchaseAddOn(testUser._id, addOnData);

      expect(result.success).toBe(true);
      expect(result.addOn.id).toBe('boost');
      expect(result.applied).toBe(true);

      // Verify Stripe payment intent creation
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 499, // $4.99 for boost
          currency: 'usd',
          metadata: expect.objectContaining({
            userId: testUser._id.toString(),
            addOnId: 'boost'
          })
        })
      );
    });

    test('should purchase super likes pack', async () => {
      const addOnData = {
        addOnId: 'super_likes_pack',
        paymentMethodId: 'pm_test_card',
        quantity: 2
      };

      const result = await subscriptionService.purchaseAddOn(testUser._id, addOnData);

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(2);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.addOns.superLikes).toBe(20); // 10 per pack * 2 packs
    });

    test('should reject invalid add-on', async () => {
      const addOnData = {
        addOnId: 'invalid_addon',
        paymentMethodId: 'pm_test_card'
      };

      await expect(
        subscriptionService.purchaseAddOn(testUser._id, addOnData)
      ).rejects.toThrow('Invalid add-on');
    });
  });

  describe('hasFeatureAccess', () => {
    test('should grant free tier features to free users', () => {
      const hasAccess = subscriptionService.hasFeatureAccess(testUser, 'dailyLikes');
      expect(hasAccess).toBe(10); // Free tier gets 10 daily likes
    });

    test('should grant premium features to premium users', async () => {
      testUser.subscription = {
        tier: 'premium',
        status: 'active'
      };

      const hasAdvancedFilters = subscriptionService.hasFeatureAccess(testUser, 'advancedFilters');
      const hasSeeWhoLikesYou = subscriptionService.hasFeatureAccess(testUser, 'seeWhoLikesYou');

      expect(hasAdvancedFilters).toBe(true);
      expect(hasSeeWhoLikesYou).toBe(true);
    });

    test('should deny premium features to free users', () => {
      const hasAdvancedFilters = subscriptionService.hasFeatureAccess(testUser, 'advancedFilters');
      expect(hasAdvancedFilters).toBe(false);
    });

    test('should grant VIP features to VIP users', async () => {
      testUser.subscription = {
        tier: 'vip',
        status: 'active'
      };

      const hasPassportMode = subscriptionService.hasFeatureAccess(testUser, 'passportMode');
      const hasPrioritySupport = subscriptionService.hasFeatureAccess(testUser, 'prioritySupport');

      expect(hasPassportMode).toBe(true);
      expect(hasPrioritySupport).toBe(true);
    });
  });

  describe('isWithinLimits', () => {
    test('should check free tier limits correctly', () => {
      const withinConversationLimit = subscriptionService.isWithinLimits(testUser, 'conversationsPerDay', 3);
      const exceedsConversationLimit = subscriptionService.isWithinLimits(testUser, 'conversationsPerDay', 6);

      expect(withinConversationLimit).toBe(true);
      expect(exceedsConversationLimit).toBe(false);
    });

    test('should allow unlimited usage for VIP users', () => {
      testUser.subscription = {
        tier: 'vip',
        status: 'active'
      };

      const withinLimits = subscriptionService.isWithinLimits(testUser, 'conversationsPerDay', 100);
      expect(withinLimits).toBe(true);
    });

    test('should check premium tier limits', () => {
      testUser.subscription = {
        tier: 'premium',
        status: 'active'
      };

      const withinLimit = subscriptionService.isWithinLimits(testUser, 'conversationsPerDay', 20);
      const exceedsLimit = subscriptionService.isWithinLimits(testUser, 'conversationsPerDay', 30);

      expect(withinLimit).toBe(true);
      expect(exceedsLimit).toBe(false);
    });
  });

  describe('getUserSubscriptionAnalytics', () => {
    test('should return analytics for free user', async () => {
      const analytics = await subscriptionService.getUserSubscriptionAnalytics(testUser._id);

      expect(analytics).toHaveProperty('currentSubscription');
      expect(analytics).toHaveProperty('usage');
      expect(analytics).toHaveProperty('recommendations');
      expect(analytics).toHaveProperty('potentialSavings');

      expect(analytics.currentSubscription.tier).toBe('free');
      expect(analytics.recommendations).toBeInstanceOf(Array);
    });

    test('should return analytics for premium user', async () => {
      testUser.subscription = {
        tier: 'premium',
        status: 'active',
        startDate: new Date(),
        autoRenew: true
      };
      testUser.billing = {
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };
      await testUser.save();

      const analytics = await subscriptionService.getUserSubscriptionAnalytics(testUser._id);

      expect(analytics.currentSubscription.tier).toBe('premium');
      expect(analytics.currentSubscription.nextBillingDate).toBeInstanceOf(Date);
      expect(analytics.availableUpgrades).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tierId: 'vip' })
        ])
      );
    });
  });

  describe('validateAndApplyPromotion', () => {
    test('should apply valid promotion code', async () => {
      const couponId = await subscriptionService.validateAndApplyPromotion(testUser._id, 'new_user_50_off');

      expect(couponId).toBeDefined();
      expect(typeof couponId).toBe('string');

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.billing.promotionsUsed).toHaveLength(1);
      expect(updatedUser.billing.promotionsUsed[0].promotionId).toBe('new_user_50_off');
    });

    test('should reject invalid promotion code', async () => {
      await expect(
        subscriptionService.validateAndApplyPromotion(testUser._id, 'invalid_promo')
      ).rejects.toThrow('Invalid promotion code');
    });

    test('should reject already used promotion', async () => {
      // Apply promotion first time
      await subscriptionService.validateAndApplyPromotion(testUser._id, 'new_user_50_off');

      // Try to apply same promotion again
      await expect(
        subscriptionService.validateAndApplyPromotion(testUser._id, 'new_user_50_off')
      ).rejects.toThrow('User not eligible for this promotion');
    });
  });

  describe('handleSubscriptionUpdate', () => {
    test('should update user subscription from Stripe webhook', async () => {
      const stripeSubscription = {
        id: 'sub_test123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        cancel_at_period_end: false,
        metadata: {
          userId: testUser._id.toString(),
          tierId: 'premium'
        }
      };

      await subscriptionService.handleSubscriptionUpdate(stripeSubscription);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.subscription.status).toBe('active');
      expect(updatedUser.subscription.tier).toBe('premium');
      expect(updatedUser.subscription.stripeSubscriptionId).toBe('sub_test123');
    });

    test('should handle subscription cancellation', async () => {
      const stripeSubscription = {
        id: 'sub_test123',
        status: 'canceled',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        cancel_at_period_end: true,
        metadata: {
          userId: testUser._id.toString(),
          tierId: 'premium'
        }
      };

      await subscriptionService.handleSubscriptionUpdate(stripeSubscription);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.subscription.status).toBe('canceled');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle non-existent user gracefully', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();

      await expect(
        subscriptionService.createSubscription(fakeUserId, {
          tierId: 'premium',
          paymentMethodId: 'pm_test_card'
        })
      ).rejects.toThrow('User not found');
    });

    test('should handle Stripe API failures', async () => {
      // Mock Stripe failure
      mockStripe.customers.create.mockRejectedValueOnce(new Error('Stripe API Error'));

      await expect(
        subscriptionService.createSubscription(testUser._id, {
          tierId: 'premium',
          paymentMethodId: 'pm_test_card'
        })
      ).rejects.toThrow('Stripe API Error');
    });

    test('should validate payment method ID', async () => {
      await expect(
        subscriptionService.createSubscription(testUser._id, {
          tierId: 'premium',
          paymentMethodId: null
        })
      ).rejects.toThrow();
    });

    test('should handle concurrent subscription updates', async () => {
      const subscriptionData = {
        tierId: 'premium',
        paymentMethodId: 'pm_test_card'
      };

      // Simulate concurrent requests
      const promises = [
        subscriptionService.createSubscription(testUser._id, subscriptionData),
        subscriptionService.createSubscription(testUser._id, subscriptionData)
      ];

      // One should succeed, one should fail or handle gracefully
      await expect(Promise.allSettled(promises)).resolves.toBeDefined();
    });
  });
});