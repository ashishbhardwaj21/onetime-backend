/**
 * AI-Powered Activity Recommendation System
 * 
 * Features:
 * - Personalized activity suggestions based on user behavior
 * - Weather-aware recommendations
 * - Time-sensitive suggestions (morning coffee, evening drinks)
 * - Collaborative filtering based on similar users
 * - Context-aware recommendations (location, day of week, season)
 * - Machine learning preference adaptation
 */

const User = require('../models/User');
const Activity = require('../models/Activity');
const UserSwipe = require('../models/UserSwipe');
const Match = require('../models/Match');
const Message = require('../models/Message');

class AIActivityRecommendation {
  constructor() {
    this.categories = {
      'active': { weight: 1.0, timePreference: ['morning', 'afternoon'] },
      'social': { weight: 1.0, timePreference: ['afternoon', 'evening'] },
      'cultural': { weight: 0.8, timePreference: ['afternoon', 'evening'] },
      'outdoor': { weight: 1.2, timePreference: ['morning', 'afternoon'] },
      'indoor': { weight: 0.9, timePreference: ['evening', 'night'] },
      'food': { weight: 1.1, timePreference: ['afternoon', 'evening'] },
      'entertainment': { weight: 1.0, timePreference: ['evening', 'night'] },
      'romantic': { weight: 1.3, timePreference: ['evening'] },
      'casual': { weight: 1.0, timePreference: ['morning', 'afternoon', 'evening'] }
    };

    this.weatherActivities = {
      'sunny': ['outdoor', 'active', 'social'],
      'cloudy': ['cultural', 'social', 'casual'],
      'rainy': ['indoor', 'cultural', 'entertainment'],
      'snowy': ['indoor', 'romantic', 'entertainment']
    };

    this.timeBasedActivities = {
      'morning': ['food', 'active', 'outdoor'],
      'afternoon': ['social', 'cultural', 'outdoor'],
      'evening': ['romantic', 'food', 'entertainment'],
      'night': ['entertainment', 'indoor', 'romantic']
    };
  }

  /**
   * Get personalized activity recommendations for a user
   * @param {string} userId - User ID
   * @param {Object} context - Context data (location, weather, time, etc.)
   * @param {Object} filters - User-applied filters
   * @returns {Array} Ranked activity recommendations
   */
  async getPersonalizedRecommendations(userId, context = {}, filters = {}) {
    try {
      console.log(`🤖 Generating AI recommendations for user: ${userId}`);
      
      // Get user profile and preferences
      const user = await this.getUserWithPreferences(userId);
      
      // Analyze user behavior patterns
      const behaviorProfile = await this.analyzeBehaviorPatterns(userId);
      
      // Get base activity pool
      const baseActivities = await this.getActivityPool(user, context, filters);
      
      // Score each activity using AI algorithms
      const scoredActivities = await Promise.all(
        baseActivities.map(async (activity) => {
          const score = await this.calculateActivityScore(user, activity, context, behaviorProfile);
          return {
            activity,
            aiScore: score.total,
            scoreBreakdown: score.breakdown,
            confidence: score.confidence,
            reasoning: score.reasoning
          };
        })
      );

      // Apply advanced filtering and ranking
      const recommendations = this.rankAndFilterRecommendations(scoredActivities, filters);
      
      // Add diversity to prevent echo chamber
      const diverseRecommendations = this.applyDiversityFilter(recommendations);
      
      console.log(`✅ Generated ${diverseRecommendations.length} AI recommendations`);
      return diverseRecommendations.slice(0, filters.limit || 20);

    } catch (error) {
      console.error('❌ AI recommendation error:', error);
      throw error;
    }
  }

