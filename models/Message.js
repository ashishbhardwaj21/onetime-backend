const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Core message info
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Message content (can be encrypted)
  content: {
    type: mongoose.Schema.Types.Mixed, // String or encrypted object
    required: true
  },
  originalContent: String, // Unencrypted for moderation history
  
  // Message type
  messageType: {
    type: String,
    enum: ['text', 'image', 'video', 'voice', 'file', 'activity', 'location', 'system'],
    default: 'text',
    index: true
  },
  
  // Reply/threading support
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  
  // Message reactions
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    emoji: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Read receipts
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Message editing
  edited: {
    type: Boolean,
    default: false
  },
  lastEditedAt: Date,
  editHistory: [{
    previousContent: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Message deletion
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  hiddenFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Encryption metadata
  encryption: {
    algorithm: String,
    encrypted: {
      type: Boolean,
      default: false
    }
  },
  
  // Content moderation
  moderationResult: {
    action: {
      type: String,
      enum: ['approved', 'flagged', 'block'],
      default: 'approved'
    },
    score: {
      type: Number,
      default: 0
    },
    violations: [String],
    autoApproved: {
      type: Boolean,
      default: true
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date
  },
  
  // Media metadata for files
  metadata: {
    fileName: String,
    fileType: String,
    fileSize: Number,
    duration: Number, // for voice/video messages
    dimensions: {
      width: Number,
      height: Number
    },
    thumbnail: String,
    fraudScore: Number,
    deviceFingerprint: String,
    originalName: String,
    deviceType: String,
    appVersion: String,
    location: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: [Number]
    }
  },
  
  // Message timing
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  deliveredAt: Date,
  
  // Message status
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  }
}, {
  timestamps: true
});

// Compound indexes for performance
messageSchema.index({ conversation: 1, timestamp: -1 });
messageSchema.index({ sender: 1, timestamp: -1 });
messageSchema.index({ messageType: 1, timestamp: -1 });
messageSchema.index({ deleted: 1, timestamp: -1 });

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
  // Remove existing reaction from this user first
  this.reactions = this.reactions.filter(r => r.user.toString() !== userId.toString());
  
  // Add new reaction
  this.reactions.push({
    user: userId,
    emoji: emoji,
    timestamp: new Date()
  });
};

// Method to remove reaction
messageSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(r => r.user.toString() !== userId.toString());
};

// Method to soft delete message for a user
messageSchema.methods.hideForUser = function(userId) {
  if (!this.hiddenFor.includes(userId)) {
    this.hiddenFor.push(userId);
  }
};

// Method to check if message is hidden for a user
messageSchema.methods.isHiddenForUser = function(userId) {
  return this.hiddenFor.includes(userId.toString()) || this.deleted;
};

// Method to get display content based on type
messageSchema.methods.getDisplayContent = function() {
  switch (this.messageType) {
    case 'text':
      return typeof this.content === 'string' ? this.content : '[Encrypted message]';
    case 'image':
      return '📷 Image';
    case 'video':
      return '🎥 Video';
    case 'voice':
      return `🎤 Voice message${this.metadata?.duration ? ` (${this.metadata.duration}s)` : ''}`;
    case 'file':
      return `📎 ${this.metadata?.fileName || 'File'}`;
    case 'location':
      return '📍 Location';
    case 'activity':
      return '🎯 Activity';
    case 'system':
      return this.content;
    default:
      return 'Message';
  }
};

// Static method to find messages in a conversation
messageSchema.statics.findByConversation = function(conversationId, options = {}) {
  const { limit = 50, before = null, userId = null } = options;
  
  let query = {
    conversation: conversationId,
    deleted: false
  };
  
  // Hide messages that user has hidden
  if (userId) {
    query.hiddenFor = { $ne: userId };
  }
  
  if (before) {
    query.timestamp = { $lt: before };
  }
  
  return this.find(query)
    .populate('sender', 'profile.name profile.photos')
    .populate('replyTo', 'content sender timestamp messageType')
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to get conversation stats
messageSchema.statics.getConversationStats = function(conversationId) {
  return this.aggregate([
    { $match: { conversation: mongoose.Types.ObjectId(conversationId), deleted: false } },
    {
      $group: {
        _id: null,
        totalMessages: { $sum: 1 },
        messageTypes: { 
          $push: '$messageType'
        },
        participants: {
          $addToSet: '$sender'
        },
        lastMessage: {
          $max: '$timestamp'
        }
      }
    },
    {
      $project: {
        totalMessages: 1,
        participantCount: { $size: '$participants' },
        lastMessage: 1,
        messageTypeBreakdown: {
          $let: {
            vars: {
              messageTypeCounts: {
                $reduce: {
                  input: '$messageTypes',
                  initialValue: {},
                  in: {
                    $mergeObjects: [
                      '$$value',
                      {
                        $arrayToObject: [[{
                          k: '$$this',
                          v: { $add: [{ $ifNull: [{ $getField: { field: '$$this', input: '$$value' } }, 0] }, 1] }
                        }]]
                      }
                    ]
                  }
                }
              }
            },
            in: '$$messageTypeCounts'
          }
        }
      }
    }
  ]);
};

// Pre-save hook to update conversation's last message
messageSchema.post('save', async function() {
  try {
    const Conversation = mongoose.model('Conversation');
    await Conversation.findByIdAndUpdate(this.conversation, {
      lastMessage: this._id,
      lastMessageAt: this.timestamp,
      $inc: { messageCount: 1 }
    });
  } catch (error) {
    console.error('Error updating conversation after message save:', error);
  }
});

// Pre-delete hook to update conversation message count
messageSchema.pre('deleteOne', { document: true }, async function() {
  try {
    const Conversation = mongoose.model('Conversation');
    await Conversation.findByIdAndUpdate(this.conversation, {
      $inc: { messageCount: -1 }
    });
  } catch (error) {
    console.error('Error updating conversation after message delete:', error);
  }
});

module.exports = mongoose.model('Message', messageSchema);