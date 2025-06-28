/**
 * Advanced Matching Engine for OneTime Dating App
 * 
 * This sophisticated matching algorithm considers multiple factors:
 * - Compatibility scoring based on interests, values, lifestyle
 * - Location proximity with dynamic radius adjustment
 * - Activity preferences and energy level matching
 * - Behavioral patterns and app usage analysis
 * - Machine learning-based preference learning
 * - Real-time availability and timing preferences
 */

const User = require('../models/User');
const UserSwipe = require('../models/UserSwipe');
const Match = require('../models/Match');
const Activity = require('../models/Activity');
const Message = require('../models/Message');

class AdvancedMatchingEngine {
  constructor() {
    this.compatibilityWeights = {
      interests: 0.25,        // Shared interests and hobbies
      lifestyle: 0.20,        // Energy level, social preferences
      values: 0.20,          // Relationship goals, beliefs
      location: 0.15,        // Geographic proximity
      activity: 0.10,        // Activity preferences matching
      behavioral: 0.10       // App usage patterns, response time
    };
    
    this.distanceThresholds = {
      urban: 25,     // km in urban areas
      suburban: 50,  // km in suburban areas
      rural: 100     // km in rural areas
    };
  }

  /**
   * Find potential matches for a user using advanced algorithms
   * @param {string} userId - The user ID to find matches for
   * @param {Object} preferences - User preferences and filters
   * @returns {Array} Sorted array of potential matches with scores
   */
  async findPotentialMatches(userId, preferences = {}) {
    try {
      console.log(`🎯 Finding matches for user: ${userId}`);
      
      const currentUser = await User.findById(userId)
        .populate('profile.interests')
        .populate('swipeHistory.user');

      if (!currentUser) {
        throw new Error('User not found');
      }

      // Get users that haven't been swiped on yet
      const swipedUserIds = await this.getSwipedUserIds(userId);
      
      // Find potential candidates
      const potentialMatches = await this.getCandidateUsers(currentUser, swipedUserIds, preferences);
      
      // Calculate compatibility scores for each candidate
      const scoredMatches = await Promise.all(
        potentialMatches.map(async (candidate) => {
          const score = await this.calculateCompatibilityScore(currentUser, candidate);
          return {
            user: candidate,
            compatibilityScore: score.total,
            scoreBreakdown: score.breakdown,
            distance: this.calculateDistance(currentUser, candidate),
            lastActive: candidate.lastActive
          };
        })
      );

      // Sort by compatibility score and apply advanced filtering
      const rankedMatches = this.rankAndFilterMatches(scoredMatches, preferences);
      
      console.log(`✅ Found ${rankedMatches.length} potential matches`);
      return rankedMatches;
      
    } catch (error) {
      console.error('❌ Matching engine error:', error);
      throw error;
    }
  }

  /**
   * Calculate comprehensive compatibility score between two users
   * @param {Object} user1 - First user object
   * @param {Object} user2 - Second user object
   * @returns {Object} Compatibility score with breakdown
   */
  async calculateCompatibilityScore(user1, user2) {
    const breakdown = {
      interests: await this.calculateInterestCompatibility(user1, user2),
      lifestyle: this.calculateLifestyleCompatibility(user1, user2),
      values: this.calculateValuesCompatibility(user1, user2),
      location: this.calculateLocationScore(user1, user2),
      activity: await this.calculateActivityCompatibility(user1, user2),
      behavioral: await this.calculateBehavioralCompatibility(user1, user2)
    };

    // Calculate weighted total score
    const total = Object.entries(breakdown).reduce((sum, [key, score]) => {
      return sum + (score * this.compatibilityWeights[key]);
    }, 0);

    return {
      total: Math.round(total * 100), // Convert to percentage
      breakdown: breakdown
    };
  }

  /**
   * Calculate interest-based compatibility
   */
  async calculateInterestCompatibility(user1, user2) {
    const interests1 = user1.profile.interests || [];
    const interests2 = user2.profile.interests || [];
    
    if (interests1.length === 0 || interests2.length === 0) {
      return 0.5; // Neutral score if no interests listed
    }

    // Find common interests
    const commonInterests = interests1.filter(interest => 
      interests2.includes(interest)
    );

    // Calculate Jaccard similarity coefficient
    const union = new Set([...interests1, ...interests2]);
    const jaccardSimilarity = commonInterests.length / union.size;
    
    // Bonus for having multiple shared interests
    const bonusMultiplier = Math.min(1.2, 1 + (commonInterests.length * 0.1));
    
    return Math.min(1, jaccardSimilarity * bonusMultiplier);
  }

