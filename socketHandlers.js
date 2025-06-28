const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const Match = require('./models/Match');
const logger = require('./utils/logger');

// Store active connections
const activeConnections = new Map();

// Socket.io authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (!user || user.status !== 'active') {
      return next(new Error('Invalid user'));
    }

    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
};

// Handle socket connection
const handleConnection = (io) => {
  return (socket) => {
    const userId = socket.userId;
    
    logger.info('Socket connected', {
      socketId: socket.id,
      userId: userId
    });

    // Store active connection
    activeConnections.set(userId, {
      socketId: socket.id,
      socket: socket,
      connectedAt: new Date(),
      lastSeen: new Date()
    });

    // Join user to their personal room
    socket.join(`user_${userId}`);

    // Join user to their conversation rooms
    joinUserConversations(socket, userId);

    // Update user's online status
    updateUserOnlineStatus(userId, true);

    // Handle incoming events
    socket.on('join_conversation', (data) => handleJoinConversation(socket, data));
    socket.on('leave_conversation', (data) => handleLeaveConversation(socket, data));
    socket.on('send_message', (data) => handleSendMessage(socket, io, data));
    socket.on('typing_start', (data) => handleTypingStart(socket, data));
    socket.on('typing_stop', (data) => handleTypingStop(socket, data));
    socket.on('mark_messages_read', (data) => handleMarkMessagesRead(socket, data));
    socket.on('user_activity', () => handleUserActivity(socket));

    // Handle disconnection
    socket.on('disconnect', () => handleDisconnection(socket));
  };
};

// Join user to all their conversation rooms
const joinUserConversations = async (socket, userId) => {
  try {
    const conversations = await Conversation.find({
      participants: userId,
      status: 'active'
    }).select('_id');

    conversations.forEach(conversation => {
      socket.join(`conversation_${conversation._id}`);
    });

    logger.info('User joined conversations', {
      userId: userId,
      conversationCount: conversations.length
    });
  } catch (error) {
    logger.error('Error joining conversations:', error);
  }
};

// Handle joining a specific conversation
const handleJoinConversation = async (socket, data) => {
  try {
    const { conversationId } = data;
    const userId = socket.userId;

    // Verify user is participant in conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      socket.emit('error', { message: 'Access denied to conversation' });
      return;
    }

    socket.join(`conversation_${conversationId}`);
    
    // Mark user as active in conversation
    socket.to(`conversation_${conversationId}`).emit('user_joined_conversation', {
      userId: userId,
      conversationId: conversationId
    });

    logger.info('User joined conversation', {
      userId: userId,
      conversationId: conversationId
    });
  } catch (error) {
    logger.error('Join conversation error:', error);
    socket.emit('error', { message: 'Failed to join conversation' });
  }
};

// Handle leaving a conversation
const handleLeaveConversation = (socket, data) => {
  try {
    const { conversationId } = data;
    const userId = socket.userId;

    socket.leave(`conversation_${conversationId}`);
    
    socket.to(`conversation_${conversationId}`).emit('user_left_conversation', {
      userId: userId,
      conversationId: conversationId
    });

    logger.info('User left conversation', {
      userId: userId,
      conversationId: conversationId
    });
  } catch (error) {
    logger.error('Leave conversation error:', error);
  }
};

// Handle sending messages via Socket.io
const handleSendMessage = async (socket, io, data) => {
  try {
    const { conversationId, content } = data;
    const userId = socket.userId;

    // Verify conversation access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      socket.emit('error', { message: 'Access denied to conversation' });
      return;
    }

    // Create message
    const message = new Message({
      conversationId: conversationId,
      sender: userId,
      content: content,
      timestamp: new Date()
    });

    await message.save();
    await message.populate('sender', 'profile.name profile.photos');

    // Emit message to conversation participants
    const messageData = {
      _id: message._id,
      conversationId: conversationId,
      content: message.content,
      sender: {
        _id: message.sender._id,
        name: message.sender.profile.name,
        photos: message.sender.profile.photos
      },
      timestamp: message.timestamp,
      readBy: message.readBy,
      reactions: message.reactions
    };

    io.to(`conversation_${conversationId}`).emit('new_message', messageData);

    // Send push notification to offline users
    const otherParticipant = conversation.getOtherParticipant(userId);
    if (otherParticipant && !activeConnections.has(otherParticipant.toString())) {
      // TODO: Implement push notification logic
      sendPushNotification(otherParticipant, {
        type: 'new_message',
        title: `New message from ${message.sender.profile.name}`,
        body: message.getDisplayContent(),
        data: {
          conversationId: conversationId,
          messageId: message._id
        }
      });
    }

    logger.info('Message sent via socket', {
      messageId: message._id,
      conversationId: conversationId,
      sender: userId
    });
  } catch (error) {
    logger.error('Send message via socket error:', error);
    socket.emit('error', { message: 'Failed to send message' });
  }
};

