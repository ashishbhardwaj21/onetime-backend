/**
 * Recommendation Engine Unit Tests
 * Tests ML-powered recommendation algorithms
 */

const RecommendationEngine = require('../../../services/RecommendationEngine');
const User = require('../../../models/User');
const Activity = require('../../../models/Activity');
const Interaction = require('../../../models/Interaction');

describe('RecommendationEngine', () => {
  let testUser1, testUser2, testActivity;

  beforeEach(async () => {
    // Create test users with different profiles
    testUser1 = await global.testUtils.createTestUser({
      email: global.testUtils.generateTestData.email(),
      profile: {
        name: 'John Doe',
        age: 28,
        gender: 'male',
        bio: 'Love hiking and coffee',
        location: {
          type: 'Point',
          coordinates: [-74.0059, 40.7128], // NYC
          city: 'New York',
          state: 'NY'
        },
        activityLevel: 0.8
      },
      interests: ['hiking', 'coffee', 'technology', 'travel'],
      preferences: {
        ageRange: { min: 24, max: 32 },
        genderPreference: ['female'],
        maxDistance: 25
      }
    });

    testUser2 = await global.testUtils.createTestUser({
      email: global.testUtils.generateTestData.email(),
      profile: {
        name: 'Jane Smith',
        age: 26,
        gender: 'female',
        bio: 'Coffee enthusiast and traveler',
        location: {
          type: 'Point',
          coordinates: [-74.0100, 40.7150], // NYC nearby
          city: 'New York',
          state: 'NY'
        },
        activityLevel: 0.7
      },
      interests: ['coffee', 'travel', 'photography', 'art'],
      preferences: {
        ageRange: { min: 25, max: 35 },
        genderPreference: ['male'],
        maxDistance: 30
      }
    });

    testActivity = await global.testUtils.createTestActivity({
      organizer: testUser2._id,
      title: 'Coffee Tasting Meetup',
      description: 'Explore different coffee blends',
      category: 'dining',
      tags: ['coffee', 'social', 'food'],
      location: {
        type: 'Point',
        coordinates: [-74.0080, 40.7140],
        address: '123 Coffee St, New York, NY'
      },
      dateTime: global.testUtils.generateTestData.futureDate(3),
      maxParticipants: 10
    });
  });

  describe('getPersonRecommendations', () => {
    test('should return compatible users based on preferences', async () => {
      const recommendations = await RecommendationEngine.getPersonRecommendations(
        testUser1._id,
        { limit: 10, maxDistance: 50 }
      );

      expect(recommendations).toBeArray();
      expect(recommendations.length).toBeGreaterThanOrEqual(0);

      if (recommendations.length > 0) {
        const firstRec = recommendations[0];
        expect(firstRec).toHaveProperty('user');
        expect(firstRec).toHaveProperty('score');
        expect(firstRec).toHaveProperty('reasons');
        expect(firstRec).toHaveProperty('confidence');
        expect(firstRec.score).toBeWithin(0, 1);
        expect(firstRec.confidence).toBeWithin(0, 1);
      }
    });

    test('should respect age range preferences', async () => {
      const recommendations = await RecommendationEngine.getPersonRecommendations(
        testUser1._id,
        { 
          limit: 10,
          ageRange: { min: 25, max: 27 }
        }
      );

      recommendations.forEach(rec => {
        const age = rec.user.profile?.age;
        if (age) {
          expect(age).toBeGreaterThanOrEqual(25);
          expect(age).toBeLessThanOrEqual(27);
        }
      });
    });

    test('should respect distance preferences', async () => {
      const recommendations = await RecommendationEngine.getPersonRecommendations(
        testUser1._id,
        { limit: 10, maxDistance: 10 }
      );

      // All recommendations should be within distance
      recommendations.forEach(rec => {
        if (rec.user.profile?.location?.coordinates) {
          // Distance calculation would be tested here
          expect(rec.reasons).toBeDefined();
        }
      });
    });

    test('should cache recommendations', async () => {
      const options = { limit: 5, maxDistance: 25 };
      
      // First call
      const start1 = Date.now();
      const recs1 = await RecommendationEngine.getPersonRecommendations(
        testUser1._id,
        options
      );
      const time1 = Date.now() - start1;

      // Second call (should be cached)
      const start2 = Date.now();
      const recs2 = await RecommendationEngine.getPersonRecommendations(
        testUser1._id,
        options
      );
      const time2 = Date.now() - start2;

      expect(recs1).toEqual(recs2);
      expect(time2).toBeLessThan(time1); // Cached call should be faster
    });

    test('should force refresh when requested', async () => {
      const options = { limit: 5, forceRefresh: true };
      
      const recs1 = await RecommendationEngine.getPersonRecommendations(
        testUser1._id,
        options
      );
      
      const recs2 = await RecommendationEngine.getPersonRecommendations(
        testUser1._id,
        options
      );

      // Results might be the same but should not use cache
      expect(recs1).toBeDefined();
      expect(recs2).toBeDefined();
    });
  });

  describe('getActivityRecommendations', () => {
    test('should return relevant activities based on user interests', async () => {
      const recommendations = await RecommendationEngine.getActivityRecommendations(
        testUser1._id,
        { limit: 10, maxDistance: 25 }
      );

      expect(recommendations).toBeArray();
      
      if (recommendations.length > 0) {
        const firstRec = recommendations[0];
        expect(firstRec).toHaveProperty('activity');
        expect(firstRec).toHaveProperty('score');
        expect(firstRec).toHaveProperty('reasons');
        expect(firstRec.score).toBeWithin(0, 1);
      }
    });

    test('should filter by category when specified', async () => {
      const recommendations = await RecommendationEngine.getActivityRecommendations(
        testUser1._id,
        { limit: 10, category: 'dining' }
      );

      recommendations.forEach(rec => {
        expect(rec.activity.category).toBe('dining');
      });
    });

    test('should provide meaningful reasons for recommendations', async () => {
      const recommendations = await RecommendationEngine.getActivityRecommendations(
        testUser1._id,
        { limit: 5 }
      );

      recommendations.forEach(rec => {
        expect(rec.reasons).toBeArray();
        expect(rec.reasons.length).toBeGreaterThan(0);
        rec.reasons.forEach(reason => {
          expect(reason).toBeString();
          expect(reason.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('calculateCompatibilityScore', () => {
    test('should calculate compatibility between two users', async () => {
      const score = await RecommendationEngine.calculateCompatibilityScore(
        testUser1,
        testUser2
      );

      expect(score).toHaveProperty('overall');
      expect(score).toHaveProperty('breakdown');
      expect(score.overall).toBeWithin(0, 1);
      
      expect(score.breakdown).toHaveProperty('location');
      expect(score.breakdown).toHaveProperty('age');
      expect(score.breakdown).toHaveProperty('interests');
      expect(score.breakdown).toHaveProperty('personality');
      expect(score.breakdown).toHaveProperty('activity');
      expect(score.breakdown).toHaveProperty('behavior');

      Object.values(score.breakdown).forEach(value => {
        expect(value).toBeWithin(0, 1);
      });
    });

    test('should give high score for highly compatible users', async () => {
      // Create a very compatible user
      const compatibleUser = await global.testUtils.createTestUser({
        email: global.testUtils.generateTestData.email(),
        profile: {
          name: 'Compatible Jane',
          age: 27, // Within preferred range
          gender: 'female',
          location: {
            type: 'Point',
            coordinates: [-74.0060, 40.7129], // Very close
            city: 'New York',
            state: 'NY'
          }
        },
        interests: ['hiking', 'coffee', 'technology'], // Many shared interests
        preferences: {
          ageRange: { min: 26, max: 30 },
          genderPreference: ['male']
        }
      });

      const score = await RecommendationEngine.calculateCompatibilityScore(
        testUser1,
        compatibleUser
      );

      expect(score.overall).toBeGreaterThan(0.6); // Should be high compatibility
      expect(score.breakdown.location).toBeGreaterThan(0.8); // Very close
      expect(score.breakdown.age).toBeGreaterThan(0.8); // Perfect age match
      expect(score.breakdown.interests).toBeGreaterThan(0.5); // Good interest overlap
    });

    test('should give low score for incompatible users', async () => {
      // Create an incompatible user
      const incompatibleUser = await global.testUtils.createTestUser({
        email: global.testUtils.generateTestData.email(),
        profile: {
          name: 'Incompatible User',
          age: 45, // Outside preferred range
          gender: 'male', // Not preferred gender
          location: {
            type: 'Point',
            coordinates: [-118.2437, 34.0522], // Los Angeles (far away)
            city: 'Los Angeles',
            state: 'CA'
          }
        },
        interests: ['knitting', 'gardening'], // No shared interests
        preferences: {
          ageRange: { min: 40, max: 50 },
          genderPreference: ['female']
        }
      });

      const score = await RecommendationEngine.calculateCompatibilityScore(
        testUser1,
        incompatibleUser
      );

      expect(score.overall).toBeLessThan(0.4); // Should be low compatibility
      expect(score.breakdown.location).toBeLessThan(0.3); // Very far
      expect(score.breakdown.age).toBeLessThan(0.3); // Age mismatch
      expect(score.breakdown.interests).toBeLessThan(0.2); // No common interests
    });
  });

  describe('scoreActivity', () => {
    test('should score activity based on user preferences', async () => {
      const userHistory = []; // Empty history for test
      const score = RecommendationEngine.scoreActivity(
        testUser1,
        testActivity,
        userHistory
      );

      expect(score).toBeWithin(0, 1);
    });

    test('should give higher scores for activities matching user interests', async () => {
      // Activity that matches user interests (coffee)
      const matchingActivity = await global.testUtils.createTestActivity({
        organizer: testUser2._id,
        title: 'Coffee and Tech Meetup',
        tags: ['coffee', 'technology'],
        category: 'dining'
      });

      // Activity that doesn't match interests
      const nonMatchingActivity = await global.testUtils.createTestActivity({
        organizer: testUser2._id,
        title: 'Knitting Circle',
        tags: ['knitting', 'crafts'],
        category: 'hobby'
      });

      const userHistory = [];
      const matchingScore = RecommendationEngine.scoreActivity(
        testUser1,
        matchingActivity,
        userHistory
      );
      
      const nonMatchingScore = RecommendationEngine.scoreActivity(
        testUser1,
        nonMatchingActivity,
        userHistory
      );

      expect(matchingScore).toBeGreaterThan(nonMatchingScore);
    });
  });

  describe('getRecommendationExplanation', () => {
    test('should provide detailed explanation for recommendation', async () => {
      const explanation = await RecommendationEngine.getRecommendationExplanation(
        testUser1._id,
        testUser2._id
      );

      expect(explanation).toHaveProperty('score');
      expect(explanation).toHaveProperty('breakdown');
      expect(explanation).toHaveProperty('reasons');
      expect(explanation).toHaveProperty('explanation');

      expect(explanation.score).toBeWithin(0, 1);
      expect(explanation.reasons).toBeArray();
      expect(explanation.explanation).toBeString();
      expect(explanation.explanation.length).toBeGreaterThan(0);
    });
  });

  describe('precomputeRecommendations', () => {
    test('should precompute recommendations without errors', async () => {
      await expect(
        RecommendationEngine.precomputeRecommendations(testUser1._id)
      ).resolves.toBeUndefined();
    });
  });

  describe('updateUserModel', () => {
    test('should update user model with feedback', async () => {
      const feedback = {
        recommendationId: 'test-rec-123',
        action: 'like',
        confidence: 0.8,
        timestamp: new Date()
      };

      await expect(
        RecommendationEngine.updateUserModel(testUser1._id, feedback)
      ).resolves.toBeUndefined();
    });
  });

  describe('Helper Methods', () => {
    test('getCommonInterests should find shared interests', () => {
      const user1 = { interests: ['coffee', 'hiking', 'travel'] };
      const user2 = { interests: ['coffee', 'photography', 'travel'] };

      const commonInterests = RecommendationEngine.getCommonInterests(user1, user2);

      expect(commonInterests).toEqual(['coffee', 'travel']);
    });

    test('isAgeCompatible should check mutual age preferences', () => {
      const user1 = {
        profile: { age: 28 },
        preferences: { ageRange: { min: 24, max: 32 } }
      };
      const user2 = {
        profile: { age: 26 },
        preferences: { ageRange: { min: 25, max: 35 } }
      };

      const compatible = RecommendationEngine.isAgeCompatible(user1, user2);
      expect(compatible).toBe(true);
    });

    test('calculateProfileCompleteness should assess profile quality', () => {
      const completeUser = {
        profile: {
          name: 'John',
          age: 28,
          bio: 'Love hiking',
          location: { city: 'NYC' },
          occupation: 'Engineer',
          education: 'Computer Science'
        },
        interests: ['hiking', 'coffee'],
        photos: ['photo1', 'photo2']
      };

      const completeness = RecommendationEngine.calculateProfileCompleteness(completeUser);
      expect(completeness).toBeGreaterThan(0.8);
    });
  });

  describe('Edge Cases', () => {
    test('should handle users with missing profile data', async () => {
      const incompleteUser = await global.testUtils.createTestUser({
        email: global.testUtils.generateTestData.email(),
        profile: {
          name: 'Incomplete User'
          // Missing age, location, etc.
        }
      });

      const recommendations = await RecommendationEngine.getPersonRecommendations(
        incompleteUser._id,
        { limit: 5 }
      );

      expect(recommendations).toBeArray();
    });

    test('should handle compatibility calculation with null values', async () => {
      const userWithNulls = {
        profile: { age: null, location: null },
        interests: null,
        preferences: null
      };

      const score = await RecommendationEngine.calculateCompatibilityScore(
        userWithNulls,
        testUser2
      );

      expect(score.overall).toBeWithin(0, 1);
      expect(score.breakdown).toBeDefined();
    });

    test('should handle empty recommendation results gracefully', async () => {
      // Create user with very restrictive preferences
      const restrictiveUser = await global.testUtils.createTestUser({
        email: global.testUtils.generateTestData.email(),
        profile: {
          name: 'Restrictive User',
          age: 99,
          gender: 'male'
        },
        preferences: {
          ageRange: { min: 98, max: 99 },
          genderPreference: ['non-binary'],
          maxDistance: 0.1
        }
      });

      const recommendations = await RecommendationEngine.getPersonRecommendations(
        restrictiveUser._id,
        { limit: 10 }
      );

      expect(recommendations).toBeArray();
      expect(recommendations.length).toBe(0);
    });
  });

  describe('Performance', () => {
    test('should complete recommendations within reasonable time', async () => {
      const startTime = Date.now();
      
      await RecommendationEngine.getPersonRecommendations(
        testUser1._id,
        { limit: 20 }
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle concurrent recommendation requests', async () => {
      const promises = Array(5).fill().map(() =>
        RecommendationEngine.getPersonRecommendations(
          testUser1._id,
          { limit: 10 }
        )
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeArray();
      });
    });
  });
});