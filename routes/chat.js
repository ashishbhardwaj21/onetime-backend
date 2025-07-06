/**
 * Advanced Real-Time Chat Routes
 * Handles all chat and messaging functionality
 */

const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const AdvancedChatService = require('../services/AdvancedChatService');
const { upload } = require('../middleware/upload');

/**
 * Get conversation messages with pagination
 * GET /api/chat/conversations/:conversationId/messages
 */
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, before = null } = req.query;
    const userId = req.user._id;

    // Verify user has access to conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to conversation'
      });
    }

    // Get messages
    const messages = await Message.findByConversation(conversationId, {
      limit: parseInt(limit),
      before: before ? new Date(before) : null,
      userId
    });

    // Mark messages as read
    const unreadMessageIds = messages
      .filter(msg => !msg.isReadBy(userId) && msg.sender.toString() !== userId.toString())
      .map(msg => msg._id);

    if (unreadMessageIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessageIds } },
        { $addToSet: { readBy: { user: userId, readAt: new Date() } } }
      );
    }

    // Format messages for response
    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      conversation: msg.conversation,
      sender: {
        _id: msg.sender._id,
        name: msg.sender.profile?.name,
        photo: msg.sender.profile?.photos?.[0]
      },
      content: msg.getDisplayContent(),
      messageType: msg.messageType,
      replyTo: msg.replyTo,
      reactions: msg.reactions,
      readBy: msg.readBy,
      edited: msg.edited,
      lastEditedAt: msg.lastEditedAt,
      timestamp: msg.timestamp,
      status: msg.status
    }));

    res.status(200).json({
      success: true,
      message: 'Messages retrieved successfully',
      data: {
        messages: formattedMessages,
        hasMore: messages.length === parseInt(limit),
        conversationId
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve messages'
    });
  }
});

/**
 * Send a text message
 * POST /api/chat/conversations/:conversationId/messages
 */
router.post('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, messageType = 'text', replyTo = null } = req.body;
    const senderId = req.user._id;

    // Validate input
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
    }

    // Verify conversation access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(senderId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to conversation'
      });
    }

    // Create message (real-time handling will be done by socket service)
    const message = new Message({
      conversation: conversationId,
      sender: senderId,
      content: content.trim(),
      messageType,
      replyTo,
      timestamp: new Date()
    });

    await message.save();

    // Populate message for response
    await message.populate('sender', 'profile.name profile.photos');
    if (replyTo) {
      await message.populate('replyTo', 'content sender timestamp messageType');
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message: {
          _id: message._id,
          conversation: message.conversation,
          sender: {
            _id: message.sender._id,
            name: message.sender.profile?.name,
            photo: message.sender.profile?.photos?.[0]
          },
          content: message.content,
          messageType: message.messageType,
          replyTo: message.replyTo,
          timestamp: message.timestamp,
          status: 'sent'
        }
      }
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

/**
 * Upload and send media message
 * POST /api/chat/conversations/:conversationId/media
 */
router.post('/conversations/:conversationId/media', upload.single('file'), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messageType = 'file' } = req.body;
    const senderId = req.user._id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Verify conversation access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(senderId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to conversation'
      });
    }

    // Create media message
    const message = new Message({
      conversation: conversationId,
      sender: senderId,
      content: req.file.path, // Cloudinary URL
      messageType,
      metadata: {
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        dimensions: req.file.width && req.file.height ? {
          width: req.file.width,
          height: req.file.height
        } : undefined
      },
      timestamp: new Date()
    });

    await message.save();
    await message.populate('sender', 'profile.name profile.photos');

    res.status(201).json({
      success: true,
      message: 'Media message sent successfully',
      data: {
        message: {
          _id: message._id,
          conversation: message.conversation,
          sender: {
            _id: message.sender._id,
            name: message.sender.profile?.name,
            photo: message.sender.profile?.photos?.[0]
          },
          content: message.content,
          messageType: message.messageType,
          metadata: message.metadata,
          timestamp: message.timestamp
        }
      }
    });

  } catch (error) {
    console.error('Media message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send media message'
    });
  }
});

/**
 * React to a message
 * POST /api/chat/messages/:messageId/reactions
 */
router.post('/messages/:messageId/reactions', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        error: 'Emoji is required'
      });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Verify user has access to conversation
    const conversation = await Conversation.findById(message.conversation);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Add reaction
    message.addReaction(userId, emoji);
    await message.save();

    res.status(200).json({
      success: true,
      message: 'Reaction added successfully',
      data: {
        messageId,
        reactions: message.reactions
      }
    });

  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add reaction'
    });
  }
});

/**
 * Remove reaction from a message
 * DELETE /api/chat/messages/:messageId/reactions
 */
router.delete('/messages/:messageId/reactions', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Verify user has access to conversation
    const conversation = await Conversation.findById(message.conversation);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Remove reaction
    message.removeReaction(userId);
    await message.save();

    res.status(200).json({
      success: true,
      message: 'Reaction removed successfully',
      data: {
        messageId,
        reactions: message.reactions
      }
    });

  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove reaction'
    });
  }
});

/**
 * Edit a message
 * PUT /api/chat/messages/:messageId
 */
