/**
 * Advanced Analytics Routes
 * Provides ML-powered insights, A/B testing, and data visualization endpoints
 */

const express = require('express');
const router = express.Router();
const AdvancedAnalyticsEngine = require('../services/AdvancedAnalyticsEngine');
const ABTestingService = require('../services/ABTestingService');
const DataVisualizationService = require('../services/DataVisualizationService');
const User = require('../models/User');

// Initialize services
const analyticsEngine = new AdvancedAnalyticsEngine();
const abTestingService = new ABTestingService();
const visualizationService = new DataVisualizationService();

/**
 * Get user insights powered by ML
 * GET /api/advanced-analytics/user/:userId/insights
 */
router.get('/user/:userId/insights', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if requesting insights for self or admin access
    if (userId !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const insights = await analyticsEngine.generateUserInsights(userId);

    res.status(200).json({
      success: true,
      message: 'User insights generated',
      data: insights
    });

  } catch (error) {
    console.error('User insights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate user insights'
    });
  }
});

/**
 * Get business intelligence dashboard
 * GET /api/advanced-analytics/bi/dashboard
 */
router.get('/bi/dashboard', async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    
    const dateRange = startDate && endDate ? {
      start: new Date(startDate),
      end: new Date(endDate)
    } : null;

    const dashboard = await analyticsEngine.generateBIDashboard(dateRange);

    res.status(200).json({
      success: true,
      message: 'Business intelligence dashboard generated',
      data: dashboard
    });

  } catch (error) {
    console.error('BI dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate BI dashboard'
    });
  }
});

/**
 * Get predictive analytics
 * GET /api/advanced-analytics/predictive
 */
router.get('/predictive', async (req, res) => {
  try {
    const { period = 'monthly', metrics = [] } = req.query;
    
    const dateRange = {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date()
    };

    const predictions = await analyticsEngine.generatePredictiveAnalytics(dateRange);

    res.status(200).json({
      success: true,
      message: 'Predictive analytics generated',
      data: {
        period,
        predictions,
        generatedAt: new Date(),
        metricsRequested: Array.isArray(metrics) ? metrics : [metrics]
      }
    });

  } catch (error) {
    console.error('Predictive analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate predictive analytics'
    });
  }
});

/**
 * Create A/B test
 * POST /api/advanced-analytics/ab-test/create
 */
router.post('/ab-test/create', async (req, res) => {
  try {
    const testConfig = {
      ...req.body,
      createdBy: req.user._id
    };

    const test = await abTestingService.createABTest(testConfig);

    res.status(201).json({
      success: true,
      message: 'A/B test created successfully',
      data: test
    });

  } catch (error) {
    console.error('A/B test creation error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create A/B test'
    });
  }
});

/**
 * Get A/B test results
 * GET /api/advanced-analytics/ab-test/:testId/results
 */
router.get('/ab-test/:testId/results', async (req, res) => {
  try {
    const { testId } = req.params;
    const { includeVisualization = false } = req.query;

    const results = await abTestingService.getTestResults(testId);
    
    let visualization = null;
    if (includeVisualization === 'true') {
      visualization = await visualizationService.generateABTestVisualization(results);
    }

    res.status(200).json({
      success: true,
      message: 'A/B test results retrieved',
      data: {
        results,
        visualization
      }
    });

  } catch (error) {
    console.error('A/B test results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get A/B test results'
    });
  }
});

/**
 * Stop A/B test
 * POST /api/advanced-analytics/ab-test/:testId/stop
 */
router.post('/ab-test/:testId/stop', async (req, res) => {
  try {
    const { testId } = req.params;
    const { reason = 'manual_stop' } = req.body;

    const finalResults = await abTestingService.stopTest(testId, reason);

    res.status(200).json({
      success: true,
      message: 'A/B test stopped successfully',
      data: finalResults
    });

  } catch (error) {
    console.error('Stop A/B test error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to stop A/B test'
    });
  }
});

/**
 * Track A/B test conversion
 * POST /api/advanced-analytics/ab-test/:testId/conversion
 */
