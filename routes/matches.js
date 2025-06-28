const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Match = require('../models/Match');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { auth, requireEmailVerification } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Get all matches for the current user
router.get('/', auth, requireEmailVerification, [
  query('type').optional().isIn(['all', 'mutual', 'pending']).withMessage('Invalid match type'),
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
      type = 'all',
      limit = 20,
      offset = 0
    } = req.query;

    const currentUser = req.user;
    
    // Build query
    let query = {
      $or: [
        { user1: currentUser._id },
        { user2: currentUser._id }
      ],
      status: 'active'
    };

    // Apply type filter
    if (type === 'mutual') {
      query.mutual = true;
    } else if (type === 'pending') {
      query.mutual = false;
    }

    // Get matches with populated user data
    const matches = await Match.find(query)
      .populate('user1', 'profile.name profile.age profile.photos profile.occupation profile.bio')
      .populate('user2', 'profile.name profile.age profile.photos profile.occupation profile.bio')
      .populate('conversationId', 'lastMessage messageCount unreadCount')
      .sort({ matchedAt: -1, createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    // Transform matches to include the other user's data
    const transformedMatches = matches.map(match => {
      const isUser1 = match.user1._id.toString() === currentUser._id.toString();
      const otherUser = isUser1 ? match.user2 : match.user1;
      const currentUserAction = isUser1 ? match.user1Action : match.user2Action;
      const otherUserAction = isUser1 ? match.user2Action : match.user1Action;
      
      return {
        _id: match._id,
        otherUser: {
          _id: otherUser._id,
          profile: otherUser.profile
        },
        mutual: match.mutual,
        matchedAt: match.matchedAt,
        expiresAt: match.expiresAt,
        currentUserAction,
        otherUserAction,
        compatibility: match.compatibility,
        conversation: match.conversationId ? {
          _id: match.conversationId._id,
          lastMessage: match.conversationId.lastMessage,
          messageCount: match.conversationId.messageCount,
          unreadCount: isUser1 
            ? match.conversationId.unreadCount?.user1 || 0
            : match.conversationId.unreadCount?.user2 || 0
        } : null,
        status: match.status,
        createdAt: match.createdAt
      };
    });

    // Get total count for pagination
    const totalCount = await Match.countDocuments(query);

    logger.info('Matches fetched', {
      userId: currentUser._id,
      type,
      count: transformedMatches.length,
      totalCount
    });

    res.json({
      success: true,
      data: {
        matches: transformedMatches,
        pagination: {
          total: totalCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: totalCount > parseInt(offset) + parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get matches error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch matches',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get a specific match
router.get('/:matchId', auth, requireEmailVerification, async (req, res) => {
  try {
    const { matchId } = req.params;
    const currentUser = req.user;

    const match = await Match.findById(matchId)
      .populate('user1', 'profile.name profile.age profile.photos profile.occupation profile.bio profile.prompts')
      .populate('user2', 'profile.name profile.age profile.photos profile.occupation profile.bio profile.prompts')
      .populate('conversationId');

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Verify user is part of this match
    const isParticipant = match.user1._id.toString() === currentUser._id.toString() || 
                         match.user2._id.toString() === currentUser._id.toString();
    
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Mark match as seen by current user
    const isUser1 = match.user1._id.toString() === currentUser._id.toString();
    if (isUser1 && !match.user1SeenMatch) {
      match.user1SeenMatch = true;
      await match.save();
    } else if (!isUser1 && !match.user2SeenMatch) {
      match.user2SeenMatch = true;
      await match.save();
    }

    // Transform match data
    const otherUser = isUser1 ? match.user2 : match.user1;
    
    const transformedMatch = {
      _id: match._id,
      otherUser: {
        _id: otherUser._id,
        profile: otherUser.profile
      },
      mutual: match.mutual,
      matchedAt: match.matchedAt,
      expiresAt: match.expiresAt,
      compatibility: match.compatibility,
      conversation: match.conversationId,
      status: match.status,
      createdAt: match.createdAt
    };

    res.json({
      success: true,
      data: {
        match: transformedMatch
      }
    });

  } catch (error) {
    logger.error('Get match error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch match',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Unmatch with a user
router.delete('/:matchId', auth, requireEmailVerification, async (req, res) => {
  try {
    const { matchId } = req.params;
    const currentUser = req.user;

    const match = await Match.findById(matchId);
    
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Verify user is part of this match
    const isParticipant = match.user1.toString() === currentUser._id.toString() || 
                         match.user2.toString() === currentUser._id.toString();
    
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Mark match as unmatched
    match.status = 'unmatched';
    await match.save();

    // Archive the conversation if it exists
    if (match.conversationId) {
      await Conversation.findByIdAndUpdate(match.conversationId, {
        status: 'archived'
      });
    }

    logger.info('Match unmatched', {
      matchId: match._id,
      unmatchedBy: currentUser._id
    });

    res.json({
      success: true,
      message: 'Successfully unmatched'
    });

  } catch (error) {
    logger.error('Unmatch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unmatch',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get match statistics
router.get('/stats/overview', auth, requireEmailVerification, async (req, res) => {
  try {
    const currentUser = req.user;

    // Get various match statistics
    const [
      totalMatches,
      mutualMatches,
      pendingMatches,
      recentMatches,
      expiredMatches
    ] = await Promise.all([
      Match.countDocuments({
        $or: [{ user1: currentUser._id }, { user2: currentUser._id }],
        status: 'active'
      }),
      Match.countDocuments({
        $or: [{ user1: currentUser._id }, { user2: currentUser._id }],
        mutual: true,
        status: 'active'
      }),
      Match.countDocuments({
        $or: [{ user1: currentUser._id }, { user2: currentUser._id }],
        mutual: false,
        status: 'active'
      }),
      Match.countDocuments({
        $or: [{ user1: currentUser._id }, { user2: currentUser._id }],
        mutual: true,
        status: 'active',
        matchedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      }),
      Match.countDocuments({
        $or: [{ user1: currentUser._id }, { user2: currentUser._id }],
        status: 'expired'
      })
    ]);

    // Calculate match rate
    const totalSwipes = currentUser.analytics.totalSwipes || 0;
    const matchRate = totalSwipes > 0 ? Math.round((mutualMatches / totalSwipes) * 100) : 0;

    const stats = {
      totalMatches,
      mutualMatches,
      pendingMatches,
      recentMatches,
      expiredMatches,
      matchRate,
      totalSwipes
    };

    res.json({
      success: true,
      data: { stats }
    });

  } catch (error) {
    logger.error('Match stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch match statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get users who liked the current user (for premium features)
router.get('/likes/received', auth, requireEmailVerification, [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const currentUser = req.user;

    // Check if user has premium subscription (implement based on your subscription model)
    if (currentUser.subscription.type === 'free') {
      return res.status(403).json({
        success: false,
        message: 'Premium subscription required to see who liked you'
      });
    }

    // Find users who liked the current user but haven't been swiped back
    const likes = await Match.find({
      user2: currentUser._id,
      user2Action: 'pending',
      user1Action: { $in: ['like', 'super_like'] },
      status: 'active'
    })
    .populate('user1', 'profile.name profile.age profile.photos profile.occupation')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

    const likedByUsers = likes.map(like => ({
      _id: like._id,
      user: {
        _id: like.user1._id,
        profile: like.user1.profile
      },
      action: like.user1Action,
      likedAt: like.createdAt,
      compatibility: like.compatibility
    }));

    res.json({
      success: true,
      data: {
        likes: likedByUsers,
        count: likedByUsers.length
      }
    });

  } catch (error) {
    logger.error('Get received likes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch received likes',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;