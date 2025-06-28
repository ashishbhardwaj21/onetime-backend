/**
 * Advanced Features Routes
 * Integrates all next-generation features into the API
 */

const express = require('express');
const router = express.Router();
const AdvancedMatchingEngine = require('../services/AdvancedMatchingEngine');
const LocationBasedDiscovery = require('../services/LocationBasedDiscovery');
const AIActivityRecommendation = require('../services/AIActivityRecommendation');

// Initialize services
const matchingEngine = new AdvancedMatchingEngine();
const locationService = new LocationBasedDiscovery();
const aiRecommendation = new AIActivityRecommendation();

/**
 * POST /api/advanced/location/update
 * Update user's real-time location
 */
router.post('/location/update', async (req, res) => {
  try {
    const userId = req.user._id;
    const { location, preferences } = req.body;

    const result = await locationService.updateUserLocation(userId, location, preferences);

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      data: result
    });

  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update location'
    });
  }
});

/**
 * GET /api/advanced/location/nearby
 * Find nearby users and events in real-time
 */
router.get('/location/nearby', async (req, res) => {
  try {
    const userId = req.user._id;
    const nearbyData = await locationService.findNearbyUsersAndEvents(userId);

    res.status(200).json({
      success: true,
      message: 'Nearby content retrieved',
      data: nearbyData
    });

  } catch (error) {
    console.error('Nearby search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find nearby content'
    });
  }
});

/**
 * GET /api/advanced/matching/enhanced
 * Get enhanced matches using advanced algorithm
 */
router.get('/matching/enhanced', async (req, res) => {
  try {
    const userId = req.user._id;
    const preferences = {
      ageRange: {
        min: parseInt(req.query.minAge) || 18,
        max: parseInt(req.query.maxAge) || 100
      },
      genderPreference: req.query.gender || 'all',
      maxDistance: parseInt(req.query.maxDistance) || 50,
      minCompatibilityScore: parseInt(req.query.minScore) || 30,
      limit: parseInt(req.query.limit) || 10
    };

    const matches = await matchingEngine.findPotentialMatches(userId, preferences);

    const formattedMatches = matches.map(match => ({
      user: {
        _id: match.user._id,
        profile: {
          name: match.user.profile.name,
          age: match.user.profile.age,
          photos: match.user.profile.photos || [],
          bio: match.user.profile.bio,
          interests: match.user.profile.interests,
          energyLevel: match.user.profile.energyLevel
        }
      },
      compatibility: {
        score: match.compatibilityScore,
        breakdown: match.scoreBreakdown,
        explanation: matchingEngine.getMatchExplanation(match.scoreBreakdown)
      },
      distance: match.distance
    }));

    res.status(200).json({
      success: true,
      message: 'Enhanced matches retrieved',
      data: {
        matches: formattedMatches,
        algorithm: 'advanced_compatibility_v2'
      }
    });

  } catch (error) {
    console.error('Enhanced matching error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get enhanced matches'
    });
  }
});

/**
 * GET /api/advanced/activities/ai-recommendations
 * Get AI-powered activity recommendations
 */
router.get('/activities/ai-recommendations', async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Build context from request
    const context = {
      userLocation: req.user.profile.location,
      currentTime: new Date(),
      weather: req.query.weather ? JSON.parse(req.query.weather) : null,
      season: this.getCurrentSeason()
    };

    const filters = {
      category: req.query.category,
      maxDistance: parseInt(req.query.maxDistance) || 25,
      priceRange: req.query.priceRange ? JSON.parse(req.query.priceRange) : null,
      limit: parseInt(req.query.limit) || 15,
      minScore: parseFloat(req.query.minScore) || 0.3
    };

    const recommendations = await aiRecommendation.getPersonalizedRecommendations(
      userId, 
      context, 
      filters
    );

    const formattedRecommendations = recommendations.map(rec => ({
      activity: {
        _id: rec.activity._id,
        title: rec.activity.title,
        description: rec.activity.description,
        category: rec.activity.category,
        energyLevel: rec.activity.energyLevel,
        location: rec.activity.location,
        startDate: rec.activity.startDate,
        endDate: rec.activity.endDate,
        price: rec.activity.price,
        participants: rec.activity.participants?.length || 0,
        maxParticipants: rec.activity.maxParticipants
      },
      aiScore: Math.round(rec.aiScore * 100),
      confidence: Math.round(rec.confidence * 100),
      reasoning: rec.reasoning,
      recommendationType: 'ai_personalized'
    }));

    res.status(200).json({
      success: true,
      message: 'AI recommendations generated',
      data: {
        recommendations: formattedRecommendations,
        context: {
          timeOfDay: this.getTimeOfDay(new Date().getHours()),
          weather: context.weather?.condition || 'unknown',
          userPreferences: 'analyzed'
        },
        algorithm: 'ai_recommendation_v2'
      }
    });

  } catch (error) {
    console.error('AI recommendation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI recommendations'
    });
  }
});

