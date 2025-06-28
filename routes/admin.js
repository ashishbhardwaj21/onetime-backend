const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Match = require('../models/Match');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { auth, requireEmailVerification } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// Apply admin middleware to all routes
router.use(auth, requireEmailVerification, requireAdmin);

// Dashboard analytics
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

module.exports = router;