router.put('/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Verify sender
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to edit this message'
      });
    }

    // Check edit time limit (15 minutes)
    const editTimeLimit = 15 * 60 * 1000;
    if (Date.now() - message.timestamp.getTime() > editTimeLimit) {
      return res.status(400).json({
        success: false,
        error: 'Edit time limit exceeded (15 minutes)'
      });
    }

    // Store edit history
    if (!message.editHistory) message.editHistory = [];
    message.editHistory.push({
      previousContent: message.content,
      editedAt: new Date()
    });

    // Update message
    message.content = content.trim();
    message.edited = true;
    message.lastEditedAt = new Date();
    await message.save();

    res.status(200).json({
      success: true,
      message: 'Message edited successfully',
      data: {
        messageId,
        content: message.content,
        edited: true,
        lastEditedAt: message.lastEditedAt
      }
    });

  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to edit message'
    });
  }
});

/**
 * Delete a message
 * DELETE /api/chat/messages/:messageId
 */
router.delete('/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { deleteFor = 'me' } = req.query; // 'me' or 'everyone'
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Verify sender
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this message'
      });
    }

    if (deleteFor === 'everyone') {
      // Check delete time limit (1 hour)
      const deleteTimeLimit = 60 * 60 * 1000;
      if (Date.now() - message.timestamp.getTime() > deleteTimeLimit) {
        return res.status(400).json({
          success: false,
          error: 'Delete time limit exceeded (1 hour)'
        });
      }

      // Soft delete for everyone
      message.deleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId;
    } else {
      // Hide for this user only
      message.hideForUser(userId);
    }

    await message.save();

    res.status(200).json({
      success: true,
      message: `Message deleted ${deleteFor === 'everyone' ? 'for everyone' : 'for you'}`,
      data: {
        messageId,
        deletedFor: deleteFor,
        deletedAt: deleteFor === 'everyone' ? message.deletedAt : new Date()
      }
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete message'
    });
  }
});

/**
 * Mark messages as read
 * POST /api/chat/conversations/:conversationId/read
 */
router.post('/conversations/:conversationId/read', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messageIds } = req.body;
    const userId = req.user._id;

    // Verify conversation access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to conversation'
      });
    }

    // Mark messages as read
    const result = await Message.updateMany(
      {
        _id: { $in: messageIds },
        conversation: conversationId,
        sender: { $ne: userId },
        'readBy.user': { $ne: userId }
      },
      {
        $addToSet: { readBy: { user: userId, readAt: new Date() } }
      }
    );

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
      data: {
        conversationId,
        markedCount: result.modifiedCount,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark messages as read'
    });
  }
});

/**
 * Get conversation analytics
 * GET /api/chat/conversations/:conversationId/analytics
 */
router.get('/conversations/:conversationId/analytics', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    // Verify conversation access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to conversation'
      });
    }

    // Get conversation statistics
    const stats = await Message.getConversationStats(conversationId);
    
    // Get additional metrics
    const totalMessages = await Message.countDocuments({ 
      conversation: conversationId, 
      deleted: false 
    });
    
    const totalMediaMessages = await Message.countDocuments({
      conversation: conversationId,
      messageType: { $in: ['image', 'video', 'voice', 'file'] },
      deleted: false
    });

    const totalReactions = await Message.aggregate([
      { $match: { conversation: mongoose.Types.ObjectId(conversationId), deleted: false } },
      { $project: { reactionCount: { $size: '$reactions' } } },
      { $group: { _id: null, total: { $sum: '$reactionCount' } } }
    ]);

    res.status(200).json({
      success: true,
      message: 'Conversation analytics retrieved',
      data: {
        conversationId,
        stats: stats[0] || {},
        metrics: {
          totalMessages,
          totalMediaMessages,
          totalReactions: totalReactions[0]?.total || 0,
          mediaPercentage: totalMessages > 0 ? Math.round((totalMediaMessages / totalMessages) * 100) : 0
        },
        generated: new Date()
      }
    });

  } catch (error) {
    console.error('Conversation analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversation analytics'
    });
  }
});

/**
 * Search messages in conversation
 * GET /api/chat/conversations/:conversationId/search
 */
router.get('/conversations/:conversationId/search', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { query, limit = 20 } = req.query;
    const userId = req.user._id;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    // Verify conversation access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to conversation'
      });
    }

    // Search messages
    const messages = await Message.find({
      conversation: conversationId,
      deleted: false,
      hiddenFor: { $ne: userId },
      messageType: 'text',
      content: { $regex: query.trim(), $options: 'i' }
    })
    .populate('sender', 'profile.name profile.photos')
    .sort({ timestamp: -1 })
    .limit(parseInt(limit));

    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      content: msg.content,
      sender: {
        _id: msg.sender._id,
        name: msg.sender.profile?.name
      },
      timestamp: msg.timestamp,
      // Highlight search term in content
      highlightedContent: msg.content.replace(
        new RegExp(query.trim(), 'gi'),
        match => `<mark>${match}</mark>`
      )
    }));

    res.status(200).json({
      success: true,
      message: 'Search results retrieved',
      data: {
        query,
        results: formattedMessages,
        total: formattedMessages.length,
        conversationId
      }
    });

  } catch (error) {
    console.error('Message search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search messages'
    });
  }
});

module.exports = router;