// Handle typing indicators
const handleTypingStart = (socket, data) => {
  try {
    const { conversationId } = data;
    const userId = socket.userId;

    socket.to(`conversation_${conversationId}`).emit('typing_start', {
      userId: userId,
      conversationId: conversationId
    });
  } catch (error) {
    logger.error('Typing start error:', error);
  }
};

const handleTypingStop = (socket, data) => {
  try {
    const { conversationId } = data;
    const userId = socket.userId;

    socket.to(`conversation_${conversationId}`).emit('typing_stop', {
      userId: userId,
      conversationId: conversationId
    });
  } catch (error) {
    logger.error('Typing stop error:', error);
  }
};

// Handle marking messages as read
const handleMarkMessagesRead = async (socket, data) => {
  try {
    const { conversationId, messageIds } = data;
    const userId = socket.userId;

    // Update messages as read
    const query = {
      conversationId: conversationId,
      sender: { $ne: userId },
      'readBy.user': { $ne: userId }
    };

    if (messageIds && messageIds.length > 0) {
      query._id = { $in: messageIds };
    }

    await Message.updateMany(
      query,
      { 
        $addToSet: { 
          readBy: { 
            user: userId, 
            readAt: new Date() 
          } 
        } 
      }
    );

    // Update conversation unread count
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      conversation.markAsRead(userId);
      await conversation.save();
    }

    // Notify other participants about read status
    socket.to(`conversation_${conversationId}`).emit('messages_read', {
      conversationId: conversationId,
      readBy: userId,
      messageIds: messageIds
    });

    logger.info('Messages marked as read via socket', {
      conversationId: conversationId,
      userId: userId,
      messageCount: messageIds?.length || 'all'
    });
  } catch (error) {
    logger.error('Mark messages read error:', error);
    socket.emit('error', { message: 'Failed to mark messages as read' });
  }
};

// Handle user activity updates
const handleUserActivity = (socket) => {
  try {
    const userId = socket.userId;
    const connection = activeConnections.get(userId);
    
    if (connection) {
      connection.lastSeen = new Date();
      activeConnections.set(userId, connection);
    }

    // Update user's last active timestamp periodically
    User.findByIdAndUpdate(userId, {
      'metadata.lastActiveAt': new Date()
    }).catch(error => {
      logger.error('Update user activity error:', error);
    });
  } catch (error) {
    logger.error('User activity error:', error);
  }
};

// Handle user disconnection
const handleDisconnection = async (socket) => {
  try {
    const userId = socket.userId;
    
    logger.info('Socket disconnected', {
      socketId: socket.id,
      userId: userId
    });

    // Remove from active connections
    activeConnections.delete(userId);

    // Update user's online status
    await updateUserOnlineStatus(userId, false);

    // Notify conversations about user going offline
    const conversations = await Conversation.find({
      participants: userId,
      status: 'active'
    }).select('_id');

    conversations.forEach(conversation => {
      socket.to(`conversation_${conversation._id}`).emit('user_offline', {
        userId: userId,
        conversationId: conversation._id
      });
    });
  } catch (error) {
    logger.error('Disconnection handling error:', error);
  }
};

// Update user's online status
const updateUserOnlineStatus = async (userId, isOnline) => {
  try {
    await User.findByIdAndUpdate(userId, {
      'metadata.isOnline': isOnline,
      'metadata.lastActiveAt': new Date()
    });
  } catch (error) {
    logger.error('Update online status error:', error);
  }
};

// Send push notification (placeholder - implement with your push service)
const sendPushNotification = async (userId, notification) => {
  try {
    // TODO: Implement actual push notification logic
    // This could use Firebase FCM, Apple Push Notifications, etc.
    logger.info('Push notification sent', {
      userId: userId,
      type: notification.type,
      title: notification.title
    });
  } catch (error) {
    logger.error('Push notification error:', error);
  }
};

// Helper function to emit to specific user
const emitToUser = (io, userId, event, data) => {
  io.to(`user_${userId}`).emit(event, data);
};

// Helper function to emit to conversation
const emitToConversation = (io, conversationId, event, data) => {
  io.to(`conversation_${conversationId}`).emit(event, data);
};

// Helper function to get online users
const getOnlineUsers = () => {
  return Array.from(activeConnections.keys());
};

// Helper function to check if user is online
const isUserOnline = (userId) => {
  return activeConnections.has(userId);
};

// Export socket handlers and utilities
module.exports = {
  authenticateSocket,
  handleConnection,
  emitToUser,
  emitToConversation,
  getOnlineUsers,
  isUserOnline,
  sendPushNotification
};