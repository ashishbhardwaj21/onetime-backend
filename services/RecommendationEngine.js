/**
 * Advanced Recommendation Engine
 * Provides intelligent matching and content recommendations using ML algorithms
 */

const tf = require('@tensorflow/tfjs-node');
const geolib = require('geolib');
const moment = require('moment');
const logger = require('../utils/logger');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Interaction = require('../models/Interaction');
const Match = require('../models/Match');
const redisClient = require('../config/redis');

class RecommendationEngine {
  constructor() {
    this.models = {
      userCompatibility: null,
      activityRecommendation: null,
      contentFiltering: null
    };
    this.featureWeights = {
      location: 0.25,
      age: 0.15,
      interests: 0.20,
      personality: 0.15,
      activity: 0.10,
      behavior: 0.15
    };
    this.initialize();
  }

  async initialize() {
    try {
      await this.loadModels();
      await this.warmupCache();
      logger.info('Recommendation engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize recommendation engine:', error);
    }
  }

  async loadModels() {
    try {
      // Load pre-trained models or create new ones
      this.models.userCompatibility = await this.createUserCompatibilityModel();
      this.models.activityRecommendation = await this.createActivityRecommendationModel();
      this.models.contentFiltering = await this.createContentFilteringModel();
    } catch (error) {
      logger.error('Error loading ML models:', error);
    }
  }