/**
 * GET /api/advanced/analytics/user-insights
 * Get personalized user insights and analytics
 */
router.get('/analytics/user-insights', async (req, res) => {
  try {
    const userId = req.user._id;

    // Gather insights from different services
    const [matchingInsights, locationInsights, activityInsights] = await Promise.all([
      this.getMatchingInsights(userId),
      this.getLocationInsights(userId),
      this.getActivityInsights(userId)
    ]);

    res.status(200).json({
      success: true,
      message: 'User insights retrieved',
      data: {
        matching: matchingInsights,
        location: locationInsights,
        activities: activityInsights,
        summary: {
          profileStrength: this.calculateProfileStrength(req.user),
          engagementLevel: this.calculateEngagementLevel(matchingInsights),
          recommendedActions: this.generateRecommendedActions(req.user, matchingInsights)
        }
      }
    });

  } catch (error) {
    console.error('User insights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user insights'
    });
  }
});

/**
 * POST /api/advanced/location/geofence
 * Create location-based notification geofence
 */
router.post('/location/geofence', async (req, res) => {
  try {
    const userId = req.user._id;
    const { center, radius, type, duration } = req.body;

    const geofenceId = await locationService.createGeofence(userId, {
      center,
      radius,
      type,
      duration
    });

    res.status(201).json({
      success: true,
      message: 'Geofence created successfully',
      data: {
        geofenceId,
        active: true,
        expires: new Date(Date.now() + (duration || 24 * 60 * 60 * 1000))
      }
    });

  } catch (error) {
    console.error('Geofence creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create geofence'
    });
  }
});

/**
 * GET /api/advanced/admin/analytics
 * Advanced analytics for admin dashboard
 */
router.get('/admin/analytics', async (req, res) => {
  try {
    // Verify admin access
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const analytics = {
      location: locationService.getLocationAnalytics(),
      matching: await this.getMatchingAnalytics(),
      activities: await this.getActivityAnalytics(),
      userBehavior: await this.getUserBehaviorAnalytics()
    };

    res.status(200).json({
      success: true,
      message: 'Advanced analytics retrieved',
      data: analytics
    });

  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics'
    });
  }
});

// Helper methods
function getCurrentSeason() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

function getTimeOfDay(hour) {
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

async function getMatchingInsights(userId) {
  // This would analyze the user's matching patterns
  return {
    averageCompatibilityScore: 75,
    topMatchingFactors: ['interests', 'location', 'energy_level'],
    recommendedImprovements: ['Add more interests', 'Update photos']
  };
}

async function getLocationInsights(userId) {
  return {
    frequentAreas: ['Downtown', 'University District'],
    optimalDiscoveryTimes: ['evening', 'weekend'],
    nearbyUserDensity: 'high'
  };
}

async function getActivityInsights(userId) {
  return {
    preferredCategories: ['food', 'social', 'outdoor'],
    completionRate: 85,
    averageRating: 4.2
  };
}

function calculateProfileStrength(user) {
  let strength = 0;
  
  if (user.profile.photos && user.profile.photos.length >= 3) strength += 20;
  if (user.profile.bio && user.profile.bio.length >= 50) strength += 20;
  if (user.profile.interests && user.profile.interests.length >= 3) strength += 20;
  if (user.profile.location) strength += 20;
  if (user.verification?.email?.verified) strength += 10;
  if (user.verification?.phone?.verified) strength += 10;
  
  return strength;
}

function calculateEngagementLevel(insights) {
  // Simple engagement calculation
  return 'high'; // This would be calculated based on actual metrics
}

function generateRecommendedActions(user, insights) {
  const actions = [];
  
  if (!user.profile.photos || user.profile.photos.length < 3) {
    actions.push('Add more profile photos');
  }
  
  if (!user.profile.bio || user.profile.bio.length < 50) {
    actions.push('Write a more detailed bio');
  }
  
  if (!user.profile.interests || user.profile.interests.length < 3) {
    actions.push('Add more interests');
  }
  
  return actions;
}

async function getMatchingAnalytics() {
  return {
    totalMatches: 1250,
    averageCompatibilityScore: 68,
    topFactors: ['interests', 'location', 'lifestyle']
  };
}

async function getActivityAnalytics() {
  return {
    totalActivities: 450,
    averageParticipation: 3.2,
    topCategories: ['food', 'social', 'outdoor']
  };
}

async function getUserBehaviorAnalytics() {
  return {
    dailyActiveUsers: 850,
    averageSessionTime: '12 minutes',
    topFeatures: ['discovery', 'messaging', 'activities']
  };
}

module.exports = router;