  /**
   * Calculate AI-powered activity score for a user
   * @param {Object} user - User object with preferences
   * @param {Object} activity - Activity object
   * @param {Object} context - Current context (time, weather, location)
   * @param {Object} behaviorProfile - User's behavior patterns
   * @returns {Object} Score with breakdown and reasoning
   */
  async calculateActivityScore(user, activity, context, behaviorProfile) {
    const scoreComponents = {
      personalPreference: this.calculatePersonalPreferenceScore(user, activity),
      behavioralMatch: this.calculateBehavioralMatchScore(behaviorProfile, activity),
      contextualRelevance: this.calculateContextualScore(activity, context),
      socialFactors: await this.calculateSocialScore(user, activity),
      noveltyFactor: this.calculateNoveltyScore(user, activity),
      timeOptimality: this.calculateTimeOptimalityScore(activity, context),
      weatherSuitability: this.calculateWeatherScore(activity, context.weather),
      popularityBoost: await this.calculatePopularityScore(activity),
      seasonalRelevance: this.calculateSeasonalScore(activity, context.season)
    };

    // Weight the components
    const weights = {
      personalPreference: 0.25,
      behavioralMatch: 0.20,
      contextualRelevance: 0.15,
      socialFactors: 0.12,
      noveltyFactor: 0.10,
      timeOptimality: 0.08,
      weatherSuitability: 0.05,
      popularityBoost: 0.03,
      seasonalRelevance: 0.02
    };

    let totalScore = 0;
    const reasoning = [];

    Object.entries(scoreComponents).forEach(([component, score]) => {
      totalScore += score * weights[component];
      
      if (score > 0.7) {
        reasoning.push(this.getReasoningText(component, score));
      }
    });

    // Calculate confidence based on data availability
    const confidence = this.calculateConfidence(user, activity, behaviorProfile);

    return {
      total: Math.min(1, totalScore),
      breakdown: scoreComponents,
      confidence,
      reasoning
    };
  }

  /**
   * Calculate personal preference score based on user profile
   */
  calculatePersonalPreferenceScore(user, activity) {
    let score = 0.5; // Base score

    // Interest matching
    const userInterests = user.profile.interests || [];
    const activityTags = activity.tags || [];
    const commonInterests = userInterests.filter(interest => 
      activityTags.includes(interest) || activity.category === interest
    );
    
    if (commonInterests.length > 0) {
      score += 0.3 * (commonInterests.length / Math.max(userInterests.length, 1));
    }

    // Energy level matching
    if (user.profile.energyLevel) {
      const energyMatch = this.matchEnergyLevel(user.profile.energyLevel, activity.energyLevel);
      score += 0.2 * energyMatch;
    }

    // Age appropriateness
    if (activity.ageRange) {
      const userAge = user.profile.age;
      if (userAge >= activity.ageRange.min && userAge <= activity.ageRange.max) {
        score += 0.1;
      }
    }

    return Math.min(1, score);
  }

  /**
   * Calculate behavioral match score based on past behavior
   */
  calculateBehavioralMatchScore(behaviorProfile, activity) {
    let score = 0.5;

    // Preferred activity categories
    if (behaviorProfile.preferredCategories.includes(activity.category)) {
      score += 0.3;
    }

    // Preferred time patterns
    const activityTimePreference = this.categories[activity.category]?.timePreference || [];
    if (behaviorProfile.activeTimePreferences.some(time => activityTimePreference.includes(time))) {
      score += 0.2;
    }

    // Social vs solo preference
    if (activity.maxParticipants > 1 && behaviorProfile.socialPreference > 0.6) {
      score += 0.2;
    } else if (activity.maxParticipants === 1 && behaviorProfile.socialPreference < 0.4) {
      score += 0.2;
    }

    return Math.min(1, score);
  }

  /**
   * Calculate contextual relevance score
   */
  calculateContextualScore(activity, context) {
    let score = 0.5;

    // Location proximity
    if (context.userLocation && activity.location) {
      const distance = this.calculateDistance(
        context.userLocation.coordinates,
        activity.location.coordinates
      );
      
      if (distance <= 5000) { // Within 5km
        score += 0.3 * (1 - distance / 5000);
      }
    }

    // Current availability
    if (activity.availability && activity.availability.immediate) {
      score += 0.2;
    }

    return Math.min(1, score);
  }

  /**
   * Calculate social factors score
   */
  async calculateSocialScore(user, activity) {
    let score = 0.5;

    try {
      // Check if user's matches are interested in similar activities
      const userMatches = await Match.find({ users: user._id }).populate('users');
      
      for (const match of userMatches) {
        const otherUser = match.users.find(u => u._id.toString() !== user._id.toString());
        if (otherUser && otherUser.profile.interests) {
          const hasCommonInterest = otherUser.profile.interests.some(interest => 
            activity.tags?.includes(interest) || activity.category === interest
          );
          if (hasCommonInterest) {
            score += 0.1;
          }
        }
      }

      // Activity popularity among similar users
      const similarUsers = await this.findSimilarUsers(user);
      const participationBySiminar = await this.getActivityParticipation(activity._id, similarUsers);
      
      if (participationBySiminar > 0) {
        score += 0.2 * Math.min(1, participationBySiminar / 10);
      }

    } catch (error) {
      console.error('Social score calculation error:', error);
    }

    return Math.min(1, score);
  }

