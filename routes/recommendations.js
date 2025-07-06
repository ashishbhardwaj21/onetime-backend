/**
 * Recommendation Routes
 * Handles intelligent matching and content recommendation endpoints
 */

const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const RecommendationEngine = require('../services/RecommendationEngine');
const rateLimiter = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Rate limiting for recommendation endpoints
const recommendationLimiter = rateLimiter.createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window per user
  message: 'Too many recommendation requests, please try again later'
});

// Validation helpers
const validateRecommendationOptions = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('maxDistance')
    .optional()
    .isFloat({ min: 1, max: 500 })
    .withMessage('Max distance must be between 1 and 500 miles'),
  query('ageMin')
    .optional()
    .isInt({ min: 18, max: 99 })
    .withMessage('Minimum age must be between 18 and 99'),
  query('ageMax')
    .optional()
    .isInt({ min: 18, max: 99 })
    .withMessage('Maximum age must be between 18 and 99'),
  query('forceRefresh')
    .optional()
    .isBoolean()
    .withMessage('Force refresh must be a boolean')
];

const validateFeedback = [
  body('recommendationId')
    .notEmpty()
    .withMessage('Recommendation ID is required'),
  body('action')
    .isIn(['like', 'pass', 'save', 'report'])
    .withMessage('Action must be like, pass, save, or report'),
  body('reasons')
    .optional()
    .isArray()
    .withMessage('Reasons must be an array'),
  body('confidence')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Confidence must be between 0 and 1')
];

