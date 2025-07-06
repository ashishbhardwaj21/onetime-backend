/**
 * User Onboarding Routes
 * Handles step-by-step user onboarding process
 */

const express = require('express');
const router = express.Router();
const OnboardingService = require('../services/OnboardingService');
const User = require('../models/User');

// Initialize onboarding service
const onboardingService = new OnboardingService();

/**
 * Initialize onboarding for user
 * POST /api/onboarding/initialize
 */
router.post('/initialize', async (req, res) => {
  try {
    const userId = req.user._id;
    const { registrationData = {} } = req.body;

    const result = await onboardingService.initializeOnboarding(userId, registrationData);

    res.status(201).json({
      success: true,
      message: 'Onboarding initialized successfully',
      data: result
    });

  } catch (error) {
    console.error('Initialize onboarding error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to initialize onboarding'
    });
  }
});

/**
 * Complete onboarding step
 * POST /api/onboarding/step/:stepName/complete
 */
router.post('/step/:stepName/complete', async (req, res) => {
  try {
    const userId = req.user._id;
    const { stepName } = req.params;
    const stepData = req.body;

    const result = await onboardingService.completeOnboardingStep(userId, stepName, stepData);

    res.status(200).json({
      success: true,
      message: `Step ${stepName} completed successfully`,
      data: result
    });

  } catch (error) {
    console.error('Complete onboarding step error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to complete onboarding step'
    });
  }
});

/**
 * Get onboarding status
 * GET /api/onboarding/status
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user._id;

    const status = await onboardingService.getOnboardingStatus(userId);

    res.status(200).json({
      success: true,
      message: 'Onboarding status retrieved',
      data: status
    });

  } catch (error) {
    console.error('Get onboarding status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get onboarding status'
    });
  }
});

/**
 * Get step preview
 * GET /api/onboarding/step/:stepName/preview
 */
router.get('/step/:stepName/preview', async (req, res) => {
  try {
    const { stepName } = req.params;

    const preview = await onboardingService.getStepPreview(stepName);

    if (!preview) {
      return res.status(404).json({
        success: false,
        error: 'Step not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Step preview retrieved',
      data: preview
    });

  } catch (error) {
    console.error('Get step preview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get step preview'
    });
  }
});

/**
 * Skip onboarding step (if allowed)
 * POST /api/onboarding/step/:stepName/skip
 */
router.post('/step/:stepName/skip', async (req, res) => {
  try {
    const userId = req.user._id;
    const { stepName } = req.params;
    const { reason = 'user_choice' } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.onboarding) {
      return res.status(404).json({
        success: false,
        error: 'Onboarding not found'
      });
    }

    // Check if step can be skipped
    const stepWeights = onboardingService.stepWeights;
    if (stepWeights[stepName]?.required) {
      return res.status(400).json({
        success: false,
        error: 'This step cannot be skipped'
      });
    }

    // Mark step as completed with skip flag
    if (!user.onboarding.completedSteps.includes(stepName)) {
      user.onboarding.completedSteps.push(stepName);
    }

    // Update progress
    user.onboarding.progress = onboardingService.calculateProgress(user.onboarding.completedSteps);
    
    // Record skip reason
    if (!user.onboarding.analyticsData.skippedSteps) {
      user.onboarding.analyticsData.skippedSteps = [];
    }
    user.onboarding.analyticsData.skippedSteps.push({
      stepName,
      reason,
      skippedAt: new Date()
    });

    // Get next step
    const nextStep = onboardingService.getNextStep(user.onboarding.completedSteps);
    user.onboarding.currentStep = nextStep;

    await user.save();

    res.status(200).json({
      success: true,
      message: `Step ${stepName} skipped`,
      data: {
        skippedStep: stepName,
        currentStep: nextStep,
        progress: user.onboarding.progress,
        isComplete: nextStep === 'completion'
      }
    });

  } catch (error) {
    console.error('Skip onboarding step error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to skip onboarding step'
    });
  }
});