  async createUserCompatibilityModel() {
    // Neural network for user compatibility scoring
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ 
          inputShape: [50], // Feature vector size
          units: 128,
          activation: 'relu'
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ 
          units: 64,
          activation: 'relu'
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ 
          units: 32,
          activation: 'relu'
        }),
        tf.layers.dense({ 
          units: 1,
          activation: 'sigmoid'
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  async createActivityRecommendationModel() {
    // Collaborative filtering model for activity recommendations
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ 
          inputShape: [30],
          units: 64,
          activation: 'relu'
        }),
        tf.layers.dense({ 
          units: 32,
          activation: 'relu'
        }),
        tf.layers.dense({ 
          units: 16,
          activation: 'relu'
        }),
        tf.layers.dense({ 
          units: 1,
          activation: 'linear'
        })
      ]
    });

    model.compile({
      optimizer: 'adam',
      loss: 'meanSquaredError',
      metrics: ['mae']
    });

    return model;
  }

  async createContentFilteringModel() {
    // Content-based filtering for personalized recommendations
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ 
          inputShape: [40],
          units: 96,
          activation: 'relu'
        }),
        tf.layers.batchNormalization(),
        tf.layers.dense({ 
          units: 48,
          activation: 'relu'
        }),
        tf.layers.dense({ 
          units: 24,
          activation: 'relu'
        }),
        tf.layers.dense({ 
          units: 5,
          activation: 'softmax'
        })
      ]
    });

    model.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  async warmupCache() {
    // Pre-compute frequently accessed recommendations
    const activeUsers = await User.find({ 
      isActive: true,
      lastActive: { $gte: moment().subtract(7, 'days').toDate() }
    }).limit(1000);

    for (const user of activeUsers) {
      await this.precomputeRecommendations(user._id);
    }
  }

  async getPersonRecommendations(userId, options = {}) {
    const {
      limit = 20,
      maxDistance = 50,
      ageRange = null,
      forceRefresh = false
    } = options;

    try {
      // Check cache first
      const cacheKey = `recommendations:user:${userId}:${JSON.stringify(options)}`;
      if (!forceRefresh) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const user = await User.findById(userId).populate('profile preferences');
      if (!user) {
        throw new Error('User not found');
      }

      // Get potential matches
      const potentialMatches = await this.findPotentialMatches(user, {
        maxDistance,
        ageRange: ageRange || user.preferences?.ageRange,
        limit: limit * 3 // Get more candidates for scoring
      });

      // Score and rank matches
      const scoredMatches = await this.scoreMatches(user, potentialMatches);

      // Apply diversity and freshness filters
      const diverseMatches = this.applyDiversityFilters(scoredMatches, user);

      // Final recommendations
      const recommendations = diverseMatches.slice(0, limit).map(match => ({
        user: match.user,
        score: match.score,
        reasons: match.reasons,
        confidence: match.confidence
      }));

      // Cache results
      await redisClient.setex(cacheKey, 3600, JSON.stringify(recommendations));

      return recommendations;
    } catch (error) {
      logger.error('Error generating person recommendations:', error);
      throw error;
    }
  }

  async findPotentialMatches(user, options) {
    const { maxDistance, ageRange, limit } = options;
    
    const query = {
      _id: { $ne: user._id },
      isActive: true,
      'profile.gender': { $in: user.preferences?.genderPreference || ['male', 'female', 'non-binary'] },
      'profile.isComplete': true
    };

    // Age filter
    if (ageRange) {
      const minBirthDate = moment().subtract(ageRange.max, 'years').toDate();
      const maxBirthDate = moment().subtract(ageRange.min, 'years').toDate();
      query['profile.dateOfBirth'] = {
        $gte: minBirthDate,
        $lte: maxBirthDate
      };
    }

    // Location filter
    if (user.profile?.location && maxDistance) {
      query['profile.location'] = {
        $geoWithin: {
          $centerSphere: [
            user.profile.location.coordinates,
            maxDistance / 3963.2 // Convert miles to radians
          ]
        }
      };
    }

    // Exclude already matched/rejected users
    const existingInteractions = await Interaction.find({
      userId: user._id,
      type: { $in: ['like', 'pass', 'match'] }
    }).distinct('targetUserId');

    query._id.$nin = existingInteractions;

    return await User.find(query)
      .populate('profile preferences interests')
      .limit(limit)
      .lean();
  }

  async scoreMatches(user, potentialMatches) {
    const scoredMatches = [];

    for (const match of potentialMatches) {
      try {
        const score = await this.calculateCompatibilityScore(user, match);
        const reasons = this.generateMatchReasons(user, match, score);
        const confidence = this.calculateConfidence(score, user, match);

        scoredMatches.push({
          user: match,
          score: score.overall,
          breakdown: score.breakdown,
          reasons,
          confidence
        });
      } catch (error) {
        logger.error(`Error scoring match for user ${match._id}:`, error);
      }
    }

    return scoredMatches.sort((a, b) => b.score - a.score);
  }

  async calculateCompatibilityScore(user1, user2) {
    const features = this.extractFeatures(user1, user2);
    
    // Use ML model for base score
    const featureTensor = tf.tensor2d([features]);
    const mlScore = await this.models.userCompatibility.predict(featureTensor).data();
    featureTensor.dispose();

    // Calculate individual component scores
    const breakdown = {
      location: this.calculateLocationScore(user1, user2),
      age: this.calculateAgeScore(user1, user2),
      interests: this.calculateInterestScore(user1, user2),
      personality: this.calculatePersonalityScore(user1, user2),
      activity: await this.calculateActivityScore(user1, user2),
      behavior: await this.calculateBehaviorScore(user1, user2)
    };

    // Weighted average
    const overall = Object.keys(breakdown).reduce((sum, key) => {
      return sum + (breakdown[key] * this.featureWeights[key]);
    }, 0);

    // Combine ML and rule-based scores
    const finalScore = (mlScore[0] * 0.6) + (overall * 0.4);

    return {
      overall: Math.min(Math.max(finalScore, 0), 1),
      breakdown,
      mlScore: mlScore[0]
    };
  }

  extractFeatures(user1, user2) {
    const features = [];

    // Location features
    const distance = this.calculateDistance(user1, user2);
    features.push(distance / 100); // Normalize to 0-1
    features.push(user1.profile?.location?.city === user2.profile?.location?.city ? 1 : 0);

    // Age features
    const ageDiff = Math.abs(user1.profile?.age - user2.profile?.age);
    features.push(ageDiff / 20); // Normalize
    features.push(this.isAgeCompatible(user1, user2) ? 1 : 0);

    // Interest features
    const commonInterests = this.getCommonInterests(user1, user2);
    features.push(commonInterests.length / 10); // Normalize
    features.push(commonInterests.length > 3 ? 1 : 0);

    // Profile completeness
    features.push(this.calculateProfileCompleteness(user1));
    features.push(this.calculateProfileCompleteness(user2));

    // Activity level
    features.push(user1.profile?.activityLevel || 0.5);
    features.push(user2.profile?.activityLevel || 0.5);

    // Pad with zeros to reach expected feature vector size
    while (features.length < 50) {
      features.push(0);
    }

    return features;
  }

  calculateLocationScore(user1, user2) {
    if (!user1.profile?.location || !user2.profile?.location) {
      return 0.3; // Default score for missing location
    }

    const distance = this.calculateDistance(user1, user2);
    
    // Score decreases with distance
    if (distance <= 5) return 1.0;
    if (distance <= 15) return 0.8;
    if (distance <= 30) return 0.6;
    if (distance <= 50) return 0.4;
    return 0.2;
  }

  calculateDistance(user1, user2) {
    if (!user1.profile?.location?.coordinates || !user2.profile?.location?.coordinates) {
      return 999; // Large distance for missing coordinates
    }

    return geolib.getDistance(
      {
        latitude: user1.profile.location.coordinates[1],
        longitude: user1.profile.location.coordinates[0]
      },
      {
        latitude: user2.profile.location.coordinates[1],
        longitude: user2.profile.location.coordinates[0]
      }
    ) / 1609.34; // Convert meters to miles
  }

  calculateAgeScore(user1, user2) {
    const age1 = user1.profile?.age;
    const age2 = user2.profile?.age;
    
    if (!age1 || !age2) return 0.5;

    const ageDiff = Math.abs(age1 - age2);
    
    // Preference-based scoring
    const inPreferredRange1 = this.isAgeInRange(age2, user1.preferences?.ageRange);
    const inPreferredRange2 = this.isAgeInRange(age1, user2.preferences?.ageRange);
    
    let score = 1.0;
    
    if (!inPreferredRange1 || !inPreferredRange2) {
      score *= 0.3; // Significant penalty for out of range
    }
    
    // Distance penalty
    if (ageDiff <= 2) score *= 1.0;
    else if (ageDiff <= 5) score *= 0.9;
    else if (ageDiff <= 10) score *= 0.7;
    else score *= 0.4;

    return score;
  }

  calculateInterestScore(user1, user2) {
    const interests1 = user1.interests?.map(i => i.toLowerCase()) || [];
    const interests2 = user2.interests?.map(i => i.toLowerCase()) || [];
    
    if (interests1.length === 0 || interests2.length === 0) {
      return 0.4; // Default for missing interests
    }

    const commonInterests = interests1.filter(interest => 
      interests2.includes(interest)
    );

    const totalInterests = new Set([...interests1, ...interests2]).size;
    const jaccardSimilarity = commonInterests.length / totalInterests;
    
    // Bonus for having many common interests
    let score = jaccardSimilarity;
    if (commonInterests.length >= 5) score += 0.2;
    else if (commonInterests.length >= 3) score += 0.1;

    return Math.min(score, 1.0);
  }

  calculatePersonalityScore(user1, user2) {
    const personality1 = user1.profile?.personality || {};
    const personality2 = user2.profile?.personality || {};

    if (Object.keys(personality1).length === 0 || Object.keys(personality2).length === 0) {
      return 0.5;
    }

    const traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    let similarity = 0;
    let count = 0;

    for (const trait of traits) {
      if (personality1[trait] !== undefined && personality2[trait] !== undefined) {
        const diff = Math.abs(personality1[trait] - personality2[trait]);
        similarity += 1 - (diff / 100); // Assuming traits are 0-100
        count++;
      }
    }

    return count > 0 ? similarity / count : 0.5;
  }

  async calculateActivityScore(user1, user2) {
    try {
      // Find activities both users might be interested in
      const user1Activities = await Activity.find({
        $or: [
          { organizer: user1._id },
          { 'participants.user': user1._id }
        ]
      }).lean();

      const user2Activities = await Activity.find({
        $or: [
          { organizer: user2._id },
          { 'participants.user': user2._id }
        ]
      }).lean();

      // Calculate activity overlap
      const user1Categories = new Set(user1Activities.map(a => a.category));
      const user2Categories = new Set(user2Activities.map(a => a.category));
      
      const commonCategories = [...user1Categories].filter(cat => 
        user2Categories.has(cat)
      );

      const totalCategories = new Set([...user1Categories, ...user2Categories]).size;
      
      return totalCategories > 0 ? commonCategories.length / totalCategories : 0.5;
    } catch (error) {
      logger.error('Error calculating activity score:', error);
      return 0.5;
    }
  }

  async calculateBehaviorScore(user1, user2) {
    try {
      // Analyze user behavior patterns
      const user1Interactions = await Interaction.find({ userId: user1._id }).lean();
      const user2Interactions = await Interaction.find({ userId: user2._id }).lean();

      // Calculate response rates and engagement patterns
      const user1ResponseRate = this.calculateResponseRate(user1Interactions);
      const user2ResponseRate = this.calculateResponseRate(user2Interactions);

      // Similar response rates indicate compatibility
      const responseSimilarity = 1 - Math.abs(user1ResponseRate - user2ResponseRate);

      // Activity timing patterns
      const user1ActiveHours = this.getActiveHours(user1Interactions);
      const user2ActiveHours = this.getActiveHours(user2Interactions);
      const timeOverlap = this.calculateTimeOverlap(user1ActiveHours, user2ActiveHours);

      return (responseSimilarity * 0.6) + (timeOverlap * 0.4);
    } catch (error) {
      logger.error('Error calculating behavior score:', error);
      return 0.5;
    }
  }

  generateMatchReasons(user1, user2, scoreBreakdown) {
    const reasons = [];

    if (scoreBreakdown.breakdown.location > 0.7) {
      const distance = this.calculateDistance(user1, user2);
      reasons.push(`Only ${Math.round(distance)} miles away`);
    }

    if (scoreBreakdown.breakdown.interests > 0.6) {
      const commonInterests = this.getCommonInterests(user1, user2);
      reasons.push(`Share ${commonInterests.length} interests: ${commonInterests.slice(0, 3).join(', ')}`);
    }

    if (scoreBreakdown.breakdown.age > 0.8) {
      reasons.push('Great age compatibility');
    }

    if (scoreBreakdown.breakdown.activity > 0.7) {
      reasons.push('Similar activity preferences');
    }

    if (scoreBreakdown.breakdown.personality > 0.7) {
      reasons.push('Compatible personality traits');
    }

    return reasons.slice(0, 3); // Return top 3 reasons
  }

  calculateConfidence(score, user1, user2) {
    let confidence = score.overall;

    // Boost confidence for complete profiles
    const completeness1 = this.calculateProfileCompleteness(user1);
    const completeness2 = this.calculateProfileCompleteness(user2);
    confidence *= (completeness1 + completeness2) / 2;

    // Boost confidence for recent activity
    const daysSinceActive1 = moment().diff(user1.lastActive, 'days');
    const daysSinceActive2 = moment().diff(user2.lastActive, 'days');
    const activityBoost = Math.max(0, 1 - ((daysSinceActive1 + daysSinceActive2) / 14));
    confidence *= (1 + activityBoost * 0.2);

    return Math.min(confidence, 1.0);
  }

  applyDiversityFilters(scoredMatches, user) {
    // Ensure diversity in recommendations
    const diverse = [];
    const usedCities = new Set();
    const usedAgeRanges = new Set();
    const usedInterestGroups = new Set();

    for (const match of scoredMatches) {
      if (diverse.length >= 20) break;

      const city = match.user.profile?.location?.city;
      const ageGroup = Math.floor(match.user.profile?.age / 5) * 5;
      const topInterest = match.user.interests?.[0];

      // Promote diversity
      let diversityBoost = 1.0;
      if (city && !usedCities.has(city)) {
        diversityBoost += 0.1;
        usedCities.add(city);
      }
      if (!usedAgeRanges.has(ageGroup)) {
        diversityBoost += 0.05;
        usedAgeRanges.add(ageGroup);
      }
      if (topInterest && !usedInterestGroups.has(topInterest)) {
        diversityBoost += 0.05;
        usedInterestGroups.add(topInterest);
      }

      match.score *= diversityBoost;
      diverse.push(match);
    }

    return diverse.sort((a, b) => b.score - a.score);
  }

  async getActivityRecommendations(userId, options = {}) {
    const { limit = 10, category = null, maxDistance = 25 } = options;

    try {
      const user = await User.findById(userId).populate('profile interests');
      if (!user) {
        throw new Error('User not found');
      }

      const cacheKey = `recommendations:activities:${userId}:${JSON.stringify(options)}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get user's activity history and preferences
      const userActivities = await Activity.find({
        $or: [
          { organizer: userId },
          { 'participants.user': userId }
        ]
      }).lean();

      // Find potential activities
      const query = {
        dateTime: { $gte: new Date() },
        status: 'active',
        'participants.user': { $ne: userId }
      };

      if (category) {
        query.category = category;
      }

      if (user.profile?.location && maxDistance) {
        query.location = {
          $geoWithin: {
            $centerSphere: [
              user.profile.location.coordinates,
              maxDistance / 3963.2
            ]
          }
        };
      }

      const activities = await Activity.find(query)
        .populate('organizer', 'profile')
        .limit(limit * 2)
        .lean();

      // Score activities
      const scoredActivities = activities.map(activity => {
        const score = this.scoreActivity(user, activity, userActivities);
        return { activity, score };
      });

      // Sort and return top recommendations
      const recommendations = scoredActivities
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => ({
          activity: item.activity,
          score: item.score,
          reasons: this.generateActivityReasons(user, item.activity)
        }));

      await redisClient.setex(cacheKey, 1800, JSON.stringify(recommendations));
      return recommendations;
    } catch (error) {
      logger.error('Error generating activity recommendations:', error);
      throw error;
    }
  }

  scoreActivity(user, activity, userHistory) {
    let score = 0.5; // Base score

    // Interest alignment
    const userInterests = user.interests?.map(i => i.toLowerCase()) || [];
    const activityTags = activity.tags?.map(t => t.toLowerCase()) || [];
    const interestMatch = userInterests.filter(i => activityTags.includes(i)).length;
    score += interestMatch * 0.15;

    // Category preference based on history
    const categoryHistory = userHistory.filter(a => a.category === activity.category);
    if (categoryHistory.length > 0) {
      score += 0.2;
    }

    // Time preference
    const activityHour = new Date(activity.dateTime).getHours();
    const userPreferredHours = this.getUserPreferredActivityHours(user);
    if (userPreferredHours.includes(activityHour)) {
      score += 0.15;
    }

    // Group size preference
    const currentParticipants = activity.participants?.length || 0;
    const optimalSize = user.preferences?.groupSizePreference || 'medium';
    if (this.isOptimalGroupSize(currentParticipants, optimalSize)) {
      score += 0.1;
    }

    // Organizer compatibility
    if (activity.organizer) {
      // Could add organizer scoring logic here
      score += 0.05;
    }

    return Math.min(score, 1.0);
  }

  generateActivityReasons(user, activity) {
    const reasons = [];

    if (user.interests) {
      const matchingInterests = user.interests.filter(interest =>
        activity.tags?.includes(interest) || 
        activity.description?.toLowerCase().includes(interest.toLowerCase())
      );
      if (matchingInterests.length > 0) {
        reasons.push(`Matches your interests: ${matchingInterests.slice(0, 2).join(', ')}`);
      }
    }

    const distance = this.calculateActivityDistance(user, activity);
    if (distance < 10) {
      reasons.push(`Only ${Math.round(distance)} miles away`);
    }

    const timeUntil = moment(activity.dateTime).fromNow();
    reasons.push(`Happening ${timeUntil}`);

    return reasons.slice(0, 3);
  }

  async precomputeRecommendations(userId) {
    try {
      await Promise.all([
        this.getPersonRecommendations(userId, { limit: 20 }),
        this.getActivityRecommendations(userId, { limit: 10 }),
        this.getActivityRecommendations(userId, { category: 'dining', limit: 5 }),
        this.getActivityRecommendations(userId, { category: 'outdoor', limit: 5 })
      ]);
    } catch (error) {
      logger.error(`Error precomputing recommendations for user ${userId}:`, error);
    }
  }

  // Helper methods
  getCommonInterests(user1, user2) {
    const interests1 = user1.interests?.map(i => i.toLowerCase()) || [];
    const interests2 = user2.interests?.map(i => i.toLowerCase()) || [];
    return interests1.filter(interest => interests2.includes(interest));
  }

  isAgeInRange(age, ageRange) {
    if (!ageRange) return true;
    return age >= ageRange.min && age <= ageRange.max;
  }

  isAgeCompatible(user1, user2) {
    const age1 = user1.profile?.age;
    const age2 = user2.profile?.age;
    const range1 = user1.preferences?.ageRange;
    const range2 = user2.preferences?.ageRange;

    return this.isAgeInRange(age2, range1) && this.isAgeInRange(age1, range2);
  }

  calculateProfileCompleteness(user) {
    const requiredFields = ['name', 'age', 'bio', 'location'];
    const optionalFields = ['occupation', 'education', 'interests'];
    
    let completeness = 0;
    let total = 0;

    // Required fields (70% weight)
    for (const field of requiredFields) {
      total += 0.175; // 70% / 4 fields
      if (user.profile?.[field]) {
        completeness += 0.175;
      }
    }

    // Optional fields (30% weight)
    for (const field of optionalFields) {
      total += 0.1; // 30% / 3 fields
      if (user.profile?.[field] || user[field]) {
        completeness += 0.1;
      }
    }

    return completeness;
  }

  calculateResponseRate(interactions) {
    const received = interactions.filter(i => i.type === 'received_like').length;
    const responded = interactions.filter(i => i.type === 'like').length;
    return received > 0 ? responded / received : 0.5;
  }

  getActiveHours(interactions) {
    const hours = interactions.map(i => new Date(i.createdAt).getHours());
    const hourCounts = {};
    hours.forEach(hour => {
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    // Return hours with above-average activity
    const avgActivity = hours.length / 24;
    return Object.keys(hourCounts)
      .filter(hour => hourCounts[hour] > avgActivity)
      .map(Number);
  }

  calculateTimeOverlap(hours1, hours2) {
    const overlap = hours1.filter(hour => hours2.includes(hour));
    const total = new Set([...hours1, ...hours2]).size;
    return total > 0 ? overlap.length / total : 0;
  }

  getUserPreferredActivityHours(user) {
    // Default preferred hours, could be learned from user behavior
    const timePreference = user.preferences?.timePreference || 'evening';
    
    switch (timePreference) {
      case 'morning': return [8, 9, 10, 11];
      case 'afternoon': return [12, 13, 14, 15, 16];
      case 'evening': return [17, 18, 19, 20];
      case 'night': return [21, 22, 23];
      default: return [12, 13, 14, 15, 16, 17, 18, 19, 20];
    }
  }

  isOptimalGroupSize(currentSize, preference) {
    switch (preference) {
      case 'small': return currentSize < 5;
      case 'medium': return currentSize >= 3 && currentSize <= 8;
      case 'large': return currentSize > 5;
      default: return true;
    }
  }

  calculateActivityDistance(user, activity) {
    if (!user.profile?.location?.coordinates || !activity.location?.coordinates) {
      return 999;
    }

    return geolib.getDistance(
      {
        latitude: user.profile.location.coordinates[1],
        longitude: user.profile.location.coordinates[0]
      },
      {
        latitude: activity.location.coordinates[1],
        longitude: activity.location.coordinates[0]
      }
    ) / 1609.34; // Convert meters to miles
  }

  async updateUserModel(userId, feedback) {
    // Update user-specific recommendation model based on feedback
    try {
      const cachePattern = `recommendations:*${userId}*`;
      await redisClient.del(cachePattern);
      
      // Re-train model with new feedback data
      await this.retrainModel(userId, feedback);
    } catch (error) {
      logger.error('Error updating user model:', error);
    }
  }

  async retrainModel(userId, feedback) {
    // Implement incremental learning for user-specific preferences
    // This would update the neural network weights based on user feedback
    logger.info(`Retraining model for user ${userId} with feedback:`, feedback);
  }

  async getRecommendationExplanation(userId, recommendedUserId) {
    try {
      const user = await User.findById(userId);
      const recommendedUser = await User.findById(recommendedUserId);
      
      const score = await this.calculateCompatibilityScore(user, recommendedUser);
      const reasons = this.generateMatchReasons(user, recommendedUser, score);
      
      return {
        score: score.overall,
        breakdown: score.breakdown,
        reasons,
        explanation: this.generateDetailedExplanation(score.breakdown, reasons)
      };
    } catch (error) {
      logger.error('Error generating recommendation explanation:', error);
      throw error;
    }
  }

  generateDetailedExplanation(breakdown, reasons) {
    const explanations = [];

    if (breakdown.interests > 0.7) {
      explanations.push('You have many shared interests and hobbies');
    }
    if (breakdown.location > 0.8) {
      explanations.push('You live close to each other');
    }
    if (breakdown.personality > 0.6) {
      explanations.push('Your personality types complement each other well');
    }
    if (breakdown.activity > 0.6) {
      explanations.push('You enjoy similar types of activities');
    }

    return explanations.join('. ') + '.';
  }
}

module.exports = new RecommendationEngine();