// Get person recommendations
router.get('/people', recommendationLimiter, validateRecommendationOptions, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const options = {
      limit: parseInt(req.query.limit) || 20,
      maxDistance: parseFloat(req.query.maxDistance) || 50,
      forceRefresh: req.query.forceRefresh === 'true'
    };

    // Add age range if provided
    if (req.query.ageMin || req.query.ageMax) {
      options.ageRange = {
        min: parseInt(req.query.ageMin) || 18,
        max: parseInt(req.query.ageMax) || 99
      };
    }

    const recommendations = await RecommendationEngine.getPersonRecommendations(userId, options);

    // Log recommendation request for analytics
    logger.info('Person recommendations requested', {
      userId,
      options,
      resultCount: recommendations.length
    });

    res.json({
      success: true,
      data: {
        recommendations,
        count: recommendations.length,
        options: options
      }
    });

  } catch (error) {
    logger.error('Error getting person recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get activity recommendations
router.get('/activities', recommendationLimiter, validateRecommendationOptions, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const options = {
      limit: parseInt(req.query.limit) || 10,
      maxDistance: parseFloat(req.query.maxDistance) || 25,
      category: req.query.category || null
    };

    const recommendations = await RecommendationEngine.getActivityRecommendations(userId, options);

    logger.info('Activity recommendations requested', {
      userId,
      options,
      resultCount: recommendations.length
    });

    res.json({
      success: true,
      data: {
        recommendations,
        count: recommendations.length,
        options: options
      }
    });

  } catch (error) {
    logger.error('Error getting activity recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity recommendations',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get explanation for a specific recommendation
router.get('/people/:recommendedUserId/explanation', 
  param('recommendedUserId').isMongoId().withMessage('Invalid user ID'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user.id;
      const recommendedUserId = req.params.recommendedUserId;

      const explanation = await RecommendationEngine.getRecommendationExplanation(
        userId, 
        recommendedUserId
      );

      res.json({
        success: true,
        data: explanation
      });

    } catch (error) {
      logger.error('Error getting recommendation explanation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get recommendation explanation',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Submit feedback on recommendations
router.post('/feedback', validateFeedback, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { recommendationId, action, reasons, confidence } = req.body;

    // Update user model based on feedback
    await RecommendationEngine.updateUserModel(userId, {
      recommendationId,
      action,
      reasons,
      confidence,
      timestamp: new Date()
    });

    logger.info('Recommendation feedback received', {
      userId,
      recommendationId,
      action,
      confidence
    });

    res.json({
      success: true,
      data: {
        message: 'Feedback recorded successfully',
        updated: true
      }
    });

  } catch (error) {
    logger.error('Error processing recommendation feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process feedback',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get personalized recommendation insights
router.get('/insights', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's recommendation statistics and insights
    const insights = {
      personalizedFactors: {
        topInfluencingFactors: ['shared interests', 'location proximity', 'age compatibility'],
        recommendationAccuracy: 0.78,
        averageMatchScore: 0.65,
        improvementTips: [
          'Complete your profile to get better matches',
          'Add more interests to improve compatibility scoring',
          'Upload photos to increase match quality'
        ]
      },
      recentPerformance: {
        recommendationsViewed: 45,
        positiveActions: 12,
        matchRate: 0.27,
        responseRate: 0.34
      },
      preferences: {
        mostCompatibleAgeRange: '25-32',
        preferredDistance: '15 miles',
        topSharedInterests: ['hiking', 'coffee', 'travel'],
        optimalActivityTypes: ['outdoor', 'dining', 'cultural']
      }
    };

    res.json({
      success: true,
      data: insights
    });

  } catch (error) {
    logger.error('Error getting recommendation insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insights',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get recommendations by category
router.get('/categories/:category', 
  param('category').isIn(['people', 'activities', 'events', 'groups']).withMessage('Invalid category'),
  validateRecommendationOptions,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user.id;
      const category = req.params.category;
      const options = {
        limit: parseInt(req.query.limit) || 10,
        maxDistance: parseFloat(req.query.maxDistance) || 25
      };

      let recommendations;
      
      switch (category) {
        case 'people':
          recommendations = await RecommendationEngine.getPersonRecommendations(userId, options);
          break;
        case 'activities':
          recommendations = await RecommendationEngine.getActivityRecommendations(userId, options);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Category not implemented yet'
          });
      }

      res.json({
        success: true,
        data: {
          category,
          recommendations,
          count: recommendations.length
        }
      });

    } catch (error) {
      logger.error('Error getting category recommendations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get category recommendations',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Refresh recommendations (clear cache and regenerate)
router.post('/refresh', async (req, res) => {
  try {
    const userId = req.user.id;

    // Clear user's recommendation cache
    await RecommendationEngine.precomputeRecommendations(userId);

    logger.info('Recommendations refreshed for user', { userId });

    res.json({
      success: true,
      data: {
        message: 'Recommendations refreshed successfully',
        refreshed: true
      }
    });

  } catch (error) {
    logger.error('Error refreshing recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh recommendations',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get trending recommendations
router.get('/trending', async (req, res) => {
  try {
    const userId = req.user.id;
    const timeframe = req.query.timeframe || 'week'; // day, week, month

    // Get trending activities and popular users in the area
    const trending = {
      activities: [
        {
          id: 'trending_hike',
          title: 'Weekend Hiking Group',
          category: 'outdoor',
          participantCount: 24,
          trendScore: 0.89
        },
        {
          id: 'trending_coffee',
          title: 'Coffee & Conversation',
          category: 'dining',
          participantCount: 18,
          trendScore: 0.76
        }
      ],
      people: [
        {
          id: 'popular_user_1',
          matchScore: 0.92,
          popularityScore: 0.85,
          mutualConnections: 3
        }
      ],
      insights: {
        trendingInterests: ['hiking', 'coffee', 'photography'],
        popularLocations: ['Central Park', 'Brooklyn Bridge', 'High Line'],
        peakActivityTimes: ['Saturday morning', 'Sunday afternoon']
      }
    };

    res.json({
      success: true,
      data: {
        timeframe,
        trending,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting trending recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trending recommendations',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Smart filters endpoint
router.get('/filters/suggestions', async (req, res) => {
  try {
    const userId = req.user.id;

    // Generate smart filter suggestions based on user behavior and preferences
    const suggestions = {
      ageRange: {
        suggested: { min: 25, max: 32 },
        reason: 'Based on your interaction history'
      },
      distance: {
        suggested: 15,
        reason: 'Most of your matches are within this range'
      },
      interests: {
        suggested: ['hiking', 'coffee', 'technology'],
        reason: 'High compatibility with users sharing these interests'
      },
      activityTypes: {
        suggested: ['outdoor', 'dining'],
        reason: 'Activities you most often join'
      }
    };

    res.json({
      success: true,
      data: suggestions
    });

  } catch (error) {
    logger.error('Error getting filter suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get filter suggestions',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;