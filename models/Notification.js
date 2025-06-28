const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: [
      'new_match',
      'new_message',
      'activity_suggestion',
      'profile_view',
      'super_like',
      'activity_reminder',
      'match_expiring',
      'conversation_expiring',
      'weekly_summary',
      'admin_announcement',
      'system_update'
    ],
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  body: {
    type: String,
    required: true,
    maxlength: 500
  },
  data: {
    // Additional data specific to notification type
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match'
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation'
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    url: String, // Deep link URL
    imageUrl: String,
    customData: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  channels: {
    push: {
      enabled: {
        type: Boolean,
        default: true
      },
      sent: Boolean,
      sentAt: Date,
      deliveredAt: Date,
      error: String
    },
    email: {
      enabled: {
        type: Boolean,
        default: false
      },
      sent: Boolean,
      sentAt: Date,
      deliveredAt: Date,
      openedAt: Date,
      error: String
    },
    inApp: {
      enabled: {
        type: Boolean,
        default: true
      },
      read: {
        type: Boolean,
        default: false
      },
      readAt: Date
    }
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  scheduledFor: Date, // For scheduled notifications
  expiresAt: {
    type: Date,
    default: function() {
      // Notifications expire after 30 days
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  },
  metadata: {
    campaign: String,
    source: String,
    deviceType: String,
    appVersion: String,
    retryCount: {
      type: Number,
      default: 0
    },
    lastRetryAt: Date
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, 'channels.inApp.read': 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ status: 1 });
notificationSchema.index({ scheduledFor: 1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ createdAt: -1 });

// Virtual for checking if notification is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Method to mark notification as read
notificationSchema.methods.markAsRead = function() {
  this.channels.inApp.read = true;
  this.channels.inApp.readAt = new Date();
  this.status = 'read';
};

// Method to check if notification should be sent via specific channel
notificationSchema.methods.shouldSendVia = function(channel) {
  return this.channels[channel] && this.channels[channel].enabled && !this.channels[channel].sent;
};

// Method to mark channel as sent
notificationSchema.methods.markChannelSent = function(channel, error = null) {
  if (this.channels[channel]) {
    this.channels[channel].sent = true;
    this.channels[channel].sentAt = new Date();
    if (error) {
      this.channels[channel].error = error;
    }
  }
};

// Method to mark channel as delivered
notificationSchema.methods.markChannelDelivered = function(channel) {
  if (this.channels[channel]) {
    this.channels[channel].deliveredAt = new Date();
  }
};

// Static method to find unread notifications for user
notificationSchema.statics.findUnreadForUser = function(userId) {
  return this.find({
    recipient: userId,
    'channels.inApp.read': false,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

// Static method to find notifications for user with pagination
notificationSchema.statics.findForUser = function(userId, limit = 20, offset = 0) {
  return this.find({
    recipient: userId,
    expiresAt: { $gt: new Date() }
  })
  .populate('sender', 'profile.name profile.photos')
  .sort({ createdAt: -1 })
  .skip(offset)
  .limit(limit);
};

// Static method to create and send notification
notificationSchema.statics.createAndSend = async function(notificationData) {
  const notification = new this(notificationData);
  await notification.save();
  
  // TODO: Trigger actual sending via different channels
  // This would integrate with push notification services, email services, etc.
  
  return notification;
};

// Static method to get notification statistics for user
notificationSchema.statics.getStatsForUser = function(userId) {
  return this.aggregate([
    {
      $match: { recipient: userId }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: {
          $sum: {
            $cond: ['$channels.inApp.read', 0, 1]
          }
        },
        byType: {
          $push: {
            type: '$type',
            read: '$channels.inApp.read'
          }
        }
      }
    }
  ]);
};

// Static method to clean up expired notifications
notificationSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

// Pre-save hook to set default channel settings based on notification type
notificationSchema.pre('save', function(next) {
  if (this.isNew) {
    // Set channel defaults based on notification type
    switch (this.type) {
      case 'new_match':
      case 'super_like':
        this.channels.push.enabled = true;
        this.channels.email.enabled = false;
        this.priority = 'high';
        break;
      case 'new_message':
        this.channels.push.enabled = true;
        this.channels.email.enabled = false;
        this.priority = 'normal';
        break;
      case 'weekly_summary':
        this.channels.push.enabled = false;
        this.channels.email.enabled = true;
        this.priority = 'low';
        break;
      case 'admin_announcement':
        this.channels.push.enabled = true;
        this.channels.email.enabled = true;
        this.priority = 'high';
        break;
      default:
        this.channels.push.enabled = true;
        this.channels.email.enabled = false;
        this.priority = 'normal';
    }
  }
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);