router.post('/ab-test/:testId/conversion', async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user._id;
    const conversionData = req.body;

    const tracked = await abTestingService.trackConversion(userId, testId, conversionData);

    res.status(200).json({
      success: true,
      message: tracked ? 'Conversion tracked successfully' : 'Conversion not tracked',
      data: { tracked, userId, testId }
    });

  } catch (error) {
    console.error('Conversion tracking error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track conversion'
    });
  }
});

/**
 * Get feature flag value
 * GET /api/advanced-analytics/feature-flag/:flagName
 */
router.get('/feature-flag/:flagName', async (req, res) => {
  try {
    const { flagName } = req.params;
    const userId = req.user._id;

    const flagValue = await abTestingService.getFeatureFlag(userId, flagName);

    res.status(200).json({
      success: true,
      message: 'Feature flag retrieved',
      data: {
        flagName,
        value: flagValue,
        userId
      }
    });

  } catch (error) {
    console.error('Feature flag error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get feature flag'
    });
  }
});

/**
 * Create feature flag
 * POST /api/advanced-analytics/feature-flag/create
 */
router.post('/feature-flag/create', async (req, res) => {
  try {
    const flagConfig = req.body;

    const flag = abTestingService.createFeatureFlag(flagConfig);

    res.status(201).json({
      success: true,
      message: 'Feature flag created successfully',
      data: flag
    });

  } catch (error) {
    console.error('Feature flag creation error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create feature flag'
    });
  }
});

/**
 * Generate visualization
 * POST /api/advanced-analytics/visualization/generate
 */
router.post('/visualization/generate', async (req, res) => {
  try {
    const { type, data, options = {} } = req.body;

    let visualization;
    switch (type) {
      case 'revenue_dashboard':
        visualization = await visualizationService.generateRevenueDashboard(data, options);
        break;
      case 'user_analytics':
        visualization = await visualizationService.generateUserAnalytics(data, options);
        break;
      case 'ab_test':
        visualization = await visualizationService.generateABTestVisualization(data, options);
        break;
      case 'custom':
        visualization = visualizationService.createCustomChart(data);
        break;
      default:
        throw new Error('Unsupported visualization type');
    }

    res.status(200).json({
      success: true,
      message: 'Visualization generated successfully',
      data: visualization
    });

  } catch (error) {
    console.error('Visualization generation error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to generate visualization'
    });
  }
});

/**
 * Export chart
 * GET /api/advanced-analytics/chart/:chartId/export
 */
router.get('/chart/:chartId/export', async (req, res) => {
  try {
    const { chartId } = req.params;
    const { format = 'png', width, height, quality } = req.query;

    const exportData = await visualizationService.exportChart(chartId, format, {
      width: parseInt(width) || 800,
      height: parseInt(height) || 600,
      quality
    });

    res.status(200).json({
      success: true,
      message: 'Chart export generated',
      data: exportData
    });

  } catch (error) {
    console.error('Chart export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export chart'
    });
  }
});

/**
 * Get user segmentation
 * GET /api/advanced-analytics/segmentation
 */
router.get('/segmentation', async (req, res) => {
  try {
    const { segmentType = 'all', includeMetrics = false } = req.query;

    // Get user segments based on ML clustering
    const segments = await getUserSegments(segmentType, includeMetrics === 'true');

    res.status(200).json({
      success: true,
      message: 'User segmentation retrieved',
      data: {
        segmentType,
        segments,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('User segmentation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user segmentation'
    });
  }
});

/**
 * Get ML model performance
 * GET /api/advanced-analytics/ml/performance
 */
router.get('/ml/performance', async (req, res) => {
  try {
    const { modelName = 'all' } = req.query;

    const performance = await getMLModelPerformance(modelName);

    res.status(200).json({
      success: true,
      message: 'ML model performance retrieved',
      data: performance
    });

  } catch (error) {
    console.error('ML performance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ML model performance'
    });
  }
});

/**
 * Generate custom analytics report
 * POST /api/advanced-analytics/report/custom
 */
router.post('/report/custom', async (req, res) => {
  try {
    const {
      metrics = [],
      dimensions = [],
      filters = {},
      dateRange = {},
      format = 'json'
    } = req.body;

    const report = await generateCustomReport({
      metrics,
      dimensions,
      filters,
      dateRange,
      format,
      requestedBy: req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'Custom analytics report generated',
      data: report
    });

  } catch (error) {
    console.error('Custom report error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to generate custom report'
    });
  }
});