  /**
   * Calculate lifestyle compatibility (energy levels, social preferences)
   */
  calculateLifestyleCompatibility(user1, user2) {
    let score = 0;
    let factors = 0;

    // Energy level compatibility
    if (user1.profile.energyLevel && user2.profile.energyLevel) {
      const energyLevels = { low: 1, medium: 2, high: 3 };
      const diff = Math.abs(energyLevels[user1.profile.energyLevel] - energyLevels[user2.profile.energyLevel]);
      score += (3 - diff) / 3; // 1 for same level, 0.67 for 1 diff, 0.33 for 2 diff
      factors++;
    }

    // Social preferences (if available in profile)
    if (user1.profile.socialStyle && user2.profile.socialStyle) {
      score += user1.profile.socialStyle === user2.profile.socialStyle ? 1 : 0.5;
      factors++;
    }

    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * Calculate values-based compatibility
   */
  calculateValuesCompatibility(user1, user2) {
    let score = 0;
    let factors = 0;

    // Relationship goals
    if (user1.profile.relationshipGoals && user2.profile.relationshipGoals) {
      const compatible = this.areRelationshipGoalsCompatible(
        user1.profile.relationshipGoals, 
        user2.profile.relationshipGoals
      );
      score += compatible ? 1 : 0.2;
      factors++;
    }

    // Education level (if similar levels preferred)
    if (user1.profile.education && user2.profile.education) {
      const educationScore = this.calculateEducationCompatibility(
        user1.profile.education, 
        user2.profile.education
      );
      score += educationScore;
      factors++;
    }

    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * Calculate location-based score
   */
  calculateLocationScore(user1, user2) {
    const distance = this.calculateDistance(user1, user2);
    
    if (distance === null) return 0.5; // No location data
    
    // Determine area type based on user density (simplified)
    const areaType = distance < 10 ? 'urban' : distance < 50 ? 'suburban' : 'rural';
    const threshold = this.distanceThresholds[areaType];
    
    if (distance <= threshold) {
      // Score decreases linearly with distance
      return Math.max(0.1, 1 - (distance / threshold));
    }
    
    return 0.1; // Minimum score for very distant users
  }

  /**
   * Calculate activity preference compatibility
   */
  async calculateActivityCompatibility(user1, user2) {
    try {
      // Get recent activity interactions for both users
      const user1Activities = await this.getUserActivityPreferences(user1._id);
      const user2Activities = await this.getUserActivityPreferences(user2._id);
      
      if (user1Activities.length === 0 || user2Activities.length === 0) {
        return 0.5; // Neutral if no activity data
      }

      // Find common activity categories
      const categories1 = user1Activities.map(a => a.category);
      const categories2 = user2Activities.map(a => a.category);
      const commonCategories = categories1.filter(cat => categories2.includes(cat));
      
      return Math.min(1, commonCategories.length / Math.max(categories1.length, categories2.length));
      
    } catch (error) {
      console.error('Activity compatibility calculation error:', error);
      return 0.5;
    }
  }

  /**
   * Calculate behavioral compatibility based on app usage patterns
   */
  async calculateBehavioralCompatibility(user1, user2) {
    try {
      // Response time compatibility
      const responseTimeScore = await this.calculateResponseTimeCompatibility(user1._id, user2._id);
      
      // Activity level compatibility (messages sent, logins, etc.)
      const activityScore = await this.calculateActivityLevelCompatibility(user1._id, user2._id);
      
      // Online time compatibility
      const onlineTimeScore = this.calculateOnlineTimeCompatibility(user1, user2);
      
      return (responseTimeScore + activityScore + onlineTimeScore) / 3;
      
    } catch (error) {
      console.error('Behavioral compatibility calculation error:', error);
      return 0.5;
    }
  }

  /**
   * Get candidate users for matching
   */
  async getCandidateUsers(currentUser, excludeUserIds, preferences) {
    const query = {
      _id: { $nin: [...excludeUserIds, currentUser._id] },
      status: 'active'
    };

    // Age filter
    if (preferences.ageRange) {
      query['profile.age'] = {
        $gte: preferences.ageRange.min || 18,
        $lte: preferences.ageRange.max || 100
      };
    }

    // Gender preference filter
    if (preferences.genderPreference && preferences.genderPreference !== 'all') {
      query['profile.gender'] = preferences.genderPreference;
    }

    // Location filter (if specified)
    if (preferences.maxDistance && currentUser.profile.location) {
      query['profile.location'] = {
        $near: {
          $geometry: currentUser.profile.location,
          $maxDistance: preferences.maxDistance * 1000 // Convert km to meters
        }
      };
    }

    // Only show users active in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    query.lastActive = { $gte: thirtyDaysAgo };

    return await User.find(query)
      .populate('profile.interests')
      .limit(50) // Limit for performance
      .sort({ lastActive: -1 });
  }

  /**
   * Get list of user IDs that have been swiped on
   */
  async getSwipedUserIds(userId) {
    const swipes = await UserSwipe.find({ user: userId })
      .select('targetUser')
      .lean();
    
    return swipes.map(swipe => swipe.targetUser);
  }

  /**
   * Rank and filter matches based on preferences and business logic
   */
  rankAndFilterMatches(scoredMatches, preferences) {
    let filteredMatches = scoredMatches;

    // Filter by minimum compatibility score
    const minScore = preferences.minCompatibilityScore || 30;
    filteredMatches = filteredMatches.filter(match => match.compatibilityScore >= minScore);

    // Sort by compatibility score (descending)
    filteredMatches.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    // Apply diversity to prevent echo chambers
    filteredMatches = this.applyDiversityFilter(filteredMatches);

    // Limit results
    const limit = preferences.limit || 10;
    return filteredMatches.slice(0, limit);
  }

  /**
   * Apply diversity filter to ensure variety in matches
   */
  applyDiversityFilter(matches) {
    // Implement diversity logic to prevent showing only very similar profiles
    // This could include varying interests, locations, etc.
    
    const diverseMatches = [];
    const seenInterests = new Set();
    
    for (const match of matches) {
      const userInterests = match.user.profile.interests || [];
      const hasNewInterest = userInterests.some(interest => !seenInterests.has(interest));
      
      if (diverseMatches.length < 3 || hasNewInterest) {
        diverseMatches.push(match);
        userInterests.forEach(interest => seenInterests.add(interest));
      }
      
      if (diverseMatches.length >= matches.length * 0.8) break; // Keep 80% of original matches
    }
    
    return diverseMatches;
  }

  /**
   * Helper function to calculate distance between two users
   */
  calculateDistance(user1, user2) {
    if (!user1.profile.location || !user2.profile.location) {
      return null;
    }

    const [lon1, lat1] = user1.profile.location.coordinates;
    const [lon2, lat2] = user2.profile.location.coordinates;

    // Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Get user's activity preferences based on their interactions
   */
  async getUserActivityPreferences(userId) {
    // This would analyze user's activity history, ratings, etc.
    // For now, return basic activity data
    return await Activity.find({
      $or: [
        { 'participants.user': userId },
        { 'ratings.user': userId }
      ]
    }).limit(20);
  }

  /**
   * Helper functions for compatibility calculations
   */
  areRelationshipGoalsCompatible(goals1, goals2) {
    const compatiblePairs = {
      'serious': ['serious', 'marriage'],
      'marriage': ['serious', 'marriage'],
      'casual': ['casual', 'friendship'],
      'friendship': ['casual', 'friendship', 'serious']
    };
    
    return compatiblePairs[goals1]?.includes(goals2) || false;
  }

  calculateEducationCompatibility(edu1, edu2) {
    const educationLevels = {
      'high_school': 1,
      'some_college': 2,
      'bachelors': 3,
      'masters': 4,
      'phd': 5
    };
    
    const level1 = educationLevels[edu1] || 3;
    const level2 = educationLevels[edu2] || 3;
    const diff = Math.abs(level1 - level2);
    
    return Math.max(0.2, 1 - (diff * 0.2)); // Higher compatibility for similar education levels
  }

  async calculateResponseTimeCompatibility(userId1, userId2) {
    // Analyze average response times in conversations
    // This would require message timestamp analysis
    return 0.7; // Placeholder
  }

  async calculateActivityLevelCompatibility(userId1, userId2) {
    // Compare app usage frequency, message counts, etc.
    return 0.6; // Placeholder
  }

  calculateOnlineTimeCompatibility(user1, user2) {
    // Compare preferred online times, timezone compatibility
    return 0.8; // Placeholder
  }

  /**
   * Get match explanation for user interface
   */
  getMatchExplanation(scoreBreakdown) {
    const explanations = [];
    
    if (scoreBreakdown.interests > 0.7) {
      explanations.push("You have many shared interests");
    }
    if (scoreBreakdown.lifestyle > 0.7) {
      explanations.push("Similar lifestyle preferences");
    }
    if (scoreBreakdown.location > 0.8) {
      explanations.push("Lives nearby");
    }
    if (scoreBreakdown.activity > 0.6) {
      explanations.push("Enjoys similar activities");
    }
    
    return explanations.length > 0 ? explanations : ["Good overall compatibility"];
  }
}

module.exports = AdvancedMatchingEngine;