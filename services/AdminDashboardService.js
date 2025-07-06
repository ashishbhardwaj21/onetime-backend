/**
 * Admin Dashboard Service
 * Provides comprehensive dashboard data and analytics for administrators
 */

const moment = require('moment');
const logger = require('../utils/logger');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Subscription = require('../models/Subscription');
const Interaction = require('../models/Interaction');
const Match = require('../models/Match');
const AdminUser = require('../models/AdminUser');
const redisClient = require('../config/redis');

class AdminDashboardService {
  constructor() {
    this.cacheTimeout = 300; // 5 minutes
  }

  async getOverviewStats(timeframe = '7d') {
    const cacheKey = `admin:overview:${timeframe}`;
    
    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const { startDate, endDate } = this.getDateRange(timeframe);
      
      // Get current period stats
      const [
        userStats,
        activityStats,
        subscriptionStats,
        engagementStats,
        revenueStats,
        moderationStats
      ] = await Promise.all([
        this.getUserStats(startDate, endDate),
        this.getActivityStats(startDate, endDate),
        this.getSubscriptionStats(startDate, endDate),
        this.getEngagementStats(startDate, endDate),
        this.getRevenueStats(startDate, endDate),
        this.getModerationStats(startDate, endDate)
      ]);

      // Get previous period for comparison
      const prevPeriod = this.getPreviousPeriod(startDate, endDate);
      const [
        prevUserStats,
        prevActivityStats,
        prevSubscriptionStats,
        prevRevenueStats
      ] = await Promise.all([
        this.getUserStats(prevPeriod.startDate, prevPeriod.endDate),
        this.getActivityStats(prevPeriod.startDate, prevPeriod.endDate),
        this.getSubscriptionStats(prevPeriod.startDate, prevPeriod.endDate),
        this.getRevenueStats(prevPeriod.startDate, prevPeriod.endDate)
      ]);

      const overview = {
        timeframe,
        period: {
          start: startDate,
          end: endDate
        },
        users: {
          ...userStats,
          growth: this.calculateGrowth(userStats.total, prevUserStats.total),
          newUsersGrowth: this.calculateGrowth(userStats.new, prevUserStats.new),
          activeUsersGrowth: this.calculateGrowth(userStats.active, prevUserStats.active)
        },
        activities: {
          ...activityStats,
          growth: this.calculateGrowth(activityStats.total, prevActivityStats.total),
          participationGrowth: this.calculateGrowth(activityStats.totalParticipants, prevActivityStats.totalParticipants)
        },
        subscriptions: {
          ...subscriptionStats,
          growth: this.calculateGrowth(subscriptionStats.total, prevSubscriptionStats.total),
          conversionGrowth: this.calculateGrowth(subscriptionStats.conversionRate, prevSubscriptionStats.conversionRate)
        },
        engagement: engagementStats,
        revenue: {
          ...revenueStats,
          growth: this.calculateGrowth(revenueStats.total, prevRevenueStats.total),
          mrrGrowth: this.calculateGrowth(revenueStats.mrr, prevRevenueStats.mrr)
        },
        moderation: moderationStats,
        alerts: await this.getSystemAlerts(),
        lastUpdated: new Date()
      };

      // Cache the results
      await redisClient.setex(cacheKey, this.cacheTimeout, JSON.stringify(overview));
      
      return overview;
    } catch (error) {
      logger.error('Error getting overview stats:', error);
      throw error;
    }
  }

  async getUserStats(startDate, endDate) {
    const [
      totalUsers,
      newUsers,
      activeUsers,
      verifiedUsers,
      topLocations,
      ageDistribution,
      genderDistribution
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      User.countDocuments({ 
        lastActive: { $gte: moment().subtract(7, 'days').toDate() }
      }),
      User.countDocuments({ 'verification.isVerified': true }),
      this.getTopUserLocations(startDate, endDate),
      this.getUserAgeDistribution(),
      this.getUserGenderDistribution()
    ]);

    const dailySignups = await this.getDailyUserSignups(startDate, endDate);
    const retentionStats = await this.getUserRetentionStats();

    return {
      total: totalUsers,
      new: newUsers,
      active: activeUsers,
      verified: verifiedUsers,
      verificationRate: totalUsers > 0 ? (verifiedUsers / totalUsers) * 100 : 0,
      dailySignups,
      topLocations,
      demographics: {
        age: ageDistribution,
        gender: genderDistribution
      },
      retention: retentionStats
    };
  }

  async getActivityStats(startDate, endDate) {
    const [
      totalActivities,
      newActivities,
      upcomingActivities,
      completedActivities,
      totalParticipants,
      averageParticipants,
      categoryDistribution,
      locationDistribution
    ] = await Promise.all([
      Activity.countDocuments(),
      Activity.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      Activity.countDocuments({ 
        dateTime: { $gte: new Date() },
        status: 'active'
      }),
      Activity.countDocuments({ 
        dateTime: { $lt: new Date() },
        status: 'completed'
      }),
      this.getTotalActivityParticipants(startDate, endDate),
      this.getAverageActivityParticipants(),
      this.getActivityCategoryDistribution(startDate, endDate),
      this.getActivityLocationDistribution(startDate, endDate)
    ]);

    const dailyActivities = await this.getDailyActivityCreation(startDate, endDate);
    const popularActivities = await this.getPopularActivities(startDate, endDate);

    return {
      total: totalActivities,
      new: newActivities,
      upcoming: upcomingActivities,
      completed: completedActivities,
      totalParticipants,
      averageParticipants,
      dailyActivities,
      categoryDistribution,
      locationDistribution,
      popular: popularActivities
    };
  }

  async getSubscriptionStats(startDate, endDate) {
    const [
      totalSubscriptions,
      newSubscriptions,
      activeSubscriptions,
      canceledSubscriptions,
      churnRate,
      conversionRate,
      tierDistribution
    ] = await Promise.all([
      Subscription.countDocuments(),
      Subscription.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      Subscription.countDocuments({ status: 'active' }),
      Subscription.countDocuments({ 
        canceledAt: { $gte: startDate, $lte: endDate }
      }),
      this.getChurnRate(startDate, endDate),
      this.getConversionRate(startDate, endDate),
      this.getSubscriptionTierDistribution()
    ]);

    const dailySubscriptions = await this.getDailySubscriptions(startDate, endDate);
    const lifetimeValue = await this.getCustomerLifetimeValue();

    return {
      total: totalSubscriptions,
      new: newSubscriptions,
      active: activeSubscriptions,
      canceled: canceledSubscriptions,
      churnRate,
      conversionRate,
      dailySubscriptions,
      tierDistribution,
      customerLifetimeValue: lifetimeValue
    };
  }

  async getEngagementStats(startDate, endDate) {
    const [
      totalInteractions,
      dailyActiveUsers,
      averageSessionDuration,
      messagesSent,
      matchesCreated,
      profileViews,
      featureUsage
    ] = await Promise.all([
      Interaction.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      this.getDailyActiveUsers(startDate, endDate),
      this.getAverageSessionDuration(startDate, endDate),
      Interaction.countDocuments({ 
        type: 'message_sent',
        createdAt: { $gte: startDate, $lte: endDate }
      }),
      Match.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      Interaction.countDocuments({ 
        type: 'view_profile',
        createdAt: { $gte: startDate, $lte: endDate }
      }),
      this.getFeatureUsageStats(startDate, endDate)
    ]);

    const engagementTrends = await this.getEngagementTrends(startDate, endDate);
    const userEngagementDistribution = await this.getUserEngagementDistribution();

    return {
      totalInteractions,
      dailyActiveUsers,
      averageSessionDuration,
      messagesSent,
      matchesCreated,
      profileViews,
      featureUsage,
      trends: engagementTrends,
      userDistribution: userEngagementDistribution
    };
  }

  async getRevenueStats(startDate, endDate) {
    const revenueData = await Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $in: ['active', 'canceled'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.amount' },
          subscriptionCount: { $sum: 1 },
          averageRevenue: { $avg: '$pricing.amount' }
        }
      }
    ]);

    const revenue = revenueData[0] || { totalRevenue: 0, subscriptionCount: 0, averageRevenue: 0 };
    
    const [
      mrr,
      arpu,
      dailyRevenue,
      revenueByTier
    ] = await Promise.all([
      this.getMonthlyRecurringRevenue(),
      this.getAverageRevenuePerUser(),
      this.getDailyRevenue(startDate, endDate),
      this.getRevenueByTier(startDate, endDate)
    ]);

    return {
      total: revenue.totalRevenue,
      count: revenue.subscriptionCount,
      average: revenue.averageRevenue,
      mrr,
      arpu,
      daily: dailyRevenue,
      byTier: revenueByTier
    };
  }

  async getModerationStats(startDate, endDate) {
    const [
      totalReports,
      pendingReports,
      resolvedReports,
      bannedUsers,
      flaggedContent,
      moderationActions
    ] = await Promise.all([
      this.getTotalReports(startDate, endDate),
      this.getPendingReports(),
      this.getResolvedReports(startDate, endDate),
      User.countDocuments({ status: 'banned' }),
      this.getFlaggedContent(),
      this.getModerationActions(startDate, endDate)
    ]);

    const averageResponseTime = await this.getAverageModerationResponseTime();
    const reportCategories = await this.getReportCategories(startDate, endDate);

    return {
      totalReports,
      pendingReports,
      resolvedReports,
      bannedUsers,
      flaggedContent,
      moderationActions,
      averageResponseTime,
      reportCategories
    };
  }

  async getUserManagement(filters = {}) {
    const {
      search,
      status,
      verificationStatus,
      subscriptionTier,
      location,
      ageMin,
      ageMax,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 50
    } = filters;

    const query = {};
    
    // Apply filters
    if (search) {
      query.$or = [
        { 'profile.name': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      query.status = status;
    }
    
    if (verificationStatus !== undefined) {
      query['verification.isVerified'] = verificationStatus;
    }
    
    if (subscriptionTier) {
      query['subscription.tier'] = subscriptionTier;
    }
    
    if (location) {
      query['profile.location.city'] = { $regex: location, $options: 'i' };
    }
    
    if (ageMin || ageMax) {
      query['profile.age'] = {};
      if (ageMin) query['profile.age'].$gte = ageMin;
      if (ageMax) query['profile.age'].$lte = ageMax;
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [users, totalCount] = await Promise.all([
      User.find(query)
        .select('email profile subscription verification status lastActive createdAt')
        .sort(sort)
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      User.countDocuments(query)
    ]);

    return {
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      }
    };
  }

  async getActivityManagement(filters = {}) {
    const {
      search,
      category,
      status,
      organizer,
      dateFrom,
      dateTo,
      location,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 50
    } = filters;

    const query = {};
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (category) {
      query.category = category;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (organizer) {
      query.organizer = organizer;
    }
    
    if (dateFrom || dateTo) {
      query.dateTime = {};
      if (dateFrom) query.dateTime.$gte = new Date(dateFrom);
      if (dateTo) query.dateTime.$lte = new Date(dateTo);
    }
    
    if (location) {
      query['location.address'] = { $regex: location, $options: 'i' };
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [activities, totalCount] = await Promise.all([
      Activity.find(query)
        .populate('organizer', 'profile.name email')
        .sort(sort)
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      Activity.countDocuments(query)
    ]);

    return {
      activities,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      }
    };
  }

  async getSystemAlerts() {
    const alerts = [];
    
    // Check for critical system issues
    const criticalUsers = await User.countDocuments({ 
      status: 'banned',
      updatedAt: { $gte: moment().subtract(24, 'hours').toDate() }
    });
    
    if (criticalUsers > 10) {
      alerts.push({
        type: 'warning',
        title: 'High Ban Rate',
        message: `${criticalUsers} users banned in the last 24 hours`,
        severity: 'high',
        timestamp: new Date()
      });
    }

    // Check for pending reports
    const pendingReports = await this.getPendingReports();
    if (pendingReports > 50) {
      alerts.push({
        type: 'info',
        title: 'Pending Reports',
        message: `${pendingReports} reports waiting for review`,
        severity: 'medium',
        timestamp: new Date()
      });
    }

    // Check server performance metrics
    const activeUsers = await User.countDocuments({
      lastActive: { $gte: moment().subtract(1, 'hour').toDate() }
    });
    
    if (activeUsers > 1000) {
      alerts.push({
        type: 'success',
        title: 'High Traffic',
        message: `${activeUsers} users active in the last hour`,
        severity: 'low',
        timestamp: new Date()
      });
    }

    return alerts;
  }

  // Helper methods
  getDateRange(timeframe) {
    const endDate = new Date();
    let startDate;

    switch (timeframe) {
      case '24h':
        startDate = moment().subtract(24, 'hours').toDate();
        break;
      case '7d':
        startDate = moment().subtract(7, 'days').toDate();
        break;
      case '30d':
        startDate = moment().subtract(30, 'days').toDate();
        break;
      case '90d':
        startDate = moment().subtract(90, 'days').toDate();
        break;
      default:
        startDate = moment().subtract(7, 'days').toDate();
    }

    return { startDate, endDate };
  }

  getPreviousPeriod(startDate, endDate) {
    const duration = endDate - startDate;
    return {
      startDate: new Date(startDate - duration),
      endDate: startDate
    };
  }

  calculateGrowth(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  // Additional helper methods for specific stats
  async getDailyUserSignups(startDate, endDate) {
    return await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
  }

  async getTopUserLocations(startDate, endDate) {
    return await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          'profile.location.city': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$profile.location.city',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);
  }

  async getUserAgeDistribution() {
    return await User.aggregate([
      {
        $match: {
          'profile.age': { $exists: true }
        }
      },
      {
        $bucket: {
          groupBy: '$profile.age',
          boundaries: [18, 25, 30, 35, 40, 45, 50, 100],
          default: 'Other',
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ]);
  }

  async getUserGenderDistribution() {
    return await User.aggregate([
      {
        $group: {
          _id: '$profile.gender',
          count: { $sum: 1 }
        }
      }
    ]);
  }

  async getUserRetentionStats() {
    // Calculate D1, D7, D30 retention rates
    const cohorts = await User.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          users: { $push: "$_id" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: -1 }
      },
      {
        $limit: 30
      }
    ]);

    // This would need more complex logic to calculate actual retention
    // For now, return placeholder data
    return {
      day1: 75,
      day7: 45,
      day30: 25
    };
  }

  async getTotalActivityParticipants(startDate, endDate) {
    const result = await Activity.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $unwind: '$participants'
      },
      {
        $count: 'total'
      }
    ]);

    return result[0]?.total || 0;
  }

  async getAverageActivityParticipants() {
    const result = await Activity.aggregate([
      {
        $project: {
          participantCount: { $size: '$participants' }
        }
      },
      {
        $group: {
          _id: null,
          averageParticipants: { $avg: '$participantCount' }
        }
      }
    ]);

    return Math.round(result[0]?.averageParticipants || 0);
  }

  async getActivityCategoryDistribution(startDate, endDate) {
    return await Activity.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
  }

  async getActivityLocationDistribution(startDate, endDate) {
    return await Activity.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          'location.address': { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            $arrayElemAt: [
              { $split: ['$location.address', ','] },
              -1
            ]
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);
  }

  async getDailyActivityCreation(startDate, endDate) {
    return await Activity.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
  }

  async getPopularActivities(startDate, endDate) {
    return await Activity.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $project: {
          title: 1,
          category: 1,
          participantCount: { $size: '$participants' },
          organizer: 1
        }
      },
      {
        $sort: { participantCount: -1 }
      },
      {
        $limit: 10
      }
    ]);
  }

  async getChurnRate(startDate, endDate) {
    const totalSubscriptions = await Subscription.countDocuments({
      createdAt: { $lt: startDate }
    });
    
    const canceledSubscriptions = await Subscription.countDocuments({
      canceledAt: { $gte: startDate, $lte: endDate }
    });

    return totalSubscriptions > 0 ? (canceledSubscriptions / totalSubscriptions) * 100 : 0;
  }

  async getConversionRate(startDate, endDate) {
    const totalUsers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    const subscribedUsers = await Subscription.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    return totalUsers > 0 ? (subscribedUsers / totalUsers) * 100 : 0;
  }

  async getSubscriptionTierDistribution() {
    return await Subscription.aggregate([
      {
        $match: { status: 'active' }
      },
      {
        $group: {
          _id: '$tier',
          count: { $sum: 1 }
        }
      }
    ]);
  }

  async getDailySubscriptions(startDate, endDate) {
    return await Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.amount' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
  }

  async getCustomerLifetimeValue() {
    const result = await Subscription.aggregate([
      {
        $match: { status: { $in: ['active', 'canceled'] } }
      },
      {
        $group: {
          _id: '$userId',
          totalRevenue: { $sum: '$pricing.amount' },
          subscriptionCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          averageLTV: { $avg: '$totalRevenue' }
        }
      }
    ]);

    return Math.round(result[0]?.averageLTV || 0);
  }

  async getMonthlyRecurringRevenue() {
    const result = await Subscription.aggregate([
      {
        $match: { 
          status: 'active',
          'pricing.interval': 'month'
        }
      },
      {
        $group: {
          _id: null,
          mrr: { $sum: '$pricing.amount' }
        }
      }
    ]);

    return result[0]?.mrr || 0;
  }

  async getAverageRevenuePerUser() {
    const [totalRevenue, totalUsers] = await Promise.all([
      Subscription.aggregate([
        {
          $match: { status: { $in: ['active', 'canceled'] } }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$pricing.amount' }
          }
        }
      ]),
      User.countDocuments()
    ]);

    const revenue = totalRevenue[0]?.total || 0;
    return totalUsers > 0 ? revenue / totalUsers : 0;
  }

  async getDailyRevenue(startDate, endDate) {
    return await Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          revenue: { $sum: '$pricing.amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
  }

  async getRevenueByTier(startDate, endDate) {
    return await Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$tier',
          revenue: { $sum: '$pricing.amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { revenue: -1 }
      }
    ]);
  }

  // Placeholder methods for moderation stats (would need proper implementation)
  async getTotalReports(startDate, endDate) { return 0; }
  async getPendingReports() { return 0; }
  async getResolvedReports(startDate, endDate) { return 0; }
  async getFlaggedContent() { return 0; }
  async getModerationActions(startDate, endDate) { return []; }
  async getAverageModerationResponseTime() { return 0; }
  async getReportCategories(startDate, endDate) { return []; }

  // Placeholder methods for engagement stats (would need proper implementation)
  async getDailyActiveUsers(startDate, endDate) { 
    return await User.countDocuments({
      lastActive: { $gte: startDate, $lte: endDate }
    });
  }
  
  async getAverageSessionDuration(startDate, endDate) { return 0; }
  async getFeatureUsageStats(startDate, endDate) { return {}; }
  async getEngagementTrends(startDate, endDate) { return []; }
  async getUserEngagementDistribution() { return {}; }
}

module.exports = new AdminDashboardService();