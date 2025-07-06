/**
 * Admin Routes
 * Comprehensive administrative dashboard and management endpoints
 */

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const AdminDashboardService = require('../services/AdminDashboardService');
const AdminUser = require('../models/AdminUser');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Match = require('../models/Match');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { auth, requireEmailVerification } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. Admin token required.'
      });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await AdminUser.findById(decoded.id);
    
    if (!admin || admin.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'Invalid admin token or account inactive'
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    // Fallback to regular user admin check
    if (req.user && req.user.role === 'admin') {
      req.admin = { 
        _id: req.user._id,
        hasPermission: () => true,
        logAction: () => Promise.resolve()
      };
      return next();
    }
    
    logger.error('Admin authentication error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid admin token'
    });
  }
};

// Permission middleware
const requirePermission = (resource, action) => {
  return (req, res, next) => {
    if (req.admin.hasPermission && !req.admin.hasPermission(resource, action)) {
      return res.status(403).json({
        success: false,
        error: `Permission denied. Required: ${action} on ${resource}`
      });
    }
    next();
  };
};

// Legacy admin middleware for backwards compatibility
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  req.admin = { 
    _id: req.user._id,
    hasPermission: () => true,
    logAction: () => Promise.resolve()
  };
  next();
};

// Rate limiting for admin endpoints
const adminLimiter = rateLimiter.createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window
  message: 'Too many admin requests, please try again later'
});

// Apply admin authentication to all routes (try new first, fallback to legacy)
router.use((req, res, next) => {
  // Try new admin authentication first
  authenticateAdmin(req, res, (err) => {
    if (err || !req.admin) {
      // Fallback to legacy admin authentication
      auth(req, res, (authErr) => {
        if (authErr) return next(authErr);
        requireEmailVerification(req, res, (emailErr) => {
          if (emailErr) return next(emailErr);
          requireAdmin(req, res, next);
        });
      });
    } else {
      next();
    }
  });
});

router.use(adminLimiter);

// New comprehensive dashboard overview
router.get('/dashboard/overview',
  requirePermission('analytics', 'read'),
  query('timeframe').optional().isIn(['24h', '7d', '30d', '90d']).withMessage('Invalid timeframe'),
  async (req, res) => {
    try {
      const timeframe = req.query.timeframe || '7d';
      const overview = await AdminDashboardService.getOverviewStats(timeframe);

      if (req.admin.logAction) {
        await req.admin.logAction('view_dashboard', 'dashboard', null, { timeframe }, req.ip);
      }

      res.json({
        success: true,
        data: overview
      });

    } catch (error) {
      logger.error('Error getting dashboard overview:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard overview'
      });
    }
  }
);