  /**
   * Calculate novelty score to promote discovery
   */
  calculateNoveltyScore(user, activity) {
    // Check if user has done similar activities recently
    // This would require activity history tracking
    
    // For now, boost newer activities and uncommon categories
    const activityAge = Date.now() - new Date(activity.createdAt).getTime();
    const daysSinceCreated = activityAge / (1000 * 60 * 60 * 24);
    
    let noveltyScore = 0.5;
    
    if (daysSinceCreated < 7) { // New activity
      noveltyScore += 0.3;
    }
    
    // Boost less common categories
    const categoryPopularity = this.categories[activity.category]?.weight || 1;
    if (categoryPopularity < 1) {
      noveltyScore += 0.2;
    }
    
    return Math.min(1, noveltyScore);
  }

  /**
   * Calculate time optimality score
   */
  calculateTimeOptimalityScore(activity, context) {
    if (!context.currentTime) return 0.5;

    const currentHour = new Date(context.currentTime).getHours();
    const timeOfDay = this.getTimeOfDay(currentHour);
    
    const categoryTimePrefs = this.categories[activity.category]?.timePreference || [];
    
    if (categoryTimePrefs.includes(timeOfDay)) {
      return 0.8;
    }
    
    return 0.3;
  }

  /**
   * Calculate weather suitability score
   */
  calculateWeatherScore(activity, weather) {
    if (!weather || !weather.condition) return 0.5;

    const suitableCategories = this.weatherActivities[weather.condition] || [];
    
    if (suitableCategories.includes(activity.category)) {
      return 0.8;
    }
    
    // Indoor activities are good for bad weather
    if (['rainy', 'snowy'].includes(weather.condition) && 
        ['indoor', 'entertainment', 'cultural'].includes(activity.category)) {
      return 0.7;
    }
    
    return 0.4;
  }

