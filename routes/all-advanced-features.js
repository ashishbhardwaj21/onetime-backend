/**
 * Complete Advanced Features Integration
 * Unified routes for all next-generation features
 */

const express = require('express');
const router = express.Router();

// Import all advanced services
const AppleAuthService = require('../services/AppleAuthService');
const PushNotificationService = require('../services/PushNotificationService');
const SecurityFraudDetection = require('../services/SecurityFraudDetection');
const InfrastructureScaling = require('../services/InfrastructureScaling');
const AdminAnalyticsDashboard = require('../services/AdminAnalyticsDashboard');
const ContentModerationSystem = require('../services/ContentModerationSystem');
const AdvancedMatchingEngine = require('../services/AdvancedMatchingEngine');
const LocationBasedDiscovery = require('../services/LocationBasedDiscovery');
const AIActivityRecommendation = require('../services/AIActivityRecommendation');

// Initialize services
const appleAuth = new AppleAuthService();
const pushNotifications = new PushNotificationService();
const security = new SecurityFraudDetection();
const infrastructure = new InfrastructureScaling();
const analytics = new AdminAnalyticsDashboard();
const moderation = new ContentModerationSystem();
const matching = new AdvancedMatchingEngine();
const location = new LocationBasedDiscovery();
const aiRecommendations = new AIActivityRecommendation();

// Middleware for fraud detection
const fraudDetectionMiddleware = async (req, res, next) => {
  try {
    if (req.user) {
      const requestInfo = {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user._id
      };

      const fraudCheck = await security.detectRealTimeFraud(
        req.user._id,
        req.route.path.split('/').pop(),
        req.body,
        requestInfo
      );

      if (!fraudCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Action blocked due to security concerns',
          code: 'SECURITY_BLOCK'
        });
      }

      if (fraudCheck.requiresCaptcha) {
        res.set('X-Requires-Captcha', 'true');
      }

      if (fraudCheck.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, fraudCheck.delay));
      }
    }
    next();
  } catch (error) {
    console.error('Fraud detection middleware error:', error);
    next(); // Continue on error
  }
};

// ===================
// APPLE AUTHENTICATION
// ===================

router.post('/auth/apple/signin', async (req, res) => {
  try {
    const { identityToken, authorizationCode, user } = req.body;
    const requestInfo = { ip: req.ip, userAgent: req.get('User-Agent') };

    // Security analysis for registration
    if (user) { // New user registration
      const securityAnalysis = await security.analyzeRegistration(
        { email: user.email || 'apple_user' },
        requestInfo
      );

      if (!securityAnalysis.allowRegistration) {
        return res.status(403).json({
          success: false,
          error: 'Registration blocked due to security concerns',
          code: 'SECURITY_BLOCK'
        });
      }
    }

    const result = await appleAuth.authenticateWithApple(identityToken, authorizationCode, user);
    
    res.status(200).json({
      success: true,
      message: result.userType === 'new_user' ? 
        'Account created with Apple ID' : 'Signed in with Apple ID',
      ...result
    });

  } catch (error) {
    console.error('Apple Sign-In error:', error);
    res.status(500).json({
      success: false,
      error: 'Apple Sign-In failed'
    });
  }
});

// ===================
// PUSH NOTIFICATIONS
// ===================

router.post('/notifications/register-device', async (req, res) => {
  try {
    const { deviceToken, platform } = req.body;
    const userId = req.user._id;

    const result = await pushNotifications.registerDeviceToken(userId, deviceToken, platform);
    
    res.status(200).json({
      success: true,
      message: 'Device registered for notifications',
      data: result
    });

  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register device'
    });
  }
});

router.put('/notifications/preferences', async (req, res) => {
  try {
    const userId = req.user._id;
    const preferences = req.body;

    const result = await pushNotifications.updateNotificationPreferences(userId, preferences);
    
    res.status(200).json({
      success: true,
      message: 'Notification preferences updated',
      data: result
    });

  } catch (error) {
    console.error('Notification preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences'
    });
  }
});

