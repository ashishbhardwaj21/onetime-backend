/**
 * Advanced Real-Time Chat Service
 * 
 * Features:
 * - Real-time messaging with Socket.io
 * - Message encryption and security
 * - Typing indicators and read receipts
 * - File and media sharing
 * - Message reactions and interactions
 * - Chat moderation and safety features
 * - Message threading and replies
 * - Voice message support
 * - Chat analytics and insights
 * - Conversation management
 */

const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const ContentModerationSystem = require('./ContentModerationSystem');
const SecurityFraudDetection = require('./SecurityFraudDetection');
const PushNotificationService = require('./PushNotificationService');
const crypto = require('crypto');

class AdvancedChatService {
  constructor(io) {
    this.io = io;
    this.activeUsers = new Map(); // userId -> socket info
    this.typingUsers = new Map(); // conversationId -> Set of userIds
    this.messageQueue = new Map(); // For offline message delivery
    
    // Initialize services
    this.moderation = new ContentModerationSystem();
    this.security = new SecurityFraudDetection();
    this.pushService = new PushNotificationService();
    
    // Message encryption settings
    this.encryptionKey = process.env.MESSAGE_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    
    // Rate limiting settings
    this.rateLimits = {
      messagesPerMinute: 20,
      typingUpdatesPerMinute: 10,
      reactionsPerMinute: 30
    };
    
    this.setupSocketHandlers();
  }

  /**
   * Setup Socket.io event handlers
   */
  setupSocketHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      console.log(`💬 Chat service: User connected - ${socket.userId}`);
      
      // Store active user
      this.activeUsers.set(socket.userId, {
        socketId: socket.id,
        socket: socket,
        lastSeen: new Date(),
        status: 'online'
      });

      // Handle joining conversations
      socket.on('join_conversation', (data) => this.handleJoinConversation(socket, data));
      
      // Handle leaving conversations
      socket.on('leave_conversation', (data) => this.handleLeaveConversation(socket, data));
      
      // Handle sending messages
      socket.on('send_message', (data) => this.handleSendMessage(socket, data));
      
      // Handle typing indicators
      socket.on('typing_start', (data) => this.handleTypingStart(socket, data));
      socket.on('typing_stop', (data) => this.handleTypingStop(socket, data));
      
      // Handle message reactions
      socket.on('react_to_message', (data) => this.handleMessageReaction(socket, data));
      
      // Handle message read receipts
      socket.on('mark_as_read', (data) => this.handleMarkAsRead(socket, data));
      
      // Handle voice messages
      socket.on('send_voice_message', (data) => this.handleVoiceMessage(socket, data));
      
      // Handle file uploads
      socket.on('send_file', (data) => this.handleFileMessage(socket, data));
      
      // Handle message editing
      socket.on('edit_message', (data) => this.handleEditMessage(socket, data));
      
      // Handle message deletion
      socket.on('delete_message', (data) => this.handleDeleteMessage(socket, data));
      
