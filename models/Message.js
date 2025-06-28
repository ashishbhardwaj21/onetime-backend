const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'voice', 'activity', 'location', 'reaction'],
      required: true
    },
    text: String,
    mediaUrl: String, // Cloudinary URL for images/videos
    duration: Number, // for voice messages (seconds)
    activity: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Activity'
      },
      title: String,
      description: String,
      location: String,
      dateTime: Date
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number], // [longitude, latitude]
      name: String
    },
    reaction: {
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
      },
      emoji: String
    }
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  timestamp: {
    type: Date,
    default: Date.now
  },
  editedAt: Date,
  deliveredAt: Date,
  metadata: {
    deviceType: String,
    appVersion: String,
    location: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: [Number]
    }
  }
}, {
  timestamps: true
});

// Indexes
messageSchema.index({ conversationId: 1, timestamp: -1 });
messageSchema.index({ sender: 1, timestamp: -1 });
messageSchema.index({ timestamp: -1 });
messageSchema.index({ 'content.type': 1 });

// Virtual for formatted timestamp
messageSchema.virtual('formattedTime').get(function() {
  return this.timestamp.toISOString();
});

// Method to check if message is read by a specific user
messageSchema.methods.isReadBy = function(userId) {
  return this.readBy.some(read => read.user.toString() === userId.toString());
};

// Method to mark message as read by a user
messageSchema.methods.markAsRead = function(userId) {
  if (!this.isReadBy(userId)) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
  }
};

// Method to add reaction
messageSchema.methods.addReaction = function(userId, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(r => r.user.toString() !== userId.toString());
  
  // Add new reaction
  this.reactions.push({
    user: userId,
    emoji: emoji,
    addedAt: new Date()
  });
};

// Method to remove reaction
messageSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(r => r.user.toString() !== userId.toString());
};

// Method to soft delete message for a user
messageSchema.methods.deleteForUser = function(userId) {
  if (!this.deletedBy.includes(userId)) {
    this.deletedBy.push(userId);
  }
  
  // If both users have deleted, mark as deleted
  if (this.deletedBy.length >= 2) {
    this.isDeleted = true;
  }
};

// Method to check if message is deleted for a user
messageSchema.methods.isDeletedForUser = function(userId) {
  return this.deletedBy.includes(userId) || this.isDeleted;
};

// Method to get display content based on type
messageSchema.methods.getDisplayContent = function() {
  switch (this.content.type) {
    case 'text':
      return this.content.text;
    case 'image':
      return '📷 Image';
    case 'video':
      return '🎥 Video';
    case 'voice':
      return `🎤 Voice message (${this.content.duration}s)`;
    case 'location':
      return `📍 ${this.content.location.name || 'Location'}`;
    case 'activity':
      return `🎯 ${this.content.activity.title || 'Activity'}`;
    case 'reaction':
      return `${this.content.reaction.emoji} Reaction`;
    default:
      return 'Message';
  }
};

// Static method to find messages in a conversation
messageSchema.statics.findByConversation = function(conversationId, limit = 50, before = null) {
  let query = {
    conversationId: conversationId,
    isDeleted: false
  };
  
  if (before) {
    query.timestamp = { $lt: before };
  }
  
  return this.find(query)
    .populate('sender', 'profile.name profile.photos')
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to find recent messages for a user
messageSchema.statics.findRecentForUser = function(userId, limit = 20) {
  return this.find({
    $or: [
      { sender: userId },
      { 'readBy.user': userId }
    ],
    isDeleted: false
  })
  .populate('conversationId')
  .populate('sender', 'profile.name profile.photos')
  .sort({ timestamp: -1 })
  .limit(limit);
};

// Pre-save hook to update conversation's last message
messageSchema.post('save', async function() {
  try {
    const Conversation = mongoose.model('Conversation');
    const conversation = await Conversation.findById(this.conversationId);
    
    if (conversation) {
      conversation.updateLastMessage(this);
      await conversation.save();
    }
  } catch (error) {
    console.error('Error updating conversation last message:', error);
  }
});

module.exports = mongoose.model('Message', messageSchema);