  /**
   * Calculate popularity score based on user engagement
   */
  async calculatePopularityScore(activity) {
    try {
      const participantCount = activity.participants?.length || 0;
      const maxParticipants = activity.maxParticipants || 10;
      const participationRate = participantCount / maxParticipants;
      
      // Sweet spot is 40-80% full
      if (participationRate >= 0.4 && participationRate <= 0.8) {
        return 0.8;
      } else if (participationRate < 0.4) {
        return 0.6; // Still has space
      } else {
        return 0.3; // Might be full
      }
      
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Calculate seasonal relevance score
   */
  calculateSeasonalScore(activity, season) {
    const seasonalCategories = {
      'spring': ['outdoor', 'active', 'social'],
      'summer': ['outdoor', 'active', 'social', 'food'],
      'fall': ['cultural', 'social', 'food'],
      'winter': ['indoor', 'romantic', 'entertainment', 'cultural']
    };

    const relevantCategories = seasonalCategories[season] || [];
    
    if (relevantCategories.includes(activity.category)) {
      return 0.7;
    }
    
    return 0.5;
  }

  /**
   * Analyze user behavior patterns
   */
  async analyzeBehaviorPatterns(userId) {
    try {
      // Analyze swipe patterns
      const swipes = await UserSwipe.find({ user: userId }).limit(100);
      const likedActivities = swipes.filter(s => s.action === 'like');
      
      // Analyze message patterns
      const messages = await Message.find({ sender: userId }).limit(50);
      
      // Extract patterns
      const preferredCategories = this.extractPreferredCategories(likedActivities);
      const activeTimePreferences = this.extractTimePreferences(messages);
      const socialPreference = this.calculateSocialPreference(likedActivities);
      
      return {
        preferredCategories,
        activeTimePreferences,
        socialPreference,
        dataPoints: swipes.length + messages.length
      };
      
    } catch (error) {
      console.error('Behavior analysis error:', error);
      return {
        preferredCategories: [],
        activeTimePreferences: ['afternoon'],
        socialPreference: 0.5,
        dataPoints: 0
      };
    }
  }

  /**
   * Get activity pool based on basic filters
   */
  async getActivityPool(user, context, filters) {
    const query = {
      status: 'active',
      startDate: { $gte: new Date() }
    };

    // Apply basic filters
    if (filters.category) {
      query.category = filters.category;
    }
    
    if (filters.maxDistance && context.userLocation) {
      query['location.coordinates'] = {
        $near: {
          $geometry: context.userLocation,
          $maxDistance: filters.maxDistance * 1000
        }
      };
    }

    if (filters.priceRange) {
      query.price = {
        $gte: filters.priceRange.min || 0,
        $lte: filters.priceRange.max || 1000
      };
    }

    return await Activity.find(query).limit(100);
  }

  /**
   * Apply diversity filter to recommendations
   */
  applyDiversityFilter(recommendations) {
    const diverse = [];
    const seenCategories = new Set();
    const maxPerCategory = 3;
    const categoryCount = {};

    // Sort by score first
    recommendations.sort((a, b) => b.aiScore - a.aiScore);

    for (const rec of recommendations) {
      const category = rec.activity.category;
      const currentCount = categoryCount[category] || 0;

      if (currentCount < maxPerCategory) {
        diverse.push(rec);
        categoryCount[category] = currentCount + 1;
        seenCategories.add(category);
      }
    }

    return diverse;
  }

  // Helper methods

  getUserWithPreferences(userId) {
    return User.findById(userId)
      .populate('profile.interests')
      .select('profile preferences lastActive');
  }

  matchEnergyLevel(userLevel, activityLevel) {
    const levels = { low: 1, medium: 2, high: 3 };
    const userLevelNum = levels[userLevel] || 2;
    const activityLevelNum = levels[activityLevel] || 2;
    const diff = Math.abs(userLevelNum - activityLevelNum);
    return (3 - diff) / 3;
  }

  getTimeOfDay(hour) {
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  calculateDistance(coords1, coords2) {
    const [lon1, lat1] = coords1;
    const [lon2, lat2] = coords2;
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  calculateConfidence(user, activity, behaviorProfile) {
    let confidence = 0.5;
    
    if (user.profile.interests && user.profile.interests.length > 0) confidence += 0.2;
    if (behaviorProfile.dataPoints > 10) confidence += 0.2;
    if (activity.ratings && activity.ratings.length > 5) confidence += 0.1;
    
    return Math.min(1, confidence);
  }

  getReasoningText(component, score) {
    const explanations = {
      personalPreference: 'Matches your interests and preferences',
      behavioralMatch: 'Based on your activity patterns',
      contextualRelevance: 'Perfect for your current location and time',
      socialFactors: 'Popular among people like you',
      noveltyFactor: 'Something new to try',
      timeOptimality: 'Great timing for this activity',
      weatherSuitability: 'Perfect for current weather',
      popularityBoost: 'Trending activity',
      seasonalRelevance: 'Seasonal favorite'
    };
    
    return explanations[component] || 'AI recommended';
  }

  extractPreferredCategories(likedActivities) {
    const categories = {};
    likedActivities.forEach(activity => {
      const category = activity.category || 'general';
      categories[category] = (categories[category] || 0) + 1;
    });
    
    return Object.entries(categories)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([category]) => category);
  }

  extractTimePreferences(messages) {
    const timePrefs = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    
    messages.forEach(message => {
      const hour = new Date(message.timestamp).getHours();
      const timeOfDay = this.getTimeOfDay(hour);
      timePrefs[timeOfDay]++;
    });
    
    return Object.entries(timePrefs)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 2)
      .map(([time]) => time);
  }

  calculateSocialPreference(likedActivities) {
    const socialActivities = likedActivities.filter(a => 
      a.maxParticipants > 1 || ['social', 'entertainment'].includes(a.category)
    );
    
    return likedActivities.length > 0 ? socialActivities.length / likedActivities.length : 0.5;
  }

  async findSimilarUsers(user) {
    // Find users with similar interests and demographics
    const similarUsers = await User.find({
      'profile.age': { 
        $gte: user.profile.age - 5, 
        $lte: user.profile.age + 5 
      },
      'profile.interests': { 
        $in: user.profile.interests || [] 
      },
      _id: { $ne: user._id }
    }).limit(20);
    
    return similarUsers.map(u => u._id);
  }

  async getActivityParticipation(activityId, userIds) {
    const activity = await Activity.findById(activityId);
    if (!activity) return 0;
    
    const participatingUsers = activity.participants?.filter(p => 
      userIds.includes(p.user)
    ) || [];
    
    return participatingUsers.length;
  }

  rankAndFilterRecommendations(scoredActivities, filters) {
    let filtered = scoredActivities;
    
    // Filter by minimum score
    if (filters.minScore) {
      filtered = filtered.filter(item => item.aiScore >= filters.minScore);
    }
    
    // Sort by AI score
    filtered.sort((a, b) => b.aiScore - a.aiScore);
    
    return filtered;
  }
}

module.exports = AIActivityRecommendation;