/**
 * Analytics and Business Intelligence Routes
 * Provides comprehensive analytics and reporting endpoints
 */

const express = require('express');
const router = express.Router();
const RevenueAnalyticsService = require('../services/RevenueAnalyticsService');
const User = require('../models/User');

// Initialize analytics service
const analyticsService = new RevenueAnalyticsService();

/**
 * Get revenue dashboard
 * GET /api/analytics/revenue/dashboard
 */
router.get('/revenue/dashboard', async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;

    const dashboard = await analyticsService.getRevenueDashboard(period, startDate, endDate);

    res.status(200).json({
      success: true,
      message: 'Revenue dashboard retrieved',
      data: dashboard
    });

  } catch (error) {
    console.error('Revenue dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get revenue dashboard'
    });
  }
});

/**
 * Get subscription analytics
 * GET /api/analytics/subscriptions
 */
router.get('/subscriptions', async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;
    const dateRange = calculateDateRange(period, startDate, endDate);

    const subscriptionMetrics = await analyticsService.calculateSubscriptionMetrics(dateRange);

    res.status(200).json({
      success: true,
      message: 'Subscription analytics retrieved',
      data: {
        period,
        dateRange,
        metrics: subscriptionMetrics
      }
    });

  } catch (error) {
    console.error('Subscription analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription analytics'
    });
  }
});

/**
 * Get user analytics
 * GET /api/analytics/users
 */
router.get('/users', async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;
    const dateRange = calculateDateRange(period, startDate, endDate);

    const userMetrics = await analyticsService.calculateUserMetrics(dateRange);

    res.status(200).json({
      success: true,
      message: 'User analytics retrieved',
      data: {
        period,
        dateRange,
        metrics: userMetrics
      }
    });

  } catch (error) {
    console.error('User analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user analytics'
    });
  }
});

/**
 * Get churn analysis
 * GET /api/analytics/churn
 */
router.get('/churn', async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;
    const dateRange = calculateDateRange(period, startDate, endDate);

    const churnAnalysis = await analyticsService.calculateChurnAnalysis(dateRange);

    res.status(200).json({
      success: true,
      message: 'Churn analysis retrieved',
      data: {
        period,
        dateRange,
        analysis: churnAnalysis
      }
    });

  } catch (error) {
    console.error('Churn analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get churn analysis'
    });
  }
});

/**
 * Get conversion metrics
 * GET /api/analytics/conversions
 */
router.get('/conversions', async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;
    const dateRange = calculateDateRange(period, startDate, endDate);

    const conversionMetrics = await analyticsService.calculateConversionMetrics(dateRange);

    res.status(200).json({
      success: true,
      message: 'Conversion metrics retrieved',
      data: {
        period,
        dateRange,
        metrics: conversionMetrics
      }
    });

  } catch (error) {
    console.error('Conversion metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversion metrics'
    });
  }
});

/**
 * Get cohort analysis
 * GET /api/analytics/cohorts
 */
router.get('/cohorts', async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;
    const dateRange = calculateDateRange(period, startDate, endDate);

    const cohortAnalysis = await analyticsService.calculateCohortAnalysis(dateRange);

    res.status(200).json({
      success: true,
      message: 'Cohort analysis retrieved',
      data: {
        period,
        dateRange,
        cohorts: cohortAnalysis
      }
    });

  } catch (error) {
    console.error('Cohort analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cohort analysis'
    });
  }
});

/**
 * Get revenue forecast
 * GET /api/analytics/forecast
 */
router.get('/forecast', async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;
    const dateRange = calculateDateRange(period, startDate, endDate);

    const forecast = await analyticsService.generateRevenueForecast(dateRange);

    res.status(200).json({
      success: true,
      message: 'Revenue forecast retrieved',
      data: {
        period,
        dateRange,
        forecast
      }
    });

  } catch (error) {
    console.error('Revenue forecast error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get revenue forecast'
    });
  }
});

/**
 * Get real-time analytics
 * GET /api/analytics/realtime
 */