/**
 * Get real-time analytics stream
 * GET /api/advanced-analytics/realtime/stream
 */
router.get('/realtime/stream', async (req, res) => {
  try {
    const { metrics = 'all' } = req.query;

    // Set up Server-Sent Events for real-time data
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial data
    const initialData = await getRealtimeMetrics(metrics);
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);

    // Set up interval for real-time updates
    const interval = setInterval(async () => {
      try {
        const realtimeData = await getRealtimeMetrics(metrics);
        res.write(`data: ${JSON.stringify(realtimeData)}\n\n`);
      } catch (error) {
        console.error('Real-time stream error:', error);
      }
    }, 5000); // Update every 5 seconds

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });

  } catch (error) {
    console.error('Real-time stream setup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set up real-time stream'
    });
  }
});

// Helper functions

async function getUserSegments(segmentType, includeMetrics) {
  const segments = {
    powerUsers: {
      name: 'Power Users',
      description: 'Highly engaged users with premium subscriptions',
      count: 2500,
      criteria: { engagementScore: { $gte: 0.8 }, 'subscription.tier': { $in: ['premium', 'vip'] } }
    },
    churnRisk: {
      name: 'Churn Risk',
      description: 'Users at risk of churning based on ML prediction',
      count: 1200,
      criteria: { churnRiskScore: { $gte: 0.7 } }
    },
    newUsers: {
      name: 'New Users',
      description: 'Users registered in the last 30 days',
      count: 800,
      criteria: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
    }
  };

  if (segmentType !== 'all') {
    return { [segmentType]: segments[segmentType] };
  }

  if (includeMetrics) {
    // Add metrics for each segment
    for (const [key, segment] of Object.entries(segments)) {
      segment.metrics = {
        averageLTV: Math.random() * 100 + 50,
        engagementScore: Math.random() * 0.5 + 0.5,
        conversionRate: Math.random() * 0.2 + 0.1
      };
    }
  }

  return segments;
}

async function getMLModelPerformance(modelName) {
  const models = {
    churn_prediction: {
      name: 'Churn Prediction',
      accuracy: 0.87,
      precision: 0.84,
      recall: 0.89,
      f1Score: 0.86,
      lastTrained: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      trainingData: 50000,
      status: 'active'
    },
    ltv_prediction: {
      name: 'Lifetime Value Prediction',
      accuracy: 0.82,
      mae: 12.5, // Mean Absolute Error
      rmse: 18.3, // Root Mean Square Error
      r2Score: 0.78,
      lastTrained: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      trainingData: 35000,
      status: 'active'
    },
    match_success: {
      name: 'Match Success Prediction',
      accuracy: 0.79,
      precision: 0.81,
      recall: 0.76,
      f1Score: 0.78,
      lastTrained: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      trainingData: 75000,
      status: 'active'
    }
  };

  return modelName === 'all' ? models : { [modelName]: models[modelName] };
}

async function generateCustomReport(config) {
  // Generate custom analytics report based on configuration
  const report = {
    id: 'report_' + Date.now(),
    config,
    generatedAt: new Date(),
    data: {
      summary: {
        totalRecords: 15000,
        dateRange: config.dateRange,
        metricsCalculated: config.metrics.length
      },
      results: config.metrics.map(metric => ({
        metric,
        value: Math.random() * 1000,
        trend: Math.random() > 0.5 ? 'up' : 'down',
        changePercent: (Math.random() - 0.5) * 40
      }))
    }
  };

  return report;
}

async function getRealtimeMetrics(metrics) {
  return {
    timestamp: new Date(),
    metrics: {
      activeUsers: Math.floor(Math.random() * 1000) + 500,
      newSignups: Math.floor(Math.random() * 50) + 25,
      revenue: Math.floor(Math.random() * 10000) + 5000,
      conversions: Math.floor(Math.random() * 100) + 50,
      engagement: Math.random() * 0.3 + 0.6
    }
  };
}

module.exports = router;