      // Handle disconnection
      socket.on('disconnect', () => this.handleDisconnection(socket));
    });
  }

  /**
   * Handle user joining a conversation
   */
  async handleJoinConversation(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      // Verify user is participant
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.includes(userId)) {
        socket.emit('error', { message: 'Access denied to conversation' });
        return;
      }

      // Join socket room
      socket.join(`conversation_${conversationId}`);
      
      // Update user's active conversations
      if (!socket.activeConversations) socket.activeConversations = new Set();
      socket.activeConversations.add(conversationId);

      // Get recent messages
      const messages = await this.getRecentMessages(conversationId, 50);
      
      // Get typing users
      const typingUsers = Array.from(this.typingUsers.get(conversationId) || [])
        .filter(id => id !== userId);

      socket.emit('conversation_joined', {
        conversationId,
        messages,
        typingUsers,
        timestamp: new Date()
      });

      // Notify other participants
      socket.to(`conversation_${conversationId}`).emit('user_joined', {
        userId,
        conversationId,
        timestamp: new Date()
      });

      console.log(`📥 User ${userId} joined conversation ${conversationId}`);

    } catch (error) {
      console.error('Join conversation error:', error);
      socket.emit('error', { message: 'Failed to join conversation' });
    }
  }

  /**
   * Handle user leaving a conversation
   */
  handleLeaveConversation(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      socket.leave(`conversation_${conversationId}`);
      
      if (socket.activeConversations) {
        socket.activeConversations.delete(conversationId);
      }

      // Stop typing if user was typing
      this.handleTypingStop(socket, { conversationId });

      // Notify other participants
      socket.to(`conversation_${conversationId}`).emit('user_left', {
        userId,
        conversationId,
        timestamp: new Date()
      });

      console.log(`📤 User ${userId} left conversation ${conversationId}`);

    } catch (error) {
      console.error('Leave conversation error:', error);
    }
  }

  /**
   * Handle sending a new message
   */
  async handleSendMessage(socket, data) {
    try {
      const { conversationId, content, messageType = 'text', replyTo = null } = data;
      const senderId = socket.userId;

      // Rate limiting check
      if (!this.checkRateLimit(senderId, 'messages')) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      // Security and fraud check
      const fraudCheck = await this.security.detectRealTimeFraud(
        senderId,
        'message',
        { content, conversationId },
        { ip: socket.handshake.address, userAgent: socket.handshake.headers['user-agent'] }
      );

      if (!fraudCheck.allowed) {
        socket.emit('error', { message: 'Message blocked due to security concerns' });
        return;
      }

      // Content moderation
      const moderationResult = await this.moderation.moderateTextContent(content, senderId, 'message');
      
      if (moderationResult.action === 'block') {
        socket.emit('message_blocked', {
          reason: 'inappropriate_content',
          violations: moderationResult.violations
        });
        return;
      }

      // Verify conversation access
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.includes(senderId)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Encrypt message content
      const encryptedContent = this.encryptMessage(content);

      // Create message
      const message = new Message({
        conversation: conversationId,
        sender: senderId,
        content: encryptedContent,
        originalContent: content, // Store for moderation history
        messageType,
        replyTo,
        moderationResult: {
          action: moderationResult.action,
          score: moderationResult.score,
          autoApproved: moderationResult.action === 'approved'
        },
        encryption: {
          algorithm: 'aes-256-gcm',
          encrypted: true
        },
        metadata: {
          fraudScore: fraudCheck.riskScore,
          deviceFingerprint: fraudCheck.deviceFingerprint
        },
        timestamp: new Date()
      });

      await message.save();

      // Update conversation
      conversation.lastMessage = message._id;
      conversation.lastMessageAt = new Date();
      conversation.messageCount = (conversation.messageCount || 0) + 1;
      await conversation.save();

      // Prepare message for broadcasting
      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'profile.name profile.photos')
        .populate('replyTo', 'content sender timestamp');

      const broadcastMessage = {
        _id: populatedMessage._id,
        conversation: conversationId,
        sender: {
          _id: populatedMessage.sender._id,
          name: populatedMessage.sender.profile.name,
          photo: populatedMessage.sender.profile.photos?.[0]
        },
        content: content, // Send decrypted content to authorized users
        messageType,
        replyTo: populatedMessage.replyTo,
        timestamp: populatedMessage.timestamp,
        reactions: [],
        readBy: [senderId],
        editHistory: []
      };

      // Broadcast to conversation participants
      this.io.to(`conversation_${conversationId}`).emit('new_message', broadcastMessage);

      // Send push notifications to offline users
      await this.sendMessageNotifications(conversation, populatedMessage);

      // Stop typing indicator for sender
      this.handleTypingStop(socket, { conversationId });

      console.log(`💬 Message sent in conversation ${conversationId} by ${senderId}`);

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  /**
   * Handle typing indicators
   */
  handleTypingStart(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      if (!this.checkRateLimit(userId, 'typing')) {
        return;
      }

      if (!this.typingUsers.has(conversationId)) {
        this.typingUsers.set(conversationId, new Set());
      }

      this.typingUsers.get(conversationId).add(userId);

      socket.to(`conversation_${conversationId}`).emit('typing_start', {
        userId,
        conversationId,
        timestamp: new Date()
      });

      // Auto-stop typing after 3 seconds
      setTimeout(() => {
        this.handleTypingStop(socket, { conversationId });
      }, 3000);

    } catch (error) {
      console.error('Typing start error:', error);
    }
  }

  /**
   * Handle stopping typing indicators
   */
  handleTypingStop(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      if (this.typingUsers.has(conversationId)) {
        this.typingUsers.get(conversationId).delete(userId);
        
        if (this.typingUsers.get(conversationId).size === 0) {
          this.typingUsers.delete(conversationId);
        }
      }

      socket.to(`conversation_${conversationId}`).emit('typing_stop', {
        userId,
        conversationId,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Typing stop error:', error);
    }
  }

  /**
   * Handle message reactions
   */
  async handleMessageReaction(socket, data) {
    try {
      const { messageId, reaction, action = 'add' } = data; // action: 'add' or 'remove'
      const userId = socket.userId;

      if (!this.checkRateLimit(userId, 'reactions')) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Verify user has access to conversation
      const conversation = await Conversation.findById(message.conversation);
      if (!conversation || !conversation.participants.includes(userId)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Update reactions
      if (!message.reactions) message.reactions = [];
      
      const existingReaction = message.reactions.find(r => 
        r.user.toString() === userId && r.emoji === reaction
      );

      if (action === 'add' && !existingReaction) {
        message.reactions.push({
          user: userId,
          emoji: reaction,
          timestamp: new Date()
        });
      } else if (action === 'remove' && existingReaction) {
        message.reactions = message.reactions.filter(r => 
          !(r.user.toString() === userId && r.emoji === reaction)
        );
      }

      await message.save();

      // Broadcast reaction update
      this.io.to(`conversation_${message.conversation}`).emit('message_reaction', {
        messageId,
        userId,
        reaction,
        action,
        timestamp: new Date()
      });

      console.log(`😊 Reaction ${action}: ${reaction} on message ${messageId} by ${userId}`);

    } catch (error) {
      console.error('Message reaction error:', error);
      socket.emit('error', { message: 'Failed to update reaction' });
    }
  }

  /**
   * Handle marking messages as read
   */
  async handleMarkAsRead(socket, data) {
    try {
      const { conversationId, messageIds } = data;
      const userId = socket.userId;

      // Update read status for messages
      await Message.updateMany(
        {
          _id: { $in: messageIds },
          conversation: conversationId,
          sender: { $ne: userId }
        },
        {
          $addToSet: { readBy: userId }
        }
      );

      // Broadcast read receipts
      socket.to(`conversation_${conversationId}`).emit('messages_read', {
        conversationId,
        messageIds,
        readBy: userId,
        timestamp: new Date()
      });

      console.log(`👁️ Messages marked as read in conversation ${conversationId} by ${userId}`);

    } catch (error) {
      console.error('Mark as read error:', error);
    }
  }

  /**
   * Handle voice message upload
   */
  async handleVoiceMessage(socket, data) {
    try {
      const { conversationId, audioData, duration } = data;
      const senderId = socket.userId;

      // Rate limiting and security checks
      if (!this.checkRateLimit(senderId, 'messages')) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      // Verify conversation access
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.includes(senderId)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Here you would upload audio to cloud storage (Cloudinary, AWS S3, etc.)
      // For now, we'll simulate this
      const audioUrl = `voice_messages/${Date.now()}_${senderId}.webm`;

      const message = new Message({
        conversation: conversationId,
        sender: senderId,
        messageType: 'voice',
        content: audioUrl,
        metadata: {
          duration: duration,
          audioFormat: 'webm'
        },
        timestamp: new Date()
      });

      await message.save();

      // Broadcast voice message
      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'profile.name profile.photos');

      this.io.to(`conversation_${conversationId}`).emit('new_voice_message', {
        _id: populatedMessage._id,
        conversation: conversationId,
        sender: {
          _id: populatedMessage.sender._id,
          name: populatedMessage.sender.profile.name
        },
        audioUrl,
        duration,
        timestamp: populatedMessage.timestamp
      });

      console.log(`🎤 Voice message sent in conversation ${conversationId}`);

    } catch (error) {
      console.error('Voice message error:', error);
      socket.emit('error', { message: 'Failed to send voice message' });
    }
  }

  /**
   * Handle file sharing
   */
  async handleFileMessage(socket, data) {
    try {
      const { conversationId, fileData, fileName, fileType, fileSize } = data;
      const senderId = socket.userId;

      // File size and type validation
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];

      if (fileSize > maxFileSize) {
        socket.emit('error', { message: 'File too large (max 10MB)' });
        return;
      }

      if (!allowedTypes.includes(fileType)) {
        socket.emit('error', { message: 'File type not allowed' });
        return;
      }

      // Upload file to cloud storage
      // const fileUrl = await this.uploadFile(fileData, fileName, fileType);
      const fileUrl = `files/${Date.now()}_${fileName}`;

      const message = new Message({
        conversation: conversationId,
        sender: senderId,
        messageType: 'file',
        content: fileUrl,
        metadata: {
          fileName,
          fileType,
          fileSize,
          originalName: fileName
        },
        timestamp: new Date()
      });

      await message.save();

      // Broadcast file message
      this.io.to(`conversation_${conversationId}`).emit('new_file_message', {
        _id: message._id,
        conversation: conversationId,
        sender: senderId,
        fileUrl,
        fileName,
        fileType,
        fileSize,
        timestamp: message.timestamp
      });

      console.log(`📎 File shared in conversation ${conversationId}`);

    } catch (error) {
      console.error('File message error:', error);
      socket.emit('error', { message: 'Failed to send file' });
    }
  }

  /**
   * Handle message editing
   */
  async handleEditMessage(socket, data) {
    try {
      const { messageId, newContent } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Verify sender
      if (message.sender.toString() !== userId) {
        socket.emit('error', { message: 'Not authorized to edit this message' });
        return;
      }

      // Check edit time limit (e.g., 15 minutes)
      const editTimeLimit = 15 * 60 * 1000; // 15 minutes
      if (Date.now() - message.timestamp.getTime() > editTimeLimit) {
        socket.emit('error', { message: 'Edit time limit exceeded' });
        return;
      }

      // Content moderation for edited content
      const moderationResult = await this.moderation.moderateTextContent(newContent, userId, 'message');
      
      if (moderationResult.action === 'block') {
        socket.emit('message_blocked', {
          reason: 'inappropriate_content',
          violations: moderationResult.violations
        });
        return;
      }

      // Store edit history
      if (!message.editHistory) message.editHistory = [];
      message.editHistory.push({
        previousContent: this.decryptMessage(message.content),
        editedAt: new Date()
      });

      // Update message
      message.content = this.encryptMessage(newContent);
      message.edited = true;
      message.lastEditedAt = new Date();
      await message.save();

      // Broadcast edit
      this.io.to(`conversation_${message.conversation}`).emit('message_edited', {
        messageId,
        newContent,
        editedAt: message.lastEditedAt,
        timestamp: new Date()
      });

      console.log(`✏️ Message ${messageId} edited by ${userId}`);

    } catch (error) {
      console.error('Edit message error:', error);
      socket.emit('error', { message: 'Failed to edit message' });
    }
  }

  /**
   * Handle message deletion
   */
  async handleDeleteMessage(socket, data) {
    try {
      const { messageId, deleteFor = 'me' } = data; // 'me' or 'everyone'
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      if (deleteFor === 'everyone') {
        // Verify sender
        if (message.sender.toString() !== userId) {
          socket.emit('error', { message: 'Not authorized to delete for everyone' });
          return;
        }

        // Check delete time limit
        const deleteTimeLimit = 60 * 60 * 1000; // 1 hour
        if (Date.now() - message.timestamp.getTime() > deleteTimeLimit) {
          socket.emit('error', { message: 'Delete time limit exceeded' });
          return;
        }

        // Soft delete message
        message.deleted = true;
        message.deletedAt = new Date();
        message.deletedBy = userId;
        await message.save();

        // Broadcast deletion
        this.io.to(`conversation_${message.conversation}`).emit('message_deleted', {
          messageId,
          deletedFor: 'everyone',
          timestamp: new Date()
        });
      } else {
        // Delete for this user only - add to hidden messages
        if (!message.hiddenFor) message.hiddenFor = [];
        if (!message.hiddenFor.includes(userId)) {
          message.hiddenFor.push(userId);
          await message.save();
        }

        socket.emit('message_deleted', {
          messageId,
          deletedFor: 'me',
          timestamp: new Date()
        });
      }

      console.log(`🗑️ Message ${messageId} deleted by ${userId} (${deleteFor})`);

    } catch (error) {
      console.error('Delete message error:', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  }

  /**
   * Handle user disconnection
   */
  handleDisconnection(socket) {
    const userId = socket.userId;
    
    if (userId) {
      // Update user status
      if (this.activeUsers.has(userId)) {
        const userInfo = this.activeUsers.get(userId);
        userInfo.status = 'offline';
        userInfo.lastSeen = new Date();
      }

      // Stop all typing indicators for this user
      if (socket.activeConversations) {
        socket.activeConversations.forEach(conversationId => {
          this.handleTypingStop(socket, { conversationId });
        });
      }

      // Remove from active users after delay (in case of reconnection)
      setTimeout(() => {
        if (this.activeUsers.has(userId)) {
          const userInfo = this.activeUsers.get(userId);
          if (userInfo.status === 'offline') {
            this.activeUsers.delete(userId);
          }
        }
      }, 30000); // 30 seconds

      console.log(`👋 User ${userId} disconnected from chat service`);
    }
  }

  /**
   * Get recent messages for a conversation
   */
  async getRecentMessages(conversationId, limit = 50) {
    try {
      const messages = await Message.find({
        conversation: conversationId,
        deleted: { $ne: true }
      })
      .populate('sender', 'profile.name profile.photos')
      .populate('replyTo', 'content sender timestamp')
      .sort({ timestamp: -1 })
      .limit(limit);

      return messages.reverse().map(msg => ({
        _id: msg._id,
        conversation: msg.conversation,
        sender: {
          _id: msg.sender._id,
          name: msg.sender.profile.name,
          photo: msg.sender.profile.photos?.[0]
        },
        content: this.decryptMessage(msg.content),
        messageType: msg.messageType,
        replyTo: msg.replyTo,
        reactions: msg.reactions || [],
        readBy: msg.readBy || [],
        edited: msg.edited || false,
        timestamp: msg.timestamp
      }));

    } catch (error) {
      console.error('Get recent messages error:', error);
      return [];
    }
  }

  /**
   * Send push notifications for new messages
   */
  async sendMessageNotifications(conversation, message) {
    try {
      const offlineParticipants = conversation.participants.filter(participantId => 
        participantId.toString() !== message.sender._id.toString() &&
        !this.activeUsers.has(participantId.toString())
      );

      for (const participantId of offlineParticipants) {
        await this.pushService.sendMessageNotification(
          participantId, 
          message.sender, 
          this.decryptMessage(message.content)
        );
      }

    } catch (error) {
      console.error('Send message notifications error:', error);
    }
  }

  /**
   * Encrypt message content
   */
  encryptMessage(content) {
    try {
      const algorithm = 'aes-256-gcm';
      const key = Buffer.from(this.encryptionKey, 'hex');
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipher(algorithm, key);
      let encrypted = cipher.update(content, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      console.error('Encryption error:', error);
      return content; // Fallback to unencrypted
    }
  }

  /**
   * Decrypt message content
   */
  decryptMessage(encryptedData) {
    try {
      if (typeof encryptedData === 'string') {
        return encryptedData; // Already decrypted or plain text
      }

      const algorithm = 'aes-256-gcm';
      const key = Buffer.from(this.encryptionKey, 'hex');
      
      const decipher = crypto.createDecipher(algorithm, key);
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return '[Encrypted message]'; // Fallback
    }
  }

  /**
   * Rate limiting check
   */
  checkRateLimit(userId, action) {
    const key = `${action}_${userId}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    
    if (!this.rateLimitData) this.rateLimitData = new Map();
    
    let userData = this.rateLimitData.get(key) || { attempts: [], limit: this.rateLimits[`${action}PerMinute`] };
    
    // Clean old attempts
    userData.attempts = userData.attempts.filter(timestamp => now - timestamp < windowMs);
    
    // Check limit
    if (userData.attempts.length >= userData.limit) {
      return false;
    }
    
    // Add current attempt
    userData.attempts.push(now);
    this.rateLimitData.set(key, userData);
    
    return true;
  }

  /**
   * Get conversation analytics
   */
  async getConversationAnalytics(conversationId) {
    try {
      const messages = await Message.find({ conversation: conversationId });
      
      return {
        totalMessages: messages.length,
        messageTypes: this.groupBy(messages, 'messageType'),
        participantStats: this.calculateParticipantStats(messages),
        averageResponseTime: this.calculateAverageResponseTime(messages),
        peakActivityHours: this.calculatePeakActivity(messages),
        sentimentAnalysis: this.analyzeSentiment(messages)
      };
    } catch (error) {
      console.error('Conversation analytics error:', error);
      return null;
    }
  }

  // Helper methods for analytics
  groupBy(array, key) {
    return array.reduce((result, item) => {
      const group = item[key];
      result[group] = (result[group] || 0) + 1;
      return result;
    }, {});
  }

  calculateParticipantStats(messages) {
    const stats = {};
    messages.forEach(msg => {
      const senderId = msg.sender.toString();
      stats[senderId] = (stats[senderId] || 0) + 1;
    });
    return stats;
  }

  calculateAverageResponseTime(messages) {
    // Implementation for response time calculation
    return 0; // Placeholder
  }

  calculatePeakActivity(messages) {
    // Implementation for peak activity analysis
    return {}; // Placeholder
  }

  analyzeSentiment(messages) {
    // Implementation for sentiment analysis
    return { positive: 0, neutral: 0, negative: 0 }; // Placeholder
  }
}

module.exports = AdvancedChatService;