/**
 * End-to-End User Journey Tests
 * Tests complete user workflows from registration to premium features
 */

const request = require('supertest');
const User = require('../../models/User');
const Activity = require('../../models/Activity');

describe('User Journey E2E Tests', () => {
  let app;
  let testUser;
  let authToken;
  let partnerUser;
  let partnerToken;

  beforeAll(async () => {
    // Create test server with all routes
    app = global.testUtils.createTestServer();
    
    // Add all route modules
    const authRoutes = require('../../routes/auth');
    const subscriptionRoutes = require('../../routes/subscription');
    const onboardingRoutes = require('../../routes/onboarding');
    const analyticsRoutes = require('../../routes/analytics');
    const advancedAnalyticsRoutes = require('../../routes/advanced-analytics');
    const photoVerificationRoutes = require('../../routes/photo-verification');
    const chatRoutes = require('../../routes/chat');
    
    const authenticateToken = require('../../middleware/auth').authenticateToken;
    
    // Mount routes
    app.use('/api/auth', authRoutes);
    app.use('/api/subscription', authenticateToken, subscriptionRoutes);
    app.use('/api/onboarding', authenticateToken, onboardingRoutes);
    app.use('/api/analytics', authenticateToken, analyticsRoutes);
    app.use('/api/advanced-analytics', authenticateToken, advancedAnalyticsRoutes);
    app.use('/api/photos', authenticateToken, photoVerificationRoutes);
    app.use('/api/chat', authenticateToken, chatRoutes);
    
    // Mock external services
    global.testUtils.mockStripe();
    global.testUtils.mockFirebaseAdmin();
    global.testUtils.mockCloudinary();
  });

  beforeEach(async () => {
    // Create fresh test users
    testUser = await global.testUtils.createTestUser({
      email: global.testUtils.generateTestData.email(),
      profile: {
        name: 'John Doe',
        age: 28,
        dateOfBirth: new Date('1995-06-15'),
        gender: 'male',
        bio: 'Love hiking and coffee',
        location: {
          type: 'Point',
          coordinates: [-74.0059, 40.7128],
          city: 'New York',
          state: 'NY',
          country: 'US'
        }
      }
    });
    
    partnerUser = await global.testUtils.createTestUser({
      email: global.testUtils.generateTestData.email(),
      profile: {
        name: 'Jane Smith',
        age: 26,
        dateOfBirth: new Date('1997-03-22'),
        gender: 'female',
        bio: 'Artist and traveler',
        location: {
          type: 'Point',
          coordinates: [-74.0059, 40.7128],
          city: 'New York',
          state: 'NY',
          country: 'US'
        }
      }
    });
    
    authToken = global.testUtils.generateTestToken(testUser._id);
    partnerToken = global.testUtils.generateTestToken(partnerUser._id);
  });

  describe('Complete User Registration and Onboarding Journey', () => {
    test('should complete full registration and onboarding flow', async () => {
      // Step 1: Initialize onboarding
      const initResponse = await request(app)
        .post('/api/onboarding/initialize')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          registrationData: {
            source: 'web',
            deviceType: 'desktop'
          }
        })
        .expect(201);

      expect(initResponse.body.success).toBe(true);
      expect(initResponse.body.data.currentStep).toBe('welcome');

      // Step 2: Complete welcome step
      const welcomeResponse = await request(app)
        .post('/api/onboarding/step/welcome/complete')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          acknowledgeTerms: true,
          privacyAccepted: true,
          ageConfirmed: true
        })
        .expect(200);

      expect(welcomeResponse.body.data.currentStep).toBe('profile_basics');

      // Step 3: Complete profile basics
      const profileResponse = await request(app)
        .post('/api/onboarding/step/profile_basics/complete')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          name: 'John Doe Updated',
          age: 28,
          gender: 'male',
          bio: 'Updated bio with more details about my interests',
          occupation: 'Software Engineer',
          education: 'Computer Science'
        })
        .expect(200);

      expect(profileResponse.body.data.currentStep).toBe('photos');

      // Step 4: Skip photos for now
      const photoSkipResponse = await request(app)
        .post('/api/onboarding/step/photos/skip')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({ reason: 'will_add_later' })
        .expect(200);

      expect(photoSkipResponse.body.data.currentStep).toBe('interests');

      // Step 5: Complete interests
      const interestsResponse = await request(app)
        .post('/api/onboarding/step/interests/complete')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          interests: ['hiking', 'coffee', 'technology', 'travel', 'photography'],
          hobbies: ['coding', 'reading'],
          lifestyle: { workoutFrequency: 'regular', socialLevel: 'moderate' }
        })
        .expect(200);

      expect(interestsResponse.body.data.currentStep).toBe('preferences');

      // Step 6: Set preferences
      const preferencesResponse = await request(app)
        .post('/api/onboarding/step/preferences/complete')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          ageRange: { min: 24, max: 32 },
          genderPreference: 'female',
          maxDistance: 25,
          dealBreakers: ['smoking']
        })
        .expect(200);

      expect(preferencesResponse.body.data.currentStep).toBe('location');

      // Step 7: Complete location
      const locationResponse = await request(app)
        .post('/api/onboarding/step/location/complete')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          location: {
            coordinates: [-74.0059, 40.7128],
            city: 'New York',
            state: 'NY',
            country: 'US'
          },
          allowLocationSharing: true,
          locationPrivacy: 'approximate'
        })
        .expect(200);

      // Step 8: Complete safety acknowledgment
      const safetyResponse = await request(app)
        .post('/api/onboarding/step/safety/complete')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          safetyAcknowledged: true,
          reportingUnderstood: true,
          blockingUnderstood: true
        })
        .expect(200);

      // Step 9: Complete matching preferences
      const matchingResponse = await request(app)
        .post('/api/onboarding/step/matching/complete')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          matchingStyle: 'balanced',
          activityPreference: 'mixed',
          communicationStyle: 'casual'
        })
        .expect(200);

      // Step 10: Complete notification setup
      const notificationResponse = await request(app)
        .post('/api/onboarding/step/notification_setup/complete')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          pushNotifications: { enabled: true },
          emailNotifications: { matches: true, messages: true },
          notificationTypes: { newMatches: true, messages: true }
        })
        .expect(200);

      // Step 11: Complete onboarding
      const completionResponse = await request(app)
        .post('/api/onboarding/step/completion/complete')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({})
        .expect(200);

      expect(completionResponse.body.data.isComplete).toBe(true);

      // Verify user has completed onboarding
      const statusResponse = await request(app)
        .get('/api/onboarding/status')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(statusResponse.body.data.status).toBe('completed');
      expect(statusResponse.body.data.progress).toBe(100);
    });
  });

  describe('Free to Premium Subscription Journey', () => {
    test('should upgrade from free to premium subscription', async () => {
      // Step 1: Check initial subscription status
      const initialStatus = await request(app)
        .get('/api/subscription/status')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(initialStatus.body.data.currentSubscription.tier).toBe('free');

      // Step 2: Check feature access as free user
      const freeFeatureCheck = await request(app)
        .get('/api/subscription/feature/advancedFilters/access')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(freeFeatureCheck.body.data.hasAccess).toBe(false);

      // Step 3: Check usage limits as free user
      const freeLimitsCheck = await request(app)
        .get('/api/subscription/limits/conversationsPerDay/check')
        .query({ currentUsage: 3 })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(freeLimitsCheck.body.data.withinLimits).toBe(true);

      // Step 4: Create premium subscription
      const subscriptionResponse = await request(app)
        .post('/api/subscription/create')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          tierId: 'premium',
          paymentMethodId: 'pm_test_card_visa'
        })
        .expect(201);

      expect(subscriptionResponse.body.data.tier).toBe('premium');

      // Step 5: Verify upgraded features
      const premiumFeatureCheck = await request(app)
        .get('/api/subscription/feature/advancedFilters/access')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(premiumFeatureCheck.body.data.hasAccess).toBe(true);

      // Step 6: Verify increased limits
      const premiumLimitsCheck = await request(app)
        .get('/api/subscription/limits/conversationsPerDay/check')
        .query({ currentUsage: 20 })
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(premiumLimitsCheck.body.data.withinLimits).toBe(true);

      // Step 7: Purchase add-on
      const addonResponse = await request(app)
        .post('/api/subscription/addon/purchase')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          addOnId: 'boost',
          paymentMethodId: 'pm_test_card_visa'
        })
        .expect(201);

      expect(addonResponse.body.data.applied).toBe(true);

      // Step 8: Check billing history
      const billingResponse = await request(app)
        .get('/api/subscription/billing/history')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(billingResponse.body.data.history.length).toBeGreaterThan(0);
    });
  });

  describe('Photo Verification Journey', () => {
    test('should complete photo upload and verification workflow', async () => {
      // Step 1: Check initial photo status
      const initialPhotos = await request(app)
        .get('/api/photos/my-photos')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(initialPhotos.body.data.totalCount).toBe(0);

      // Step 2: Analyze photo before upload
      const mockPhotoBuffer = Buffer.from('fake-image-data');
      
      const analysisResponse = await request(app)
        .post('/api/photos/analyze')
        .set(global.testUtils.getAuthHeaders(authToken))
        .attach('photo', mockPhotoBuffer, 'test-photo.jpg')
        .expect(200);

      expect(analysisResponse.body.data.verification.passed).toBe(true);

      // Step 3: Upload photo
      const uploadResponse = await request(app)
        .post('/api/photos/upload')
        .set(global.testUtils.getAuthHeaders(authToken))
        .attach('photo', mockPhotoBuffer, 'test-photo.jpg')
        .field('setPrimary', 'true')
        .field('description', 'My profile photo')
        .expect(201);

      expect(uploadResponse.body.data.photo).toBeDefined();
      const photoId = uploadResponse.body.data.photo._id;

      // Step 4: Verify photo was added
      const updatedPhotos = await request(app)
        .get('/api/photos/my-photos')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(updatedPhotos.body.data.totalCount).toBe(1);
      expect(updatedPhotos.body.data.verifiedCount).toBe(1);

      // Step 5: Get verification details
      const verificationDetails = await request(app)
        .get(`/api/photos/${photoId}/verification`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(verificationDetails.body.data.verified).toBe(true);

      // Step 6: Get verification statistics
      const verificationStats = await request(app)
        .get('/api/photos/verification-stats')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(verificationStats.body.data.verificationRate).toBe(100);
    });
  });

  describe('Chat and Messaging Journey', () => {
    beforeEach(async () => {
      // Create a match between users
      await global.testUtils.createTestMatch(testUser, partnerUser, {
        status: 'matched'
      });
    });

    test('should complete messaging workflow', async () => {
      // Step 1: Start conversation
      const conversationResponse = await request(app)
        .post('/api/chat/conversations')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          participantId: partnerUser._id.toString()
        })
        .expect(201);

      const conversationId = conversationResponse.body.data.conversation._id;

      // Step 2: Send message
      const messageResponse = await request(app)
        .post(`/api/chat/conversations/${conversationId}/messages`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          content: 'Hello! How are you?',
          messageType: 'text'
        })
        .expect(201);

      expect(messageResponse.body.data.message.content).toBe('Hello! How are you?');

      // Step 3: Partner responds
      const replyResponse = await request(app)
        .post(`/api/chat/conversations/${conversationId}/messages`)
        .set(global.testUtils.getAuthHeaders(partnerToken))
        .send({
          content: 'Hi! I\'m doing great, thanks for asking!',
          messageType: 'text'
        })
        .expect(201);

      // Step 4: Get conversation history
      const historyResponse = await request(app)
        .get(`/api/chat/conversations/${conversationId}/messages`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(historyResponse.body.data.messages).toHaveLength(2);

      // Step 5: React to message
      const messageId = replyResponse.body.data.message._id;
      const reactionResponse = await request(app)
        .post(`/api/chat/messages/${messageId}/react`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          emoji: '❤️'
        })
        .expect(200);

      expect(reactionResponse.body.data.reaction.emoji).toBe('❤️');

      // Step 6: Mark messages as read
      const readResponse = await request(app)
        .post(`/api/chat/conversations/${conversationId}/read`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(readResponse.body.data.readAt).toBeDefined();
    });
  });

  describe('Analytics and Insights Journey', () => {
    test('should access user insights and analytics', async () => {
      // Step 1: Get user insights
      const insightsResponse = await request(app)
        .get(`/api/advanced-analytics/user/${testUser._id}/insights`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(insightsResponse.body.data.personalityProfile).toBeDefined();
      expect(insightsResponse.body.data.behaviorAnalysis).toBeDefined();
      expect(insightsResponse.body.data.engagementMetrics).toBeDefined();

      // Step 2: Get subscription analytics
      const subscriptionAnalytics = await request(app)
        .get('/api/analytics/subscriptions')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(subscriptionAnalytics.body.data.metrics).toBeDefined();

      // Step 3: Generate visualization
      const visualizationResponse = await request(app)
        .post('/api/advanced-analytics/visualization/generate')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          type: 'user_analytics',
          data: {
            totalUsers: 15000,
            activeUsers: 8500,
            newUsers: 500
          }
        })
        .expect(200);

      expect(visualizationResponse.body.data.charts).toBeDefined();

      // Step 4: Check feature flag
      const featureFlagResponse = await request(app)
        .get('/api/advanced-analytics/feature-flag/new_matching_algorithm')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(featureFlagResponse.body.data.value).toBeDefined();
    });
  });

  describe('A/B Testing Journey', () => {
    test('should participate in A/B test workflow', async () => {
      // Step 1: Create A/B test
      const testConfig = {
        name: 'New Onboarding Flow',
        description: 'Testing improved onboarding experience',
        hypothesis: 'New flow will increase completion rate',
        variants: [
          {
            id: 'control',
            name: 'Current Flow',
            traffic: 50,
            config: { useNewFlow: false }
          },
          {
            id: 'treatment',
            name: 'New Flow',
            traffic: 50,
            config: { useNewFlow: true }
          }
        ],
        primaryMetric: 'onboarding_completion',
        minSampleSize: 1000
      };

      const createTestResponse = await request(app)
        .post('/api/advanced-analytics/ab-test/create')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send(testConfig)
        .expect(201);

      const testId = createTestResponse.body.data.id;

      // Step 2: Track conversion
      const conversionResponse = await request(app)
        .post(`/api/advanced-analytics/ab-test/${testId}/conversion`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          conversionType: 'onboarding_completion',
          value: 1
        })
        .expect(200);

      expect(conversionResponse.body.data.tracked).toBe(true);

      // Step 3: Get test results
      const resultsResponse = await request(app)
        .get(`/api/advanced-analytics/ab-test/${testId}/results`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .query({ includeVisualization: 'true' })
        .expect(200);

      expect(resultsResponse.body.data.results).toBeDefined();
      expect(resultsResponse.body.data.visualization).toBeDefined();
    });
  });

  describe('Activity Participation Journey', () => {
    let testActivity;

    beforeEach(async () => {
      testActivity = await global.testUtils.createTestActivity({
        organizer: partnerUser._id,
        title: 'Coffee Meetup',
        description: 'Let\'s grab coffee and chat!',
        category: 'dining',
        dateTime: global.testUtils.generateTestData.futureDate(1)
      });
    });

    test('should complete activity participation workflow', async () => {
      // Step 1: Discover activities
      const discoverResponse = await request(app)
        .get('/api/activities/discover')
        .set(global.testUtils.getAuthHeaders(authToken))
        .query({
          category: 'dining',
          maxDistance: 25,
          limit: 10
        })
        .expect(200);

      expect(discoverResponse.body.data.activities.length).toBeGreaterThan(0);

      // Step 2: Join activity
      const joinResponse = await request(app)
        .post(`/api/activities/${testActivity._id}/join`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          message: 'Looking forward to meeting everyone!'
        })
        .expect(200);

      expect(joinResponse.body.data.joined).toBe(true);

      // Step 3: Get activity details
      const activityDetails = await request(app)
        .get(`/api/activities/${testActivity._id}`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(activityDetails.body.data.activity.participants).toContainEqual(
        expect.objectContaining({ user: testUser._id.toString() })
      );

      // Step 4: Send activity message
      const messageResponse = await request(app)
        .post(`/api/activities/${testActivity._id}/messages`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          content: 'What time should we meet exactly?'
        })
        .expect(201);

      expect(messageResponse.body.data.message.content).toBe('What time should we meet exactly?');
    });
  });

  describe('Complete User Lifecycle', () => {
    test('should complete full user lifecycle from registration to cancellation', async () => {
      // 1. Complete onboarding (abbreviated)
      await request(app)
        .post('/api/onboarding/initialize')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({ registrationData: { source: 'web' } })
        .expect(201);

      // 2. Upgrade to premium
      await request(app)
        .post('/api/subscription/create')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          tierId: 'premium',
          paymentMethodId: 'pm_test_card_visa'
        })
        .expect(201);

      // 3. Upload photos
      const mockPhotoBuffer = Buffer.from('fake-image-data');
      await request(app)
        .post('/api/photos/upload')
        .set(global.testUtils.getAuthHeaders(authToken))
        .attach('photo', mockPhotoBuffer, 'profile.jpg')
        .expect(201);

      // 4. Participate in activities
      const activity = await global.testUtils.createTestActivity({
        organizer: partnerUser._id
      });

      await request(app)
        .post(`/api/activities/${activity._id}/join`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      // 5. Start conversations
      const conversation = await request(app)
        .post('/api/chat/conversations')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({ participantId: partnerUser._id.toString() })
        .expect(201);

      await request(app)
        .post(`/api/chat/conversations/${conversation.body.data.conversation._id}/messages`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({ content: 'Hello!', messageType: 'text' })
        .expect(201);

      // 6. Purchase add-ons
      await request(app)
        .post('/api/subscription/addon/purchase')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          addOnId: 'boost',
          paymentMethodId: 'pm_test_card_visa'
        })
        .expect(201);

      // 7. Get analytics
      const analytics = await request(app)
        .get(`/api/advanced-analytics/user/${testUser._id}/insights`)
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(analytics.body.data.engagementMetrics.overallScore).toBeGreaterThan(0);

      // 8. Cancel subscription
      const cancellation = await request(app)
        .post('/api/subscription/cancel')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          immediate: false,
          reason: 'found_relationship'
        })
        .expect(200);

      expect(cancellation.body.data.canceled).toBe(true);

      // 9. Verify final state
      const finalStatus = await request(app)
        .get('/api/subscription/status')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(finalStatus.body.data.currentSubscription.status).toBe('cancel_at_period_end');
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle payment failures gracefully', async () => {
      // Mock payment failure
      const stripe = require('stripe')();
      stripe.paymentIntents.create.mockRejectedValueOnce(new Error('Your card was declined'));

      const response = await request(app)
        .post('/api/subscription/addon/purchase')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          addOnId: 'boost',
          paymentMethodId: 'pm_card_declined'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('declined');
    });

    test('should handle network interruptions during onboarding', async () => {
      // Start onboarding
      await request(app)
        .post('/api/onboarding/initialize')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(201);

      // Simulate partial completion and resume
      await request(app)
        .post('/api/onboarding/step/welcome/complete')
        .set(global.testUtils.getAuthHeaders(authToken))
        .send({
          acknowledgeTerms: true,
          privacyAccepted: true,
          ageConfirmed: true
        })
        .expect(200);

      // Check status can be retrieved
      const status = await request(app)
        .get('/api/onboarding/status')
        .set(global.testUtils.getAuthHeaders(authToken))
        .expect(200);

      expect(status.body.data.status).toBe('in_progress');
      expect(status.body.data.completedSteps).toContain('welcome');
    });

    test('should handle concurrent user actions', async () => {
      const activity = await global.testUtils.createTestActivity({
        organizer: partnerUser._id,
        maxParticipants: 1 // Only one spot available
      });

      // Try to join simultaneously
      const requests = [
        request(app)
          .post(`/api/activities/${activity._id}/join`)
          .set(global.testUtils.getAuthHeaders(authToken)),
        request(app)
          .post(`/api/activities/${activity._id}/join`)
          .set(global.testUtils.getAuthHeaders(partnerToken))
      ];

      const results = await Promise.allSettled(requests);
      
      // One should succeed, one should fail due to capacity
      const responses = await Promise.all(results.map(r => r.value));
      const successfulJoins = responses.filter(r => r.status === 200);
      
      expect(successfulJoins).toHaveLength(1);
    });
  });
});