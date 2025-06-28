const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user1Action: {
    type: String,
    enum: ['like', 'pass', 'super_like'],
    required: true
  },
  user2Action: {
    type: String,
    enum: ['like', 'pass', 'super_like', 'pending'],
    default: 'pending'
  },
  mutual: {
    type: Boolean,
    default: false
  },
  matchedAt: {
    type: Date
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Matches expire after 7 days
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  user1SeenMatch: {
    type: Boolean,
    default: false
  },
  user2SeenMatch: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'unmatched', 'deleted'],
    default: 'active'
  },
  compatibility: {
    score: {
      type: Number,
      min: 0,
      max: 100
    },
    factors: [{
      category: {
        type: String,
        enum: ['interests', 'location', 'age', 'energy_level', 'looking_for', 'activity_preferences']
      },
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      weight: {
        type: Number,
        min: 0,
        max: 1
      }
    }]
  }
}, {
  timestamps: true
});

// Indexes
matchSchema.index({ user1: 1, user2: 1 }, { unique: true });
matchSchema.index({ user1: 1, mutual: 1 });
matchSchema.index({ user2: 1, mutual: 1 });
matchSchema.index({ expiresAt: 1 });
matchSchema.index({ matchedAt: -1 });
matchSchema.index({ status: 1 });

// Ensure user1 is always the smaller ObjectId to prevent duplicates
matchSchema.pre('save', function(next) {
  if (this.user1.toString() > this.user2.toString()) {
    [this.user1, this.user2] = [this.user2, this.user1];
    [this.user1Action, this.user2Action] = [this.user2Action, this.user1Action];
    [this.user1SeenMatch, this.user2SeenMatch] = [this.user2SeenMatch, this.user1SeenMatch];
  }
  next();
});

// Check if match is mutual and set mutual flag
matchSchema.pre('save', function(next) {
  if (this.user1Action === 'like' && this.user2Action === 'like') {
    this.mutual = true;
    if (!this.matchedAt) {
      this.matchedAt = new Date();
    }
  } else {
    this.mutual = false;
    this.matchedAt = undefined;
  }
  next();
});

// Method to check if match has expired
matchSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > this.expiresAt;
};

// Method to get the other user in the match
matchSchema.methods.getOtherUser = function(userId) {
  return this.user1.toString() === userId.toString() ? this.user2 : this.user1;
};

// Method to get user's action in the match
matchSchema.methods.getUserAction = function(userId) {
  return this.user1.toString() === userId.toString() ? this.user1Action : this.user2Action;
};

// Method to set user's action in the match
matchSchema.methods.setUserAction = function(userId, action) {
  if (this.user1.toString() === userId.toString()) {
    this.user1Action = action;
  } else {
    this.user2Action = action;
  }
};

// Static method to find matches for a user
matchSchema.statics.findUserMatches = function(userId, onlyMutual = false) {
  const query = {
    $or: [
      { user1: userId },
      { user2: userId }
    ],
    status: 'active'
  };
  
  if (onlyMutual) {
    query.mutual = true;
  }
  
  return this.find(query)
    .populate('user1', 'profile.name profile.age profile.photos')
    .populate('user2', 'profile.name profile.age profile.photos')
    .sort({ matchedAt: -1, createdAt: -1 });
};

// Static method to check if users have already swiped on each other
matchSchema.statics.findExistingSwipe = function(user1Id, user2Id) {
  // Ensure consistent ordering
  const [smallerId, largerId] = [user1Id, user2Id].sort();
  
  return this.findOne({
    user1: smallerId,
    user2: largerId
  });
};

module.exports = mongoose.model('Match', matchSchema);