router.get('/realtime', async (req, res) => {
  try {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

    const [
      activeUsers,
      newSignups,
      newSubscriptions,
      revenue24h,
      currentOnlineUsers
    ] = await Promise.all([
      User.countDocuments({
        lastActiveAt: { $gte: last24Hours }
      }),
      User.countDocuments({
        createdAt: { $gte: last24Hours }
      }),
      User.countDocuments({
        'subscription.startDate': { $gte: last24Hours },
        'subscription.tier': { $in: ['premium', 'vip'] }
      }),
      calculateRevenue24h(),
      User.countDocuments({
        lastActiveAt: { $gte: lastHour }
      })
    ]);

    const realtimeMetrics = {
      timestamp: now,
      activeUsers24h: activeUsers,
      newSignups24h: newSignups,
      newSubscriptions24h: newSubscriptions,
      revenue24h: revenue24h,
      currentOnlineUsers: currentOnlineUsers,
      conversionRate24h: newSignups > 0 ? Math.round((newSubscriptions / newSignups) * 100) : 0,
      trends: {
        usersOnline: await getUserTrend('online', 'hour'),
        signups: await getUserTrend('signups', 'hour'),
        revenue: await getRevenueTrend('hour')
      }
    };

    res.status(200).json({
      success: true,
      message: 'Real-time analytics retrieved',
      data: realtimeMetrics
    });

  } catch (error) {
    console.error('Real-time analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get real-time analytics'
    });
  }
});

/**
 * Get user engagement analytics
 * GET /api/analytics/engagement
 */
router.get('/engagement', async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const dateRange = calculateDateRange(period);

    const engagementMetrics = {
      period,
      dateRange,
      metrics: {
        averageSessionDuration: await calculateAverageSessionDuration(dateRange),
        dailyActiveUsers: await calculateDAU(dateRange),
        weeklyActiveUsers: await calculateWAU(dateRange),
        monthlyActiveUsers: await calculateMAU(dateRange),
        retentionRates: {
          day1: await calculateRetention(1),
          day7: await calculateRetention(7),
          day30: await calculateRetention(30)
        },
        featureUsage: await calculateFeatureUsage(dateRange),
        userJourney: await analyzeUserJourney(dateRange)
      }
    };

    res.status(200).json({
      success: true,
      message: 'Engagement analytics retrieved',
      data: engagementMetrics
    });

  } catch (error) {
    console.error('Engagement analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get engagement analytics'
    });
  }
});

/**
 * Export analytics data
 * GET /api/analytics/export
 */
router.get('/export', async (req, res) => {
  try {
    const { type = 'revenue', period = 'monthly', format = 'json' } = req.query;
    const dateRange = calculateDateRange(period);

    let data;
    switch (type) {
      case 'revenue':
        data = await analyticsService.calculateRevenueMetrics(dateRange);
        break;
      case 'users':
        data = await analyticsService.calculateUserMetrics(dateRange);
        break;
      case 'subscriptions':
        data = await analyticsService.calculateSubscriptionMetrics(dateRange);
        break;
      case 'cohorts':
        data = await analyticsService.calculateCohortAnalysis(dateRange);
        break;
      default:
        data = await analyticsService.getRevenueDashboard(period);
    }

    const exportData = {
      type,
      period,
      dateRange,
      generatedAt: new Date(),
      data
    };

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_analytics_${period}.csv"`);
      res.send(convertToCSV(exportData));
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_analytics_${period}.json"`);
      res.json(exportData);
    }

  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export analytics data'
    });
  }
});

/**
 * Get custom analytics query
 * POST /api/analytics/query
 */
router.post('/query', async (req, res) => {
  try {
    const { 
      metrics = [], 
      filters = {}, 
      groupBy = null, 
      period = 'monthly',
      startDate,
      endDate 
    } = req.body;

    const dateRange = calculateDateRange(period, startDate, endDate);
    
    // Build aggregation pipeline based on query
    const pipeline = buildAnalyticsPipeline(metrics, filters, groupBy, dateRange);
    
    const results = await User.aggregate(pipeline);

    res.status(200).json({
      success: true,
      message: 'Custom analytics query executed',
      data: {
        query: { metrics, filters, groupBy, period, dateRange },
        results
      }
    });

  } catch (error) {
    console.error('Custom analytics query error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to execute custom analytics query'
    });
  }
});

