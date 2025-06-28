const mongoose = require('mongoose');

const userSwipeSchema = new mongoose.Schema({
  swiper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  swiped: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: ['like', 'pass', 'super_like'],
    required: true
  },
  context: {
    source: {
      type: String,
      enum: ['discovery', 'activity', 'suggestion', 'search'],
      default: 'discovery'
    },
    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity'
    },
    location: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: [Number] // [longitude, latitude]
    }
  },
  metadata: {
    deviceType: String,
    appVersion: String,
    sessionDuration: Number, // Duration in discovery before swipe (seconds)
    profileViewTime: Number, // Time spent viewing profile (seconds)
    photosViewed: [{
      photoIndex: Number,
      viewDuration: Number
    }],
    promptsViewed: [String] // Which prompts were viewed
  }
}, {
  timestamps: true
});

// Indexes
userSwipeSchema.index({ swiper: 1, swiped: 1 }, { unique: true });
userSwipeSchema.index({ swiper: 1, action: 1 });
userSwipeSchema.index({ swiped: 1, action: 1 });
userSwipeSchema.index({ createdAt: -1 });
userSwipeSchema.index({ 'context.source': 1 });

// Ensure swiper and swiped are different users
userSwipeSchema.pre('save', function(next) {
  if (this.swiper.toString() === this.swiped.toString()) {
    return next(new Error('Cannot swipe on yourself'));
  }
  next();
});

// Static method to check if user has swiped on another user
userSwipeSchema.statics.hasUserSwiped = function(swiperId, swipedId) {
  return this.findOne({
    swiper: swiperId,
    swiped: swipedId
  });
};

// Static method to get swipe statistics for a user
userSwipeSchema.statics.getSwipeStats = function(userId) {
  return this.aggregate([
    {
      $match: { swiper: userId }
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 }
      }
    }
  ]);
};

// Static method to find mutual likes
userSwipeSchema.statics.findMutualLikes = function(userId) {
  return this.aggregate([
    {
      $match: {
        $or: [
          { swiper: userId, action: 'like' },
          { swiped: userId, action: 'like' }
        ]
      }
    },
    {
      $group: {
        _id: {
          user1: { $min: ['$swiper', '$swiped'] },
          user2: { $max: ['$swiper', '$swiped'] }
        },
        swipes: { $push: '$$ROOT' }
      }
    },
    {
      $match: {
        'swipes.1': { $exists: true }
      }
    }
  ]);
};

module.exports = mongoose.model('UserSwipe', userSwipeSchema);