const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Match = require('../models/Match');
const { auth, requireEmailVerification } = require('../middleware/auth');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

const router = express.Router();

// Get messages for a conversation
router.get('/conversation/:conversationId', auth, requireEmailVerification, [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('before').optional().isISO8601().withMessage('Before must be a valid date'),
  query('after').optional().isISO8601().withMessage('After must be a valid date')
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

    const { conversationId } = req.params;
    const { limit = 50, before, after } = req.query;
    const currentUser = req.user;

    // Verify conversation exists and user is a participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const isParticipant = conversation.participants.some(p => 
      p.toString() === currentUser._id.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Build query
    const query = {
      conversationId: conversationId,
      isDeleted: false,
      deletedBy: { $ne: currentUser._id }
    };

    // Apply date filters
    if (before || after) {
      query.timestamp = {};
      if (before) query.timestamp.$lt = new Date(before);
      if (after) query.timestamp.$gt = new Date(after);
    }

    // Get messages
    const messages = await Message.find(query)
      .populate('sender', 'profile.name profile.photos')
      .populate('reactions.user', 'profile.name')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();

    // Mark messages as read by current user
    const unreadMessageIds = messages
      .filter(msg => 
        msg.sender._id.toString() !== currentUser._id.toString() &&
        !msg.readBy.some(read => read.user.toString() === currentUser._id.toString())
      )
      .map(msg => msg._id);

    if (unreadMessageIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessageIds } },
        { 
          $addToSet: { 
            readBy: { 
              user: currentUser._id, 
              readAt: new Date() 
            } 
          } 
        }
      );

      // Update conversation unread count
      conversation.markAsRead(currentUser._id);
      await conversation.save();
    }

    // Transform messages for response
    const transformedMessages = messages.reverse().map(message => ({
      _id: message._id,
      content: message.content,
      sender: {
        _id: message.sender._id,
        name: message.sender.profile.name,
        photos: message.sender.profile.photos
      },
      timestamp: message.timestamp,
      editedAt: message.editedAt,
      deliveredAt: message.deliveredAt,
      readBy: message.readBy,
      reactions: message.reactions.map(reaction => ({
        user: {
          _id: reaction.user._id,
          name: reaction.user.profile.name
        },
        emoji: reaction.emoji,
        addedAt: reaction.addedAt
      })),
      isOwn: message.sender._id.toString() === currentUser._id.toString()
    }));

    res.json({
      success: true,
      data: {
        messages: transformedMessages,
        hasMore: messages.length === parseInt(limit),
        conversation: {
          _id: conversation._id,
          messageCount: conversation.messageCount,
          unreadCount: conversation.getUnreadCount(currentUser._id)
        }
      }
    });

  } catch (error) {
    logger.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Send a new message
router.post('/', auth, requireEmailVerification, [
  body('conversationId').isMongoId().withMessage('Valid conversation ID required'),
  body('content.type').isIn(['text', 'image', 'video', 'voice', 'activity', 'location']).withMessage('Invalid message type'),
  body('content.text').optional().isLength({ min: 1, max: 1000 }).withMessage('Text must be 1-1000 characters'),
  body('content.mediaUrl').optional().isURL().withMessage('Invalid media URL'),
  body('content.duration').optional().isInt({ min: 1, max: 300 }).withMessage('Duration must be 1-300 seconds'),
  body('content.activity').optional().isObject(),
  body('content.location').optional().isObject()
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

    const { conversationId, content } = req.body;
    const currentUser = req.user;

    // Verify conversation exists and user is a participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const isParticipant = conversation.participants.some(p => 
      p.toString() === currentUser._id.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if conversation is still active
    if (conversation.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot send message to inactive conversation'
      });
    }

    // Validate content based on type
    if (content.type === 'text' && !content.text) {
      return res.status(400).json({
        success: false,
        message: 'Text content is required for text messages'
      });
    }

    if (['image', 'video', 'voice'].includes(content.type) && !content.mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Media URL is required for media messages'
      });
    }

    // Create new message
    const message = new Message({
      conversationId: conversationId,
      sender: currentUser._id,
      content: content,
      timestamp: new Date()
    });

    await message.save();

    // Populate sender data for response
    await message.populate('sender', 'profile.name profile.photos');

    // Get the other participant for real-time notification
    const otherParticipant = conversation.getOtherParticipant(currentUser._id);

    // Emit real-time message via Socket.io (handled by server.js)
    const io = req.app.get('socketio');
    if (io && otherParticipant) {
      io.to(`user_${otherParticipant.toString()}`).emit('new_message', {
        _id: message._id,
        conversationId: conversation._id,
        content: message.content,
        sender: {
          _id: message.sender._id,
          name: message.sender.profile.name,
          photos: message.sender.profile.photos
        },
        timestamp: message.timestamp
      });
    }

    logger.info('Message sent', {
      messageId: message._id,
      conversationId: conversation._id,
      sender: currentUser._id,
      type: content.type
    });

    res.status(201).json({
      success: true,
      data: {
        message: {
          _id: message._id,
          content: message.content,
          sender: {
            _id: message.sender._id,
            name: message.sender.profile.name,
            photos: message.sender.profile.photos
          },
          timestamp: message.timestamp,
          readBy: message.readBy,
          reactions: message.reactions
        }
      }
    });

  } catch (error) {
    logger.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Edit a message
router.put('/:messageId', auth, requireEmailVerification, [
  body('content.text').isLength({ min: 1, max: 1000 }).withMessage('Text must be 1-1000 characters')
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

    const { messageId } = req.params;
    const { content } = req.body;
    const currentUser = req.user;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Only sender can edit the message
    if (message.sender.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only sender can edit message'
      });
    }

    // Only text messages can be edited
    if (message.content.type !== 'text') {
      return res.status(400).json({
        success: false,
        message: 'Only text messages can be edited'
      });
    }

    // Can't edit messages older than 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (message.timestamp < fifteenMinutesAgo) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit messages older than 15 minutes'
      });
    }

    // Update message
    message.content.text = content.text;
    message.editedAt = new Date();
    await message.save();

    res.json({
      success: true,
      data: {
        message: {
          _id: message._id,
          content: message.content,
          editedAt: message.editedAt
        }
      }
    });

  } catch (error) {
    logger.error('Edit message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to edit message',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete a message
router.delete('/:messageId', auth, requireEmailVerification, async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUser = req.user;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is participant in the conversation
    const conversation = await Conversation.findById(message.conversationId);
    const isParticipant = conversation.participants.some(p => 
      p.toString() === currentUser._id.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Soft delete for user
    message.deleteForUser(currentUser._id);
    await message.save();

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    logger.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Add reaction to a message
router.post('/:messageId/reactions', auth, requireEmailVerification, [
  body('emoji').isLength({ min: 1, max: 10 }).withMessage('Emoji required')
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

    const { messageId } = req.params;
    const { emoji } = req.body;
    const currentUser = req.user;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is participant in the conversation
    const conversation = await Conversation.findById(message.conversationId);
    const isParticipant = conversation.participants.some(p => 
      p.toString() === currentUser._id.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Add reaction
    message.addReaction(currentUser._id, emoji);
    await message.save();

    await message.populate('reactions.user', 'profile.name');

    res.json({
      success: true,
      data: {
        reactions: message.reactions.map(reaction => ({
          user: {
            _id: reaction.user._id,
            name: reaction.user.profile.name
          },
          emoji: reaction.emoji,
          addedAt: reaction.addedAt
        }))
      }
    });

  } catch (error) {
    logger.error('Add reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add reaction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Remove reaction from a message
router.delete('/:messageId/reactions', auth, requireEmailVerification, async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUser = req.user;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is participant in the conversation
    const conversation = await Conversation.findById(message.conversationId);
    const isParticipant = conversation.participants.some(p => 
      p.toString() === currentUser._id.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Remove reaction
    message.removeReaction(currentUser._id);
    await message.save();

    await message.populate('reactions.user', 'profile.name');

    res.json({
      success: true,
      data: {
        reactions: message.reactions.map(reaction => ({
          user: {
            _id: reaction.user._id,
            name: reaction.user.profile.name
          },
          emoji: reaction.emoji,
          addedAt: reaction.addedAt
        }))
      }
    });

  } catch (error) {
    logger.error('Remove reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove reaction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Mark messages as read
router.post('/mark-read', auth, requireEmailVerification, [
  body('conversationId').isMongoId().withMessage('Valid conversation ID required'),
  body('messageIds').optional().isArray().withMessage('Message IDs must be an array')
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

    const { conversationId, messageIds } = req.body;
    const currentUser = req.user;

    // Verify conversation exists and user is a participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const isParticipant = conversation.participants.some(p => 
      p.toString() === currentUser._id.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Build query for messages to mark as read
    const query = {
      conversationId: conversationId,
      sender: { $ne: currentUser._id },
      'readBy.user': { $ne: currentUser._id }
    };

    if (messageIds && messageIds.length > 0) {
      query._id = { $in: messageIds };
    }

    // Mark messages as read
    await Message.updateMany(
      query,
      { 
        $addToSet: { 
          readBy: { 
            user: currentUser._id, 
            readAt: new Date() 
          } 
        } 
      }
    );

    // Update conversation unread count
    conversation.markAsRead(currentUser._id);
    await conversation.save();

    res.json({
      success: true,
      message: 'Messages marked as read'
    });

  } catch (error) {
    logger.error('Mark messages as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get message statistics
router.get('/stats', auth, requireEmailVerification, async (req, res) => {
  try {
    const currentUser = req.user;

    const [
      totalSent,
      totalReceived,
      unreadCount,
      recentMessages
    ] = await Promise.all([
      Message.countDocuments({ sender: currentUser._id }),
      Message.countDocuments({
        conversationId: { $in: await Conversation.find({ participants: currentUser._id }).distinct('_id') },
        sender: { $ne: currentUser._id }
      }),
      Message.countDocuments({
        conversationId: { $in: await Conversation.find({ participants: currentUser._id }).distinct('_id') },
        sender: { $ne: currentUser._id },
        'readBy.user': { $ne: currentUser._id }
      }),
      Message.countDocuments({
        sender: currentUser._id,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
    ]);

    const stats = {
      totalSent,
      totalReceived,
      unreadCount,
      recentMessages
    };

    res.json({
      success: true,
      data: { stats }
    });

  } catch (error) {
    logger.error('Message stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch message statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;