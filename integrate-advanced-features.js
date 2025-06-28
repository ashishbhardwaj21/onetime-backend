/**
 * Integration Script for Advanced Features
 * Adds all next-generation features to the existing server
 */

const express = require('express');

// Import all advanced route modules
const appleAuthRoutes = require('./routes/apple-auth');
const allAdvancedRoutes = require('./routes/all-advanced-features');

// Import middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const User = require('./models/User');
    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

/**
 * Integrate all advanced features into the Express app
 * @param {Express} app - Express application instance
 */
function integrateAdvancedFeatures(app) {
  console.log('🚀 Integrating advanced features...');

  // Apple Authentication Routes (no auth required)
  app.use('/api/auth/apple', appleAuthRoutes);

  // System endpoints (no auth required)
  const InfrastructureScaling = require('./services/InfrastructureScaling');
  
  app.get('/api/system/health', async (req, res) => {
    try {
      const infrastructure = new InfrastructureScaling();
      const health = await infrastructure.healthCheck();
      
      res.status(health.status === 'healthy' ? 200 : 503).json({
        success: health.status === 'healthy',
        message: `System status: ${health.status}`,
        data: health
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        error: 'Health check failed',
        message: error.message
      });
    }
  });

  // Advanced features status endpoint (no auth required)
  app.get('/api/advanced/status', async (req, res) => {
    try {
      res.status(200).json({
        success: true,
        message: 'Advanced features are active',
        data: {
          version: '2.0.0',
          features: {
            appleSignIn: true,
            pushNotifications: true,
            securityFraudDetection: true,
            infrastructureScaling: true,
            adminAnalytics: true,
            contentModeration: true,
            advancedMatching: true,
            locationServices: true,
            aiRecommendations: true
          },
          endpoints: {
            authentication: [
              'POST /api/auth/apple/signin',
              'POST /api/auth/apple/link',
              'GET /api/auth/apple/status'
            ],
            systemHealth: [
              'GET /api/system/health',
              'GET /api/system/performance',
              'GET /api/advanced/status'
            ],
            advancedFeatures: [
              'POST /api/advanced/notifications/register-device',
              'GET /api/advanced/matching/enhanced',
              'POST /api/advanced/smart-swipe',
              'GET /api/advanced/location/nearby',
              'GET /api/advanced/ai/recommendations',
              'POST /api/advanced/moderation/analyze',
              'GET /api/advanced/security/analysis'
            ]
          },
          authenticationRequired: 'Most endpoints require Bearer token authentication',
          publicEndpoints: [
            '/api/auth/apple/*',
            '/api/system/health',
            '/api/advanced/status'
          ]
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get status',
        message: error.message
      });
    }
  });

  // All other advanced features (require authentication)
  app.use('/api/advanced', authenticateToken, allAdvancedRoutes);

  // Additional enhanced endpoints
  
  // Enhanced discovery with AI and caching
  app.get('/api/discovery/ai-powered', authenticateToken, async (req, res) => {
    try {
      const AIActivityRecommendation = require('./services/AIActivityRecommendation');
      const InfrastructureScaling = require('./services/InfrastructureScaling');
      
      const aiService = new AIActivityRecommendation();
      const infrastructure = new InfrastructureScaling();
      
      const userId = req.user._id;
      const cacheKey = `ai_discovery:${userId}:${JSON.stringify(req.query)}`;
      
      // Try cache first
      let recommendations = await infrastructure.getCache(cacheKey);
      
      if (!recommendations) {
        const context = {
          userLocation: req.user.profile.location,
          currentTime: new Date(),
          weather: req.query.weather ? JSON.parse(req.query.weather) : null
        };

        const filters = {
          category: req.query.category,
          maxDistance: parseInt(req.query.maxDistance) || 25,
          limit: parseInt(req.query.limit) || 10
        };

        recommendations = await aiService.getPersonalizedRecommendations(userId, context, filters);
        
        // Cache for 30 minutes
        await infrastructure.setCache(cacheKey, recommendations, 'matchingResults');
      }

      res.status(200).json({
        success: true,
        message: 'AI-powered discovery results',
        data: {
          recommendations,
          cached: !!recommendations,
          algorithm: 'ai_discovery_v2'
        }
      });

    } catch (error) {
      console.error('AI discovery error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get AI recommendations'
      });
    }
  });

  // Enhanced messaging with moderation
  app.post('/api/messages/send-enhanced', authenticateToken, async (req, res) => {
    try {
      const ContentModerationSystem = require('./services/ContentModerationSystem');
      const PushNotificationService = require('./services/PushNotificationService');
      const SecurityFraudDetection = require('./services/SecurityFraudDetection');
      
      const moderation = new ContentModerationSystem();
      const pushService = new PushNotificationService();
      const security = new SecurityFraudDetection();
      
      const { receiverId, content, messageType = 'text' } = req.body;
      const senderId = req.user._id;

      // Security check
      const fraudCheck = await security.detectRealTimeFraud(
        senderId,
        'message',
        { content, receiverId },
        { ip: req.ip, userAgent: req.get('User-Agent'), userId: senderId }
      );

      if (!fraudCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Message blocked due to security concerns'
        });
      }

      // Content moderation
      const moderationResult = await moderation.moderateTextContent(content, senderId, 'message');

      if (moderationResult.action === 'block') {
        return res.status(400).json({
          success: false,
          error: 'Message blocked due to inappropriate content',
          moderation: {
            violations: moderationResult.violations,
            score: moderationResult.score
          }
        });
      }

      // Check if conversation exists
      const Conversation = require('./models/Conversation');
      let conversation = await Conversation.findOne({
        participants: { $all: [senderId, receiverId] }
      });

      if (!conversation) {
        conversation = new Conversation({
          participants: [senderId, receiverId],
          createdAt: new Date(),
          lastMessageAt: new Date()
        });
        await conversation.save();
      }

      // Create message
      const Message = require('./models/Message');
      const message = new Message({
        conversation: conversation._id,
        sender: senderId,
        receiver: receiverId,
        content,
        messageType,
        moderationResult: {
          action: moderationResult.action,
          score: moderationResult.score,
          violations: moderationResult.violations
        },
        timestamp: new Date()
      });

      await message.save();

      // Update conversation
      conversation.lastMessage = message._id;
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // Send push notification
      const User = require('./models/User');
      const receiver = await User.findById(receiverId);
      if (receiver) {
        await pushService.sendMessageNotification(receiverId, req.user, content);
      }

      console.log('💬 Enhanced message sent:', { 
        messageId: message._id, 
        moderation: moderationResult.action,
        security: fraudCheck.allowed ? 'passed' : 'blocked'
      });

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: {
          messageId: message._id,
          conversationId: conversation._id,
          timestamp: message.timestamp,
          moderation: {
            action: moderationResult.action,
            passed: moderationResult.action !== 'block'
          },
          security: {
            passed: fraudCheck.allowed,
            riskScore: fraudCheck.riskScore
          }
        }
      });

    } catch (error) {
      console.error('Enhanced messaging error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send message'
      });
    }
  });

  // Real-time location updates with nearby detection
  app.post('/api/location/live-update', authenticateToken, async (req, res) => {
    try {
      const LocationBasedDiscovery = require('./services/LocationBasedDiscovery');
      const PushNotificationService = require('./services/PushNotificationService');
      
      const locationService = new LocationBasedDiscovery();
      const pushService = new PushNotificationService();
      
      const userId = req.user._id;
      const { location, preferences } = req.body;

      // Update location
      const result = await locationService.updateUserLocation(userId, location, preferences);

      // Check for nearby users and send notification if any
      if (result.nearbyUsers && result.nearbyUsers.length > 0) {
        await pushService.sendNearbyUsersNotification(userId, result.nearbyUsers.length);
      }

      res.status(200).json({
        success: true,
        message: 'Live location updated',
        data: {
          ...result,
          timestamp: new Date(),
          nearbyCount: result.nearbyUsers?.length || 0
        }
      });

    } catch (error) {
      console.error('Live location update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update live location'
      });
    }
  });

  // Complete user analytics endpoint
  app.get('/api/user/complete-analytics', authenticateToken, async (req, res) => {
    try {
      const SecurityFraudDetection = require('./services/SecurityFraudDetection');
      const AdminAnalyticsDashboard = require('./services/AdminAnalyticsDashboard');
      const InfrastructureScaling = require('./services/InfrastructureScaling');
      
      const security = new SecurityFraudDetection();
      const analytics = new AdminAnalyticsDashboard();
      const infrastructure = new InfrastructureScaling();
      
      const userId = req.user._id;
      const cacheKey = `user_analytics:${userId}`;
      
      // Try cache first
      let userAnalytics = await infrastructure.getCache(cacheKey);
      
      if (!userAnalytics) {
        const [securityAnalysis, behaviorAnalysis] = await Promise.all([
          security.analyzeBehaviorPatterns(userId, { includeRecent: true }),
          analytics.getUserMetrics() // This would be adapted for single user
        ]);

        userAnalytics = {
          security: {
            riskLevel: securityAnalysis.riskLevel,
            riskScore: securityAnalysis.riskScore,
            patterns: securityAnalysis.patterns
          },
          behavior: behaviorAnalysis,
          profile: {
            completeness: calculateProfileCompleteness(req.user),
            optimization: getProfileOptimizationSuggestions(req.user)
          },
          engagement: {
            level: 'high', // This would be calculated
            suggestions: [
              'Try updating your profile photos',
              'Add more interests to improve matches',
              'Be more active in conversations'
            ]
          }
        };

        // Cache for 1 hour
        await infrastructure.setCache(cacheKey, userAnalytics, 'userProfile');
      }

      res.status(200).json({
        success: true,
        message: 'Complete user analytics retrieved',
        data: userAnalytics
      });

    } catch (error) {
      console.error('User analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user analytics'
      });
    }
  });

  // Performance monitoring endpoint
  app.get('/api/system/performance', async (req, res) => {
    try {
      const InfrastructureScaling = require('./services/InfrastructureScaling');
      const infrastructure = new InfrastructureScaling();
      
      const health = await infrastructure.healthCheck();
      const recommendations = infrastructure.getScalingRecommendations();

      res.status(200).json({
        success: true,
        message: 'System performance data',
        data: {
          health,
          recommendations,
          timestamp: new Date()
        }
      });

    } catch (error) {
      console.error('Performance monitoring error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get performance data'
      });
    }
  });

  console.log('✅ Advanced features integrated successfully!');
  console.log('📡 New endpoints available:');
  console.log('  - /api/auth/apple/* (Apple Sign-In)');
  console.log('  - /api/advanced/* (All advanced features)');
  console.log('  - /api/discovery/ai-powered (AI discovery)');
  console.log('  - /api/messages/send-enhanced (Enhanced messaging)');
  console.log('  - /api/location/live-update (Live location)');
  console.log('  - /api/user/complete-analytics (User analytics)');
  console.log('  - /api/system/performance (Performance monitoring)');
}

// Helper functions
function calculateProfileCompleteness(user) {
  let score = 0;
  const profile = user.profile;
  
  if (profile.photos && profile.photos.length >= 3) score += 25;
  if (profile.bio && profile.bio.length >= 50) score += 20;
  if (profile.interests && profile.interests.length >= 3) score += 20;
  if (profile.location) score += 15;
  if (user.verification?.email?.verified) score += 10;
  if (user.verification?.phone?.verified) score += 10;
  
  return Math.min(100, score);
}

function getProfileOptimizationSuggestions(user) {
  const suggestions = [];
  const profile = user.profile;
  
  if (!profile.photos || profile.photos.length < 3) {
    suggestions.push('Add more profile photos (minimum 3 recommended)');
  }
  
  if (!profile.bio || profile.bio.length < 50) {
    suggestions.push('Write a more detailed bio (50+ characters)');
  }
  
  if (!profile.interests || profile.interests.length < 3) {
    suggestions.push('Add more interests to improve matching');
  }
  
  if (!user.verification?.email?.verified) {
    suggestions.push('Verify your email address');
  }
  
  return suggestions;
}

module.exports = { integrateAdvancedFeatures };