/**
 * Restart onboarding
 * POST /api/onboarding/restart
 */
router.post('/restart', async (req, res) => {
  try {
    const userId = req.user._id;
    const { keepProgress = false } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (keepProgress && user.onboarding) {
      // Keep existing progress but allow re-doing steps
      user.onboarding.currentStep = 'welcome';
      user.onboarding.analyticsData.restartedAt = new Date();
      user.onboarding.analyticsData.restartCount = (user.onboarding.analyticsData.restartCount || 0) + 1;
    } else {
      // Reset all onboarding progress
      user.onboarding = {
        startedAt: new Date(),
        currentStep: 'welcome',
        completedSteps: [],
        progress: 0,
        isComplete: false,
        analyticsData: {
          registrationSource: user.onboarding?.analyticsData?.registrationSource || 'restart',
          deviceType: user.onboarding?.analyticsData?.deviceType || 'unknown',
          startTime: new Date(),
          restartedAt: new Date(),
          restartCount: (user.onboarding?.analyticsData?.restartCount || 0) + 1
        }
      };
    }

    await user.save();

    // Generate welcome experience for restart
    const welcomeData = await onboardingService.generateWelcomeExperience(user, {
      source: 'restart'
    });

    res.status(200).json({
      success: true,
      message: 'Onboarding restarted successfully',
      data: {
        currentStep: 'welcome',
        progress: user.onboarding.progress,
        welcomeData,
        keptProgress: keepProgress
      }
    });

  } catch (error) {
    console.error('Restart onboarding error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to restart onboarding'
    });
  }
});

/**
 * Get onboarding analytics
 * GET /api/onboarding/analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('onboarding profile');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const analytics = {
      onboardingStatus: {
        isComplete: user.onboarding?.isComplete || false,
        progress: user.onboarding?.progress || 0,
        currentStep: user.onboarding?.currentStep || 'not_started',
        completedSteps: user.onboarding?.completedSteps || [],
        totalSteps: onboardingService.onboardingSteps.length
      },
      timeMetrics: {
        startedAt: user.onboarding?.startedAt,
        completedAt: user.onboarding?.completedAt,
        timeToComplete: user.onboarding?.completedAt && user.onboarding?.startedAt
          ? Math.floor((user.onboarding.completedAt - user.onboarding.startedAt) / (1000 * 60)) // minutes
          : null,
        lastActivity: user.onboarding?.analyticsData?.lastStepCompletedAt
      },
      profileCompleteness: onboardingService.calculateProfileCompleteness(user),
      achievements: onboardingService.checkAchievements(user),
      recommendations: await onboardingService.generatePersonalizedTips(user),
      stepBreakdown: onboardingService.onboardingSteps.map(step => ({
        step,
        completed: user.onboarding?.completedSteps?.includes(step) || false,
        weight: onboardingService.stepWeights[step]?.weight || 0,
        required: onboardingService.stepWeights[step]?.required || false
      }))
    };

    res.status(200).json({
      success: true,
      message: 'Onboarding analytics retrieved',
      data: analytics
    });

  } catch (error) {
    console.error('Get onboarding analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get onboarding analytics'
    });
  }
});

/**
 * Update onboarding preferences
 * PUT /api/onboarding/preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const userId = req.user._id;
    const { preferences } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.onboarding) {
      return res.status(400).json({
        success: false,
        error: 'Onboarding not initialized'
      });
    }

    // Update preferences
    user.onboarding.preferences = {
      ...user.onboarding.preferences,
      ...preferences
    };

    user.onboarding.analyticsData.preferencesUpdatedAt = new Date();

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Onboarding preferences updated',
      data: {
        preferences: user.onboarding.preferences
      }
    });

  } catch (error) {
    console.error('Update onboarding preferences error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update onboarding preferences'
    });
  }
});

module.exports = router;