// Legacy dashboard analytics (maintained for backwards compatibility)
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalMatches,
      totalMessages,
      totalActivities,
      pendingActivities,
      reportedUsers,
      reportedActivities
    ] = await Promise.all([
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ 
        status: 'active',
        'verification.emailVerified': true,
        'metadata.lastActiveAt': { 
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
        }
      }),
      Match.countDocuments({ mutual: true, status: 'active' }),
      Message.countDocuments({ isDeleted: false }),
      Activity.countDocuments({ status: 'active' }),
      Activity.countDocuments({ status: 'active', isApproved: false }),
      User.countDocuments({ 'safety.reports.0': { $exists: true } }),
      Activity.countDocuments({ 'reports.0': { $exists: true } })
    ]);

    // Get registration trend (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const registrationTrend = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get match success rate
    const totalSwipes = await Match.countDocuments();
    const matchRate = totalSwipes > 0 ? Math.round((totalMatches / totalSwipes) * 100) : 0;

    const analytics = {
      users: {
        total: totalUsers,
        active: activeUsers,
        registrationTrend
      },
      engagement: {
        totalMatches,
        totalMessages,
        matchRate,
        averageMessagesPerMatch: totalMatches > 0 ? Math.round(totalMessages / totalMatches) : 0
      },
      content: {
        totalActivities,
        pendingActivities,
        approvalRate: totalActivities > 0 ? Math.round(((totalActivities - pendingActivities) / totalActivities) * 100) : 0
      },
      moderation: {
        reportedUsers,
        reportedActivities,
        pendingReviews: reportedUsers + reportedActivities + pendingActivities
      }
    };

    res.json({
      success: true,
      data: { analytics }
    });

  } catch (error) {
    logger.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// User management
router.get('/users', [
  query('status').optional().isIn(['active', 'suspended', 'deleted']).withMessage('Invalid status'),
  query('verified').optional().isBoolean().withMessage('Verified must be boolean'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  query('search').optional().isLength({ min: 1 }).withMessage('Search query required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const {
      status,
      verified,
      limit = 50,
      offset = 0,
      search
    } = req.query;

    // Build query
    const query = {};

    if (status) {
      query.status = status;
    }

    if (verified !== undefined) {
      query['verification.emailVerified'] = verified === 'true';
    }

    if (search) {
      query.$or = [
        { 'profile.name': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('email profile status verification createdAt metadata.lastActiveAt safety.reports')
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    const totalCount = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total: totalCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: totalCount > parseInt(offset) + parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user details
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate('safety.reports.reportedBy', 'profile.name email')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user statistics
    const [totalMatches, totalMessages, activitiesCreated] = await Promise.all([
      Match.countDocuments({
        $or: [{ user1: userId }, { user2: userId }],
        mutual: true,
        status: 'active'
      }),
      Message.countDocuments({ sender: userId }),
      Activity.countDocuments({ createdBy: userId })
    ]);

    const userDetails = {
      ...user,
      statistics: {
        totalMatches,
        totalMessages,
        activitiesCreated
      }
    };

    res.json({
      success: true,
      data: { user: userDetails }
    });

  } catch (error) {
    logger.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update user status
router.put('/users/:userId/status', [
  body('status').isIn(['active', 'suspended', 'deleted']).withMessage('Invalid status'),
  body('reason').optional().isLength({ min: 5, max: 500 }).withMessage('Reason must be 5-500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const { status, reason } = req.body;
    const currentAdmin = req.user;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const oldStatus = user.status;
    user.status = status;

    // Add to moderation history
    user.safety.moderationHistory.push({
      action: `status_changed_${oldStatus}_to_${status}`,
      moderator: currentAdmin._id,
      reason: reason,
      timestamp: new Date()
    });

    await user.save();

    logger.info('User status updated', {
      userId: user._id,
      oldStatus,
      newStatus: status,
      moderator: currentAdmin._id,
      reason
    });

    res.json({
      success: true,
      message: `User status updated to ${status}`,
      data: {
        userId: user._id,
        status: user.status
      }
    });

  } catch (error) {
    logger.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Activity moderation
router.get('/activities/pending', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
], async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const activities = await Activity.find({
      isApproved: false,
      status: 'active'
    })
    .populate('createdBy', 'profile.name email')
    .sort({ createdAt: -1 })
    .skip(parseInt(offset))
    .limit(parseInt(limit))
    .lean();

    const totalCount = await Activity.countDocuments({
      isApproved: false,
      status: 'active'
    });

    res.json({
      success: true,
      data: {
        activities,
        pagination: {
          total: totalCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: totalCount > parseInt(offset) + parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get pending activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending activities',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Approve/reject activity
router.put('/activities/:activityId/review', [
  body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
  body('reason').optional().isLength({ min: 5, max: 500 }).withMessage('Reason must be 5-500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { activityId } = req.params;
    const { action, reason } = req.body;
    const currentAdmin = req.user;

    const activity = await Activity.findById(activityId);
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    if (action === 'approve') {
      activity.isApproved = true;
      activity.approvedBy = currentAdmin._id;
      activity.approvedAt = new Date();
    } else {
      activity.status = 'inactive';
    }

    await activity.save();

    logger.info('Activity reviewed', {
      activityId: activity._id,
      action,
      reviewer: currentAdmin._id,
      reason
    });

    res.json({
      success: true,
      message: `Activity ${action}d successfully`,
      data: {
        activityId: activity._id,
        status: activity.status,
        isApproved: activity.isApproved
      }
    });

  } catch (error) {
    logger.error('Review activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review activity',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get reported content
router.get('/reports', [
  query('type').optional().isIn(['users', 'activities']).withMessage('Type must be users or activities'),
  query('status').optional().isIn(['pending', 'reviewed', 'resolved']).withMessage('Invalid status'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const {
      type,
      status = 'pending',
      limit = 20,
      offset = 0
    } = req.query;

    let reports = [];

    if (!type || type === 'users') {
      const userReports = await User.find({
        'safety.reports.0': { $exists: true },
        'safety.reports.status': status
      })
      .populate('safety.reports.reportedBy', 'profile.name email')
      .select('email profile safety.reports')
      .skip(!type ? parseInt(offset) : 0)
      .limit(!type ? parseInt(limit) : parseInt(limit))
      .lean();

      userReports.forEach(user => {
        user.safety.reports.forEach(report => {
          if (report.status === status) {
            reports.push({
              type: 'user',
              targetId: user._id,
              target: {
                email: user.email,
                name: user.profile.name
              },
              report
            });
          }
        });
      });
    }

    if (!type || type === 'activities') {
      const activityReports = await Activity.find({
        'reports.0': { $exists: true },
        'reports.status': status
      })
      .populate('reports.reportedBy', 'profile.name email')
      .populate('createdBy', 'profile.name email')
      .select('title category reports createdBy')
      .skip(!type ? 0 : parseInt(offset))
      .limit(!type ? parseInt(limit) : parseInt(limit))
      .lean();

      activityReports.forEach(activity => {
        activity.reports.forEach(report => {
          if (report.status === status) {
            reports.push({
              type: 'activity',
              targetId: activity._id,
              target: {
                title: activity.title,
                category: activity.category,
                createdBy: activity.createdBy
              },
              report
            });
          }
        });
      });
    }

    // Sort by report date
    reports.sort((a, b) => new Date(b.report.reportedAt) - new Date(a.report.reportedAt));

    res.json({
      success: true,
      data: {
        reports: reports.slice(parseInt(offset), parseInt(offset) + parseInt(limit)),
        total: reports.length
      }
    });

  } catch (error) {
    logger.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Platform statistics
router.get('/statistics', async (req, res) => {
  try {
    const [
      userStats,
      activityStats,
      engagementStats,
      geoStats
    ] = await Promise.all([
      // User statistics
      User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            verified: {
              $sum: {
                $cond: ['$verification.emailVerified', 1, 0]
              }
            },
            active: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      '$metadata.lastActiveAt',
                      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),

      // Activity statistics
      Activity.aggregate([
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            averageRating: { $avg: '$averageRating' }
          }
        }
      ]),

      // Engagement statistics
      Match.aggregate([
        {
          $group: {
            _id: null,
            totalMatches: { $sum: 1 },
            mutualMatches: {
              $sum: {
                $cond: ['$mutual', 1, 0]
              }
            }
          }
        }
      ]),

      // Geographic distribution
      User.aggregate([
        {
          $match: {
            'profile.location.coordinates': { $exists: true }
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
      ])
    ]);

    res.json({
      success: true,
      data: {
        users: userStats[0] || { total: 0, verified: 0, active: 0 },
        activities: activityStats,
        engagement: engagementStats[0] || { totalMatches: 0, mutualMatches: 0 },
        geography: geoStats
      }
    });

  } catch (error) {
    logger.error('Get statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Enhanced User Management with comprehensive filtering
router.get('/users/enhanced',
  requirePermission('users', 'read'),
  async (req, res) => {
    try {
      const filters = {
        search: req.query.search,
        status: req.query.status,
        verificationStatus: req.query.verificationStatus === 'true',
        subscriptionTier: req.query.subscriptionTier,
        location: req.query.location,
        ageMin: parseInt(req.query.ageMin),
        ageMax: parseInt(req.query.ageMax),
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc',
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50
      };

      const result = await AdminDashboardService.getUserManagement(filters);

      if (req.admin.logAction) {
        await req.admin.logAction('view_users_enhanced', 'users', null, filters, req.ip);
      }

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Error getting enhanced user management data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user data'
      });
    }
  }
);

// Enhanced Activity Management
router.get('/activities/enhanced',
  requirePermission('activities', 'read'),
  async (req, res) => {
    try {
      const filters = {
        search: req.query.search,
        category: req.query.category,
        status: req.query.status,
        organizer: req.query.organizer,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        location: req.query.location,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc',
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50
      };

      const result = await AdminDashboardService.getActivityManagement(filters);

      if (req.admin.logAction) {
        await req.admin.logAction('view_activities_enhanced', 'activities', null, filters, req.ip);
      }

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Error getting enhanced activity management data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get activity data'
      });
    }
  }
);

// Analytics endpoints
router.get('/analytics/users',
  requirePermission('analytics', 'read'),
  async (req, res) => {
    try {
      const timeframe = req.query.timeframe || '30d';
      const { startDate, endDate } = AdminDashboardService.getDateRange(timeframe);
      
      const userStats = await AdminDashboardService.getUserStats(startDate, endDate);

      if (req.admin.logAction) {
        await req.admin.logAction('view_user_analytics', 'analytics', null, { timeframe }, req.ip);
      }

      res.json({
        success: true,
        data: {
          timeframe,
          period: { start: startDate, end: endDate },
          stats: userStats
        }
      });

    } catch (error) {
      logger.error('Error getting user analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user analytics'
      });
    }
  }
);

router.get('/analytics/activities',
  requirePermission('analytics', 'read'),
  async (req, res) => {
    try {
      const timeframe = req.query.timeframe || '30d';
      const { startDate, endDate } = AdminDashboardService.getDateRange(timeframe);
      
      const activityStats = await AdminDashboardService.getActivityStats(startDate, endDate);

      if (req.admin.logAction) {
        await req.admin.logAction('view_activity_analytics', 'analytics', null, { timeframe }, req.ip);
      }

      res.json({
        success: true,
        data: {
          timeframe,
          period: { start: startDate, end: endDate },
          stats: activityStats
        }
      });

    } catch (error) {
      logger.error('Error getting activity analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get activity analytics'
      });
    }
  }
);

router.get('/analytics/revenue',
  requirePermission('financial_reports', 'read'),
  async (req, res) => {
    try {
      const timeframe = req.query.timeframe || '30d';
      const { startDate, endDate } = AdminDashboardService.getDateRange(timeframe);
      
      const revenueStats = await AdminDashboardService.getRevenueStats(startDate, endDate);

      if (req.admin.logAction) {
        await req.admin.logAction('view_revenue_analytics', 'financial_reports', null, { timeframe }, req.ip);
      }

      res.json({
        success: true,
        data: {
          timeframe,
          period: { start: startDate, end: endDate },
          stats: revenueStats
        }
      });

    } catch (error) {
      logger.error('Error getting revenue analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get revenue analytics'
      });
    }
  }
);

// Admin Management
router.get('/admins',
  requirePermission('admin_management', 'read'),
  async (req, res) => {
    try {
      const admins = await AdminUser.findActiveAdmins();

      res.json({
        success: true,
        data: { admins }
      });

    } catch (error) {
      logger.error('Error getting admin list:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get admin list'
      });
    }
  }
);

router.post('/admins',
  requirePermission('admin_management', 'create'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').isLength({ min: 1, max: 50 }).withMessage('First name required'),
  body('lastName').isLength({ min: 1, max: 50 }).withMessage('Last name required'),
  body('role').isIn(['admin', 'moderator', 'analyst', 'support_agent']).withMessage('Invalid role'),
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

      const { email, password, firstName, lastName, role, department } = req.body;

      // Check if admin already exists
      const existingAdmin = await AdminUser.findOne({ email });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          error: 'Admin with this email already exists'
        });
      }

      // Get default permissions for role
      const defaultRoles = AdminUser.createDefaultRoles();
      const roleConfig = defaultRoles.find(r => r.role === role);
      
      if (!roleConfig) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role specified'
        });
      }

      const newAdmin = new AdminUser({
        email,
        password,
        profile: {
          firstName,
          lastName,
          department: department || 'operations'
        },
        role,
        permissions: roleConfig.permissions,
        createdBy: req.admin._id,
        status: 'pending_verification'
      });

      await newAdmin.save();

      if (req.admin.logAction) {
        await req.admin.logAction('create_admin', 'admin_management', newAdmin._id, {
          email,
          role,
          firstName,
          lastName
        }, req.ip);
      }

      logger.info('New admin created', {
        newAdminId: newAdmin._id,
        email,
        role,
        createdBy: req.admin._id
      });

      res.status(201).json({
        success: true,
        data: {
          message: 'Admin created successfully',
          admin: {
            id: newAdmin._id,
            email: newAdmin.email,
            role: newAdmin.role,
            status: newAdmin.status
          }
        }
      });

    } catch (error) {
      logger.error('Error creating admin:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create admin'
      });
    }
  }
);

// System Settings
router.get('/settings',
  requirePermission('system_settings', 'read'),
  async (req, res) => {
    try {
      const settings = {
        app: {
          maintenanceMode: false,
          registrationEnabled: true,
          maxDailyActivities: 10,
          defaultSubscriptionTier: 'free'
        },
        security: {
          maxLoginAttempts: 5,
          passwordExpireDays: 90,
          sessionTimeoutMinutes: 60,
          twoFactorRequired: false
        },
        notifications: {
          emailEnabled: true,
          pushEnabled: true,
          smsEnabled: false
        },
        features: {
          photoVerificationRequired: false,
          advancedFiltersEnabled: true,
          mlRecommendationsEnabled: true
        }
      };

      res.json({
        success: true,
        data: { settings }
      });

    } catch (error) {
      logger.error('Error getting system settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get system settings'
      });
    }
  }
);

// Recent Admin Activity
router.get('/activity',
  requirePermission('admin_management', 'read'),
  async (req, res) => {
    try {
      const hours = parseInt(req.query.hours) || 24;
      const activity = await AdminUser.getRecentActivity(hours);

      res.json({
        success: true,
        data: {
          timeframe: `${hours}h`,
          activity
        }
      });

    } catch (error) {
      logger.error('Error getting admin activity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get admin activity'
      });
    }
  }
);

module.exports = router;