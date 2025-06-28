const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Match = require('../models/Match');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const { auth, requireEmailVerification } = require('../middleware/auth');
const logger = require('../utils/logger');
const bcrypt = require('bcrypt');

const router = express.Router();

// Get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-passwordHash')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update user profile
router.put('/me', auth, requireEmailVerification, [
  body('profile.name').optional().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('profile.bio').optional().isLength({ max: 500 }).withMessage('Bio must be max 500 characters'),
  body('profile.occupation').optional().isLength({ max: 100 }).withMessage('Occupation must be max 100 characters'),
  body('profile.education').optional().isLength({ max: 100 }).withMessage('Education must be max 100 characters'),
  body('profile.interests').optional().isArray().withMessage('Interests must be an array'),
  body('profile.photos').optional().isArray().withMessage('Photos must be an array'),
  body('profile.prompts').optional().isArray().withMessage('Prompts must be an array'),
  body('profile.location.coordinates').optional().isArray({ min: 2, max: 2 }).withMessage('Coordinates must be [longitude, latitude]'),
  body('profile.agePreference.min').optional().isInt({ min: 18, max: 100 }).withMessage('Min age must be 18-100'),
  body('profile.agePreference.max').optional().isInt({ min: 18, max: 100 }).withMessage('Max age must be 18-100'),
  body('profile.distancePreference').optional().isFloat({ min: 1, max: 100 }).withMessage('Distance preference must be 1-100 km'),
  body('profile.genderPreference').optional().isArray().withMessage('Gender preference must be an array')
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

    const updateData = req.body;
    const userId = req.user._id;

    // Validate age preference ranges
    if (updateData.profile?.agePreference) {
      const { min, max } = updateData.profile.agePreference;
      if (min && max && min > max) {
        return res.status(400).json({
          success: false,
          message: 'Minimum age cannot be greater than maximum age'
        });
      }
    }

    // Validate location coordinates
    if (updateData.profile?.location?.coordinates) {
      const [lng, lat] = updateData.profile.location.coordinates;
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coordinates'
        });
      }
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    logger.info('User profile updated', {
      userId: userId,
      updatedFields: Object.keys(updateData)
    });

    res.json({
      success: true,
      data: { user: updatedUser },
      message: 'Profile updated successfully'
    });

  } catch (error) {
    logger.error('Update user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update user settings
router.put('/me/settings', auth, requireEmailVerification, [
  body('notifications').optional().isObject(),
  body('privacy').optional().isObject(),
  body('discovery').optional().isObject()
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

    const { notifications, privacy, discovery } = req.body;
    const userId = req.user._id;

    const updateData = {};
    if (notifications) updateData['settings.notifications'] = notifications;
    if (privacy) updateData['settings.privacy'] = privacy;
    if (discovery) updateData['settings.discovery'] = discovery;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('settings');

    logger.info('User settings updated', {
      userId: userId,
      updatedSettings: Object.keys(req.body)
    });

    res.json({
      success: true,
      data: { settings: updatedUser.settings },
      message: 'Settings updated successfully'
    });

  } catch (error) {
    logger.error('Update user settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Change password
router.put('/me/password', auth, requireEmailVerification, [
  body('currentPassword').isLength({ min: 8 }).withMessage('Current password required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match');
    }
    return true;
  })
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

    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    // Get user with password hash
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    user.passwordHash = hashedNewPassword;
    await user.save();

    logger.info('User password changed', { userId: userId });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user's conversations
router.get('/me/conversations', auth, requireEmailVerification, [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
], async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const userId = req.user._id;

    const conversations = await Conversation.findUserConversations(userId)
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    // Transform conversations for response
    const transformedConversations = conversations.map(conversation => {
      const otherParticipant = conversation.participants.find(p => 
        p._id.toString() !== userId.toString()
      );
      
      return {
        _id: conversation._id,
        otherUser: {
          _id: otherParticipant._id,
          name: otherParticipant.profile.name,
          photos: otherParticipant.profile.photos,
          age: otherParticipant.profile.age
        },
        lastMessage: conversation.lastMessage,
        messageCount: conversation.messageCount,
        unreadCount: conversation.getUnreadCount(userId),
        status: conversation.status,
        updatedAt: conversation.updatedAt
      };
    });

    res.json({
      success: true,
      data: {
        conversations: transformedConversations,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: conversations.length === parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get user conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user's notifications
router.get('/me/notifications', auth, requireEmailVerification, [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  query('unreadOnly').optional().isBoolean().withMessage('UnreadOnly must be boolean')
], async (req, res) => {
  try {
    const { limit = 20, offset = 0, unreadOnly = false } = req.query;
    const userId = req.user._id;

    let notifications;
    if (unreadOnly === 'true') {
      notifications = await Notification.findUnreadForUser(userId)
        .skip(parseInt(offset))
        .limit(parseInt(limit));
    } else {
      notifications = await Notification.findForUser(userId, parseInt(limit), parseInt(offset));
    }

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      'channels.inApp.read': false,
      expiresAt: { $gt: new Date() }
    });

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: notifications.length === parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get user notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Mark notifications as read
router.put('/me/notifications/read', auth, requireEmailVerification, [
  body('notificationIds').optional().isArray().withMessage('Notification IDs must be an array')
], async (req, res) => {
  try {
    const { notificationIds } = req.body;
    const userId = req.user._id;

    const query = {
      recipient: userId,
      'channels.inApp.read': false
    };

    if (notificationIds && notificationIds.length > 0) {
      query._id = { $in: notificationIds };
    }

    await Notification.updateMany(
      query,
      {
        $set: {
          'channels.inApp.read': true,
          'channels.inApp.readAt': new Date(),
          status: 'read'
        }
      }
    );

    logger.info('Notifications marked as read', {
      userId: userId,
      count: notificationIds?.length || 'all'
    });

    res.json({
      success: true,
      message: 'Notifications marked as read'
    });

  } catch (error) {
    logger.error('Mark notifications read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user statistics
router.get('/me/stats', auth, requireEmailVerification, async (req, res) => {
  try {
    const userId = req.user._id;

    const [
      totalMatches,
      activeConversations,
      totalMessages,
      unreadNotifications,
      profileViews
    ] = await Promise.all([
      Match.countDocuments({
        $or: [{ user1: userId }, { user2: userId }],
        mutual: true,
        status: 'active'
      }),
      Conversation.countDocuments({
        participants: userId,
        status: 'active'
      }),
      require('../models/Message').countDocuments({
        sender: userId
      }),
      Notification.countDocuments({
        recipient: userId,
        'channels.inApp.read': false,
        expiresAt: { $gt: new Date() }
      }),
      // Profile views from user analytics
      req.user.analytics.profileViews || 0
    ]);

    const stats = {
      matches: {
        total: totalMatches,
        thisWeek: 0 // TODO: Calculate weekly matches
      },
      conversations: {
        active: activeConversations,
        withUnread: 0 // TODO: Calculate conversations with unread messages
      },
      messages: {
        sent: totalMessages,
        thisWeek: 0 // TODO: Calculate weekly messages
      },
      profile: {
        views: profileViews,
        thisWeek: 0 // TODO: Calculate weekly profile views
      },
      notifications: {
        unread: unreadNotifications
      }
    };

    res.json({
      success: true,
      data: { stats }
    });

  } catch (error) {
    logger.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete user account
router.delete('/me', auth, requireEmailVerification, [
  body('password').isLength({ min: 8 }).withMessage('Password required for account deletion'),
  body('reason').optional().isLength({ max: 500 }).withMessage('Reason must be max 500 characters')
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

    const { password, reason } = req.body;
    const userId = req.user._id;

    // Get user with password hash
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect password'
      });
    }

    // Soft delete user account
    user.status = 'deleted';
    user.deletedAt = new Date();
    user.metadata.deletionReason = reason;
    await user.save();

    // Archive all conversations
    await Conversation.updateMany(
      { participants: userId },
      { status: 'deleted' }
    );

    // Mark all matches as deleted
    await Match.updateMany(
      { $or: [{ user1: userId }, { user2: userId }] },
      { status: 'deleted' }
    );

    logger.info('User account deleted', {
      userId: userId,
      reason: reason
    });

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    logger.error('Delete user account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;