router.post('/notifications/test', async (req, res) => {
  try {
    const userId = req.user._id;
    const { templateKey, data } = req.body;

    const result = await pushNotifications.sendNotificationToUser(userId, templateKey, data);
    
    res.status(200).json({
      success: true,
      message: 'Test notification sent',
      data: result
    });

  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification'
    });
  }
});

// ===================
// ADVANCED MATCHING
// ===================

router.get('/matching/enhanced', async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = `enhanced_matching:${userId}:${JSON.stringify(req.query)}`;
    
    // Try cached results first
    let matches = await infrastructure.getCache(cacheKey);
    
    if (!matches) {
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

      matches = await matching.findPotentialMatches(userId, preferences);
      
      // Cache results
      await infrastructure.setCache(cacheKey, matches, 'matchingResults');
    }

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
        explanation: matching.getMatchExplanation(match.scoreBreakdown)
      },
      distance: match.distance
    }));

    res.status(200).json({
      success: true,
      message: 'Enhanced matches retrieved',
      data: {
        matches: formattedMatches,
        algorithm: 'advanced_compatibility_v2',
        cached: !!matches
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

// ===================
// LOCATION SERVICES
// ===================

router.post('/location/update', async (req, res) => {
  try {
    const userId = req.user._id;
    const { location, preferences } = req.body;

    const result = await location.updateUserLocation(userId, location, preferences);

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

router.get('/location/nearby', async (req, res) => {
  try {
    const userId = req.user._id;
    const nearbyData = await location.findNearbyUsersAndEvents(userId);

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

// ===================
// AI RECOMMENDATIONS
// ===================

router.get('/ai/recommendations', async (req, res) => {
  try {
    const userId = req.user._id;
    
    const context = {
      userLocation: req.user.profile.location,
      currentTime: new Date(),
      weather: req.query.weather ? JSON.parse(req.query.weather) : null,
      season: getCurrentSeason()
    };

    const filters = {
      category: req.query.category,
      maxDistance: parseInt(req.query.maxDistance) || 25,
      priceRange: req.query.priceRange ? JSON.parse(req.query.priceRange) : null,
      limit: parseInt(req.query.limit) || 15,
      minScore: parseFloat(req.query.minScore) || 0.3
    };

    const recommendations = await aiRecommendations.getPersonalizedRecommendations(
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
          timeOfDay: getTimeOfDay(new Date().getHours()),
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

// ===================
// CONTENT MODERATION
// ===================

router.post('/moderation/report', async (req, res) => {
  try {
    const { contentId, reason, details } = req.body;
    const reporterId = req.user._id;

    const result = await moderation.reportContent(contentId, reporterId, reason, details);

    res.status(200).json({
      success: true,
      message: 'Content reported successfully',
      data: result
    });

  } catch (error) {
    console.error('Content reporting error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to report content'
    });
  }
});

router.post('/moderation/analyze', async (req, res) => {
  try {
    const { content, contentType } = req.body;
    const userId = req.user._id;

    const result = await moderation.moderateTextContent(content, userId, contentType);

    res.status(200).json({
      success: true,
      message: 'Content analyzed',
      data: {
        action: result.action,
        score: result.score,
        violations: result.violations,
        approved: result.action === 'approved'
      }
    });

  } catch (error) {
    console.error('Content moderation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze content'
    });
  }
});

// ===================
// SECURITY & FRAUD
// ===================

router.get('/security/analysis', async (req, res) => {
  try {
    const userId = req.user._id;
    
    const behaviorAnalysis = await security.analyzeBehaviorPatterns(userId, {
      includeRecent: true
    });

    res.status(200).json({
      success: true,
      message: 'Security analysis completed',
      data: {
        riskLevel: behaviorAnalysis.riskLevel,
        riskScore: behaviorAnalysis.riskScore,
        patterns: behaviorAnalysis.patterns,
        recommendations: behaviorAnalysis.recommendedActions
      }
    });

  } catch (error) {
    console.error('Security analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform security analysis'
    });
  }
});

// ===================
// ADMIN ANALYTICS
// ===================

router.get('/admin/dashboard', async (req, res) => {
  try {
    // Verify admin access
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const dashboardData = await analytics.getDashboardOverview();

    res.status(200).json({
      success: true,
      message: 'Admin dashboard data retrieved',
      data: dashboardData
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard data'
    });
  }
});

// ===================
// INFRASTRUCTURE
// ===================

router.get('/system/health', async (req, res) => {
  try {
    const health = await infrastructure.healthCheck();

    res.status(health.status === 'healthy' ? 200 : 503).json({
      success: health.status === 'healthy',
      message: `System status: ${health.status}`,
      data: health
    });

  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      success: false,
      error: 'Health check failed'
    });
  }
});

router.get('/system/scaling', async (req, res) => {
  try {
    const recommendations = infrastructure.getScalingRecommendations();

    res.status(200).json({
      success: true,
      message: 'Scaling recommendations retrieved',
      data: recommendations
    });

  } catch (error) {
    console.error('Scaling recommendations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get scaling recommendations'
    });
  }
});

// ===================
// SMART SWIPE WITH ALL FEATURES
// ===================

router.post('/smart-swipe', fraudDetectionMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { targetUserId, action, feedback } = req.body;

    // Get compatibility score
    const [currentUser, targetUser] = await Promise.all([
      infrastructure.getCachedUserProfile(currentUserId),
      infrastructure.getCachedUserProfile(targetUserId)
    ]);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Target user not found'
      });
    }

    // Calculate compatibility
    const compatibility = await matching.calculateCompatibilityScore(currentUser, targetUser);

    // Moderate the swipe action (check for spam patterns)
    const moderationResult = await moderation.moderateTextContent(
      feedback || '', 
      currentUserId, 
      'swipe_feedback'
    );

    if (moderationResult.action === 'block') {
      return res.status(400).json({
        success: false,
        error: 'Swipe blocked due to inappropriate content'
      });
    }

    // Create swipe with enhanced data
    const UserSwipe = require('../models/UserSwipe');
    const swipe = new UserSwipe({
      user: currentUserId,
      targetUser: targetUserId,
      action,
      timestamp: new Date(),
      compatibilityScoreAtSwipe: compatibility.total,
      scoreBreakdown: compatibility.breakdown,
      userFeedback: feedback,
      moderationResult: {
        action: moderationResult.action,
        score: moderationResult.score
      }
    });

    await swipe.save();

    // Check for match
    let isMatch = false;
    let match = null;

    if (action === 'like') {
      const reciprocalSwipe = await UserSwipe.findOne({
        user: targetUserId,
        targetUser: currentUserId,
        action: 'like'
      });

      if (reciprocalSwipe) {
        const Match = require('../models/Match');
        match = new Match({
          users: [currentUserId, targetUserId],
          compatibility: {
            score: compatibility.total,
            breakdown: compatibility.breakdown
          },
          status: 'active',
          createdAt: new Date()
        });

        await match.save();
        isMatch = true;

        // Send push notifications
        await Promise.all([
          pushNotifications.sendMatchNotification(currentUserId, targetUser),
          pushNotifications.sendMatchNotification(targetUserId, currentUser)
        ]);
      }
    }

    // Clear relevant caches
    await infrastructure.deleteCache(`enhanced_matching:${currentUserId}:*`);

    res.status(200).json({
      success: true,
      message: `Swiped ${action} successfully`,
      data: {
        swipeId: swipe._id,
        action,
        isMatch,
        match: isMatch ? {
          _id: match._id,
          compatibilityScore: compatibility.total,
          user: {
            _id: targetUser._id,
            name: targetUser.profile.name,
            photos: targetUser.profile.photos
          }
        } : null,
        analytics: {
          compatibilityScore: compatibility.total,
          moderationPassed: moderationResult.action !== 'block',
          enhancedFeatures: true
        }
      }
    });

  } catch (error) {
    console.error('Smart swipe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process swipe'
    });
  }
});

// Helper functions
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

module.exports = router;