const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    content: String,
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'voice', 'activity', 'location', 'reaction'],
      default: 'text'
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date
  },
  messageCount: {
    type: Number,
    default: 0
  },
  unreadCount: {
    user1: {
      type: Number,
      default: 0
    },
    user2: {
      type: Number,
      default: 0
    }
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active'
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Conversations expire after 30 days of inactivity
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  },
  metadata: {
    firstMessageAt: Date,
    lastActiveAt: {
      type: Date,
      default: Date.now
    },
    averageResponseTime: Number, // in minutes
    totalResponseTime: {
      type: Number,
      default: 0
    },
    responseCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes
conversationSchema.index({ matchId: 1 }, { unique: true });
conversationSchema.index({ participants: 1 });
conversationSchema.index({ 'lastMessage.timestamp': -1 });
conversationSchema.index({ status: 1 });
conversationSchema.index({ expiresAt: 1 });

// Method to check if conversation has expired
conversationSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > this.expiresAt;
};

// Method to get the other participant
conversationSchema.methods.getOtherParticipant = function(userId) {
  return this.participants.find(p => p.toString() !== userId.toString());
};

// Method to get unread count for a specific user
conversationSchema.methods.getUnreadCount = function(userId) {
  const isUser1 = this.participants[0].toString() === userId.toString();
  return isUser1 ? this.unreadCount.user1 : this.unreadCount.user2;
};

// Method to set unread count for a specific user
conversationSchema.methods.setUnreadCount = function(userId, count) {
  const isUser1 = this.participants[0].toString() === userId.toString();
  if (isUser1) {
    this.unreadCount.user1 = count;
  } else {
    this.unreadCount.user2 = count;
  }
};

// Method to increment unread count for a specific user
conversationSchema.methods.incrementUnreadCount = function(userId) {
  const isUser1 = this.participants[0].toString() === userId.toString();
  if (isUser1) {
    this.unreadCount.user1 += 1;
  } else {
    this.unreadCount.user2 += 1;
  }
};

// Method to mark as read for a specific user
conversationSchema.methods.markAsRead = function(userId) {
  this.setUnreadCount(userId, 0);
};

// Method to update last message
conversationSchema.methods.updateLastMessage = function(message) {
  this.lastMessage = {
    content: message.content.text || message.content.type,
    type: message.content.type,
    sender: message.sender,
    timestamp: message.timestamp
  };
  
  this.messageCount += 1;
  this.metadata.lastActiveAt = new Date();
  
  // Update first message timestamp if this is the first message
  if (!this.metadata.firstMessageAt) {
    this.metadata.firstMessageAt = new Date();
  }
  
  // Reset expiration date on new activity
  this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  // Increment unread count for the other participant
  const otherParticipant = this.getOtherParticipant(message.sender);
  if (otherParticipant) {
    this.incrementUnreadCount(otherParticipant._id);
  }
};

// Method to calculate and update average response time
conversationSchema.methods.updateResponseTime = function(responseTime) {
  this.metadata.totalResponseTime += responseTime;
  this.metadata.responseCount += 1;
  this.metadata.averageResponseTime = this.metadata.totalResponseTime / this.metadata.responseCount;
};

// Static method to find conversations for a user
conversationSchema.statics.findUserConversations = function(userId) {
  return this.find({
    participants: userId,
    status: 'active'
  })
  .populate('participants', 'profile.name profile.photos profile.age')
  .populate('matchId')
  .sort({ 'lastMessage.timestamp': -1 });
};

// Static method to find conversation between two users
conversationSchema.statics.findByParticipants = function(user1Id, user2Id) {
  return this.findOne({
    participants: { $all: [user1Id, user2Id] }
  });
};

module.exports = mongoose.model('Conversation', conversationSchema);