// Helper functions
function calculateDateRange(period, startDate = null, endDate = null) {
  const now = new Date();
  
  if (startDate && endDate) {
    return { start: new Date(startDate), end: new Date(endDate) };
  }

  switch (period) {
    case 'daily':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        end: now
      };
    case 'weekly':
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      return { start: weekStart, end: now };
    case 'monthly':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now
      };
    case 'yearly':
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: now
      };
    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now
      };
  }
}

async function calculateRevenue24h() {
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const users = await User.find({
    'billing.purchaseHistory.purchasedAt': { $gte: last24Hours }
  }).select('billing');

  let total = 0;
  users.forEach(user => {
    if (user.billing?.purchaseHistory) {
      user.billing.purchaseHistory.forEach(purchase => {
        if (new Date(purchase.purchasedAt) >= last24Hours) {
          total += purchase.amount;
        }
      });
    }
  });

  return total / 100; // Convert from cents
}

async function getUserTrend(type, period) {
  // Simplified trend calculation
  const intervals = period === 'hour' ? 24 : 30;
  const intervalMs = period === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  
  const trends = [];
  for (let i = intervals; i >= 0; i--) {
    const endTime = new Date(Date.now() - i * intervalMs);
    const startTime = new Date(endTime.getTime() - intervalMs);
    
    let value = 0;
    if (type === 'online') {
      value = await User.countDocuments({
        lastActiveAt: { $gte: startTime, $lte: endTime }
      });
    } else if (type === 'signups') {
      value = await User.countDocuments({
        createdAt: { $gte: startTime, $lte: endTime }
      });
    }
    
    trends.push({ timestamp: endTime, value });
  }
  
  return trends;
}

async function getRevenueTrend(period) {
  // Simplified revenue trend calculation
  return Array.from({ length: 24 }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 60 * 60 * 1000),
    value: Math.random() * 1000 // Placeholder
  })).reverse();
}

// Placeholder functions for complex calculations
async function calculateAverageSessionDuration(dateRange) { return 8.5; }
async function calculateDAU(dateRange) { return 1250; }
async function calculateWAU(dateRange) { return 5600; }
async function calculateMAU(dateRange) { return 15000; }
async function calculateRetention(days) { return Math.random() * 50 + 50; }
async function calculateFeatureUsage(dateRange) { 
  return {
    messaging: 85,
    matching: 92,
    activities: 67,
    photos: 78
  }; 
}
async function analyzeUserJourney(dateRange) { 
  return {
    signupToProfile: 2.5,
    profileToFirstMatch: 1.2,
    matchToMessage: 0.8
  }; 
}

function convertToCSV(data) {
  // Simple CSV conversion for basic data
  const headers = Object.keys(data.data);
  const rows = [headers.join(',')];
  
  if (Array.isArray(data.data)) {
    data.data.forEach(item => {
      const values = headers.map(header => item[header] || '');
      rows.push(values.join(','));
    });
  }
  
  return rows.join('\n');
}

function buildAnalyticsPipeline(metrics, filters, groupBy, dateRange) {
  const pipeline = [];
  
  // Add match stage for date range
  pipeline.push({
    $match: {
      createdAt: { $gte: dateRange.start, $lte: dateRange.end },
      ...filters
    }
  });
  
  // Add grouping stage
  if (groupBy) {
    const groupStage = { $group: { _id: `$${groupBy}` } };
    
    metrics.forEach(metric => {
      switch (metric) {
        case 'count':
          groupStage.$group.count = { $sum: 1 };
          break;
        case 'revenue':
          groupStage.$group.totalRevenue = { $sum: '$billing.totalSpent' };
          break;
        default:
          groupStage.$group[metric] = { $avg: `$${metric}` };
      }
    });
    
    pipeline.push(groupStage);
  }
  
  return pipeline;
}

module.exports = router;