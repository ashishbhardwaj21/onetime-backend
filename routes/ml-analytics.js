/**
 * Machine Learning Analytics Routes
 * Provides ML-powered insights and predictions
 */

const express = require('express');
const router = express.Router();
const { query, param, body, validationResult } = require('express-validator');
const MachineLearningService = require('../services/MachineLearningService');
const rateLimiter = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Rate limiting for ML endpoints
const mlLimiter = rateLimiter.createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window per user (ML operations are expensive)
  message: 'Too many ML requests, please try again later'
});

// Get user compatibility prediction
router.get('/compatibility/:targetUserId',
  mlLimiter,
  param('targetUserId').isMongoId().withMessage('Invalid target user ID'),
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
      const targetUserId = req.params.targetUserId;

      const prediction = await MachineLearningService.predictUserCompatibility(
        userId, 
        targetUserId
      );

      logger.info('Compatibility prediction requested', {
        userId,
        targetUserId,
        compatibility: prediction.compatibility
      });

      res.json({
        success: true,
        data: {
          targetUserId,
          compatibility: prediction.compatibility,
          confidence: prediction.confidence,
          features: prediction.features,
          interpretation: {
            level: prediction.compatibility > 0.8 ? 'very_high' :
                   prediction.compatibility > 0.6 ? 'high' :
                   prediction.compatibility > 0.4 ? 'medium' :
                   prediction.compatibility > 0.2 ? 'low' : 'very_low',
            description: prediction.compatibility > 0.6 ? 
              'Strong compatibility indicators' : 
              'Some compatibility concerns'
          }
        }
      });

    } catch (error) {
      logger.error('Error getting compatibility prediction:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to predict compatibility',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Get activity engagement prediction
router.get('/activity-engagement/:activityId',
  mlLimiter,
  param('activityId').isMongoId().withMessage('Invalid activity ID'),
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
      const activityId = req.params.activityId;

      const prediction = await MachineLearningService.predictActivityEngagement(
        userId, 
        activityId
      );

      res.json({
        success: true,
        data: {
          activityId,
          engagementScore: prediction.engagementScore,
          likelihood: prediction.likelihood,
          reasons: prediction.reasons,
          recommendation: prediction.likelihood === 'very_high' || prediction.likelihood === 'high' ?
            'Highly recommended' : 'Consider joining'
        }
      });

    } catch (error) {
      logger.error('Error getting activity engagement prediction:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to predict activity engagement',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Get churn risk assessment
router.get('/churn-risk', mlLimiter, async (req, res) => {
  try {
    const userId = req.user.id;

    const prediction = await MachineLearningService.predictChurnRisk(userId);

    logger.info('Churn risk assessment requested', {
      userId,
      riskLevel: prediction.riskLevel,
      churnRisk: prediction.churnRisk
    });

    res.json({
      success: true,
      data: {
        churnRisk: prediction.churnRisk,
        riskLevel: prediction.riskLevel,
        interventions: prediction.interventions,
        factors: prediction.factors,
        assessment: {
          message: prediction.riskLevel === 'high' ? 
            'We miss you! Here are some suggestions to re-engage.' :
            prediction.riskLevel === 'medium' ?
            'Stay connected with these recommendations.' :
            'Great engagement! Keep it up.',
          urgency: prediction.riskLevel
        }
      }
    });

  } catch (error) {
    logger.error('Error getting churn risk assessment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assess churn risk',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user engagement scoring
router.get('/engagement-score', mlLimiter, async (req, res) => {
  try {
    const userId = req.user.id;

    const scoring = await MachineLearningService.scoreUserEngagement(userId);

    res.json({
      success: true,
      data: {
        engagementLevel: scoring.level,
        score: scoring.score,
        distribution: scoring.distribution,
        recommendations: scoring.recommendations,
        insights: {
          percentile: Math.round(scoring.score * 100),
          category: scoring.level,
          nextLevel: this.getNextEngagementLevel(scoring.level),
          improvement: this.getEngagementImprovementTips(scoring.level)
        }
      }
    });

  } catch (error) {
    logger.error('Error getting engagement score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to score engagement',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Train models (admin only)
router.post('/train/:modelName',
  param('modelName').isIn(['userCompatibility', 'activityRecommendation', 'churnPrediction', 'engagementScoring'])
    .withMessage('Invalid model name'),
  async (req, res) => {
    try {
      // Check if user is admin (you would implement admin middleware)
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const modelName = req.params.modelName;
      
      logger.info('Model training initiated', { modelName, userId: req.user.id });

      // Start training asynchronously
      let result;
      switch (modelName) {
        case 'userCompatibility':
          result = await MachineLearningService.trainUserCompatibilityModel();
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Model training not implemented for this model'
          });
      }

      res.json({
        success: true,
        data: {
          modelName,
          trainingStatus: result ? 'completed' : 'failed',
          message: result ? 'Model trained successfully' : 'Training failed'
        }
      });

    } catch (error) {
      logger.error('Error training model:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to train model',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Get model performance metrics (admin only)
router.get('/model-performance/:modelName',
  param('modelName').isIn(['userCompatibility', 'activityRecommendation', 'churnPrediction', 'engagementScoring'])
    .withMessage('Invalid model name'),
  async (req, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const modelName = req.params.modelName;
      const performance = await MachineLearningService.getModelPerformance(modelName);

      res.json({
        success: true,
        data: {
          modelName,
          performance: performance || {
            message: 'No performance data available'
          }
        }
      });

    } catch (error) {
      logger.error('Error getting model performance:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get model performance',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Submit feedback for model improvement
router.post('/feedback',
  body('modelType').isIn(['compatibility', 'activity', 'churn', 'engagement'])
    .withMessage('Invalid model type'),
  body('predictionId').notEmpty().withMessage('Prediction ID is required'),
  body('actualOutcome').notEmpty().withMessage('Actual outcome is required'),
  body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
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
      const { modelType, predictionId, actualOutcome, rating, comment } = req.body;

      const feedback = {
        userId,
        modelType,
        predictionId,
        actualOutcome,
        rating,
        comment,
        timestamp: new Date()
      };

      // Update model with feedback
      await MachineLearningService.updateModelWithFeedback(modelType, feedback);

      logger.info('ML model feedback received', feedback);

      res.json({
        success: true,
        data: {
          message: 'Feedback recorded successfully',
          feedbackId: predictionId
        }
      });

    } catch (error) {
      logger.error('Error recording ML feedback:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to record feedback',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Get personalized insights dashboard
router.get('/insights', mlLimiter, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get multiple ML insights for dashboard
    const [
      churnRisk,
      engagementScore
    ] = await Promise.all([
      MachineLearningService.predictChurnRisk(userId),
      MachineLearningService.scoreUserEngagement(userId)
    ]);

    const insights = {
      engagement: {
        level: engagementScore.level,
        score: engagementScore.score,
        recommendations: engagementScore.recommendations.slice(0, 3)
      },
      retention: {
        riskLevel: churnRisk.riskLevel,
        risk: churnRisk.churnRisk,
        interventions: churnRisk.interventions.slice(0, 2)
      },
      optimization: {
        profileStrength: Math.random() * 0.3 + 0.7, // Placeholder
        matchPotential: Math.random() * 0.2 + 0.8,   // Placeholder
        activityFit: Math.random() * 0.25 + 0.75     // Placeholder
      },
      trends: {
        weeklyEngagement: 'increasing',
        matchQuality: 'stable',
        activityParticipation: 'growing'
      }
    };

    res.json({
      success: true,
      data: insights
    });

  } catch (error) {
    logger.error('Error getting ML insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insights',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Batch compatibility predictions
router.post('/batch-compatibility',
  body('targetUserIds').isArray().withMessage('Target user IDs must be an array'),
  body('targetUserIds.*').isMongoId().withMessage('Invalid user ID in array'),
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
      const { targetUserIds } = req.body;

      if (targetUserIds.length > 10) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 10 users per batch request'
        });
      }

      const predictions = await Promise.all(
        targetUserIds.map(async (targetId) => {
          try {
            const prediction = await MachineLearningService.predictUserCompatibility(
              userId, 
              targetId
            );
            return {
              targetUserId: targetId,
              compatibility: prediction.compatibility,
              confidence: prediction.confidence,
              success: true
            };
          } catch (error) {
            return {
              targetUserId: targetId,
              error: error.message,
              success: false
            };
          }
        })
      );

      res.json({
        success: true,
        data: {
          predictions,
          totalRequested: targetUserIds.length,
          successful: predictions.filter(p => p.success).length
        }
      });

    } catch (error) {
      logger.error('Error getting batch compatibility predictions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get batch predictions',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Helper methods
function getNextEngagementLevel(currentLevel) {
  const levels = ['very_low', 'low', 'medium', 'high', 'very_high'];
  const currentIndex = levels.indexOf(currentLevel);
  return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : null;
}

function getEngagementImprovementTips(level) {
  const tips = {
    very_low: ['Complete your profile', 'Upload quality photos', 'Start conversations'],
    low: ['Be more active in messaging', 'Join activities', 'Improve your bio'],
    medium: ['Try premium features', 'Attend events', 'Be consistent'],
    high: ['Share experiences', 'Help newcomers', 'Try new features'],
    very_high: ['Become a community leader', 'Organize events', 'Provide feedback']
  };
  
  return tips[level] || tips.medium;
}

module.exports = router;