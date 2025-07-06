/**
 * Interaction Model
 * Tracks user interactions for recommendation engine learning
 */

const mongoose = require('mongoose');

const interactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  targetActivityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Activity',
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      // User interactions
      'like',
      'pass',
      'super_like',
      'save',
      'view_profile',
      'message_sent',
      'message_received',
      'match',
      'unmatch',
      'block',
      'report',
      
      // Activity interactions
      'activity_view',
      'activity_join',
      'activity_leave',
      'activity_save',
      'activity_share',
      
      // Recommendation interactions
      'recommendation_shown',
      'recommendation_clicked',
      'recommendation_dismissed',
      
      // Search interactions
      'search_performed',
      'filter_applied',
      
      // General engagement
      'app_open',
      'session_start',
      'session_end',
      'feature_used'
    ],
    index: true
  },
  context: {
    // Additional context about the interaction
    source: {
      type: String,
      enum: ['recommendation', 'search', 'discovery', 'activity', 'chat', 'profile'],
      default: 'discovery'
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere'
      }
    },
    deviceType: {
      type: String,
      enum: ['mobile', 'desktop', 'tablet']
    },
    platform: {
      type: String,
      enum: ['ios', 'android', 'web']
    },
    sessionId: String,
    previousInteraction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interaction'
    }
  },
  metadata: {
    // Flexible field for additional interaction data
    score: Number, // For recommendations
    confidence: Number,
    duration: Number, // Time spent on interaction (seconds)
    swipeDirection: {
      type: String,
      enum: ['left', 'right', 'up', 'down']
    },
    searchQuery: String,
    filters: mongoose.Schema.Types.Mixed,
    featureName: String,
    errorOccurred: Boolean,
    errorMessage: String,
    responseTime: Number, // API response time in ms
    batchId: String, // For batch recommendations
    position: Number, // Position in recommendation list
    viewTime: Number, // Time spent viewing (seconds)
    scrollDepth: Number // Percentage of content scrolled
  },
  outcome: {
    // Result of the interaction
    success: {
      type: Boolean,
      default: true
    },
    conversion: {
      type: Boolean,
      default: false
    },
    conversionType: {
      type: String,
      enum: ['match', 'message', 'activity_join', 'subscription', 'photo_upload']
    },
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String,
      categories: [String] // e.g., ['helpful', 'relevant', 'interesting']
    }
  },
  timing: {
    startTime: {
      type: Date,
      default: Date.now
    },
    endTime: Date,
    duration: Number, // Calculated duration in seconds
    timeOfDay: {
      type: String,
      enum: ['morning', 'afternoon', 'evening', 'night']
    },
    dayOfWeek: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }
  },
  // Machine learning features
  features: {
    userFeatures: mongoose.Schema.Types.Mixed,
    targetFeatures: mongoose.Schema.Types.Mixed,
    contextFeatures: mongoose.Schema.Types.Mixed,
    similarityScore: Number,
    noveltyScore: Number,
    diversityScore: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
interactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
interactionSchema.index({ targetUserId: 1, type: 1, createdAt: -1 });
interactionSchema.index({ userId: 1, targetUserId: 1, type: 1 });
interactionSchema.index({ 'context.sessionId': 1, createdAt: 1 });
interactionSchema.index({ type: 1, createdAt: -1 });
interactionSchema.index({ 'outcome.conversion': 1, type: 1 });
interactionSchema.index({ 'timing.timeOfDay': 1, 'timing.dayOfWeek': 1 });

// Compound indexes for analytics
interactionSchema.index({ 
  userId: 1, 
  type: 1, 
  'timing.dayOfWeek': 1, 
  'timing.timeOfDay': 1 
});

interactionSchema.index({
  'context.source': 1,
  type: 1,
  'outcome.conversion': 1,
  createdAt: -1
});

// Virtual for calculating duration
interactionSchema.virtual('calculatedDuration').get(function() {
  if (this.timing.endTime && this.timing.startTime) {
    return Math.round((this.timing.endTime - this.timing.startTime) / 1000);
  }
  return null;
});

// Pre-save middleware to calculate derived fields
interactionSchema.pre('save', function(next) {
  // Set time of day
  const hour = this.timing.startTime.getHours();
  if (hour >= 6 && hour < 12) {
    this.timing.timeOfDay = 'morning';
  } else if (hour >= 12 && hour < 17) {
    this.timing.timeOfDay = 'afternoon';
  } else if (hour >= 17 && hour < 22) {
    this.timing.timeOfDay = 'evening';
  } else {
    this.timing.timeOfDay = 'night';
  }

  // Set day of week
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  this.timing.dayOfWeek = days[this.timing.startTime.getDay()];

  // Calculate duration if endTime is set
  if (this.timing.endTime && this.timing.startTime) {
    this.timing.duration = Math.round((this.timing.endTime - this.timing.startTime) / 1000);
  }

  next();
});

// Static methods for analytics
interactionSchema.statics.getInteractionStats = async function(userId, timeframe = 'week') {
  const startDate = new Date();
  switch (timeframe) {
    case 'day':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
  }

  const stats = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        avgDuration: { $avg: '$timing.duration' },
        conversionRate: {
          $avg: {
            $cond: ['$outcome.conversion', 1, 0]
          }
        }
      }
    }
  ]);

  return stats;
};

interactionSchema.statics.getUserBehaviorPattern = async function(userId) {
  const pattern = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId)
      }
    },
    {
      $group: {
        _id: {
          timeOfDay: '$timing.timeOfDay',
          dayOfWeek: '$timing.dayOfWeek'
        },
        count: { $sum: 1 },
        types: { $addToSet: '$type' },
        avgDuration: { $avg: '$timing.duration' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  return pattern;
};

interactionSchema.statics.getConversionFunnel = async function(userId, startDate, endDate) {
  const funnel = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        conversions: {
          $sum: {
            $cond: ['$outcome.conversion', 1, 0]
          }
        }
      }
    },
    {
      $project: {
        type: '$_id',
        total: 1,
        conversions: 1,
        conversionRate: {
          $divide: ['$conversions', '$total']
        }
      }
    }
  ]);

  return funnel;
};

// Instance methods
interactionSchema.methods.recordConversion = function(conversionType) {
  this.outcome.conversion = true;
  this.outcome.conversionType = conversionType;
  this.timing.endTime = new Date();
  return this.save();
};

interactionSchema.methods.addFeedback = function(rating, comment, categories = []) {
  this.outcome.feedback = {
    rating,
    comment,
    categories
  };
  return this.save();
};

// Export model
module.exports = mongoose.model('Interaction', interactionSchema);