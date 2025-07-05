const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  passwordHash: {
    type: String,
    required: true,
    minlength: 6
  },
  profile: {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    age: {
      type: Number,
      required: true,
      min: 18,
      max: 100
    },
    dateOfBirth: {
      type: Date,
      required: true
    },
    gender: {
      type: String,
      required: true,
      enum: ['male', 'female', 'non-binary', 'other']
    },
    occupation: {
      type: String,
      trim: true,
      maxlength: 100
    },
    bio: {
      type: String,
      maxlength: 500,
      trim: true
    },
    phoneNumber: {
      type: String,
      sparse: true,
      unique: true,
      match: [/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number']
    },
    height: {
      type: Number, // in cm
      min: 100,
      max: 250
    },
    education: {
      type: String,
      maxlength: 100
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      },
      city: String,
      state: String,
      country: String
    },
    photos: [{
      url: {
        type: String,
        required: true
      },
      order: {
        type: Number,
        default: 0
      },
      isVerified: {
        type: Boolean,
        default: false
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    prompts: [{
      question: {
        type: String,
        required: true
      },
      answer: {
        type: String,
        required: true,
        maxlength: 300
      },
      order: {
        type: Number,
        default: 0
      }
    }],
    interests: [String],
    intentTags: [String],
    energyLevel: {
      type: String,
      enum: ['Low-Key', 'Moderate', 'Energetic'],
      default: 'Moderate'
    },
    lookingFor: {
      type: String,
      enum: ['Casual', 'Serious', 'Friends', 'Activity Partner'],
      default: 'Casual'
    },
    agePreference: {
      min: {
        type: Number,
        default: 18,
        min: 18
      },
      max: {
        type: Number,
        default: 35,
        max: 100
      }
    },
    distancePreference: {
      type: Number,
      default: 25, // km
      min: 1,
      max: 100
    },
    genderPreference: [{
      type: String,
      enum: ['male', 'female', 'non-binary', 'other']
    }]
  },
  verification: {
    email: {
      verified: {
        type: Boolean,
        default: false
      },
      verificationCode: String,
      expiresAt: Date
    },
    phone: {
      number: String,
      verified: {
        type: Boolean,
        default: false
      },
      verificationCode: String,
      expiresAt: Date
    },
    photos: {
      verified: {
        type: Boolean,
        default: false
      },
      verifiedAt: Date,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    identity: {
      verified: {
        type: Boolean,
        default: false
      },
      verifiedAt: Date,
      documentType: String
    }
  },
  // Import subscription and billing schemas
  subscription: {
    tier: {
      type: String,
      enum: ['free', 'premium', 'vip'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'canceled', 'paused', 'past_due', 'incomplete', 'trialing', 'pending'],
      default: 'active'
    },
    stripeSubscriptionId: {
      type: String,
      sparse: true
    },
    stripeCustomerId: {
      type: String,
      sparse: true
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date
    },
    currentPeriodStart: {
      type: Date
    },
    currentPeriodEnd: {
      type: Date
    },
    autoRenew: {
      type: Boolean,
      default: true
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    },
    canceledAt: {
      type: Date
    },
    pausedAt: {
      type: Date
    },
    resumedAt: {
      type: Date
    },
    resumesAt: {
      type: Date
    },
    features: {
      dailyLikes: { type: mongoose.Schema.Types.Mixed, default: 10 },
      monthlyMatches: { type: mongoose.Schema.Types.Mixed, default: 50 },
      photosAllowed: { type: Number, default: 3 },
      advancedFilters: { type: Boolean, default: false },
      seeWhoLikesYou: { type: Boolean, default: false },
      unlimitedRewinds: { type: Boolean, default: false },
      readReceipts: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      boosts: { type: mongoose.Schema.Types.Mixed, default: 0 },
      superLikes: { type: mongoose.Schema.Types.Mixed, default: 1 },
      incognitoMode: { type: Boolean, default: false },
      passportMode: { type: Boolean, default: false },
      videoCallMinutes: { type: mongoose.Schema.Types.Mixed, default: 0 },
      aiInsights: { type: Boolean, default: false }
    },
    limits: {
      conversationsPerDay: { type: mongoose.Schema.Types.Mixed, default: 5 },
      activitiesPerWeek: { type: mongoose.Schema.Types.Mixed, default: 2 },
      profileViewsPerDay: { type: mongoose.Schema.Types.Mixed, default: 20 }
    },
    metadata: {
      upgradedFrom: { type: String },
      upgradedAt: { type: Date },
      promotionUsed: { type: String },
      referralSource: { type: String }
    }
  },
  billing: {
    stripeCustomerId: {
      type: String,
      sparse: true
    },
    paymentMethodId: {
      type: String
    },
    paymentMethodType: {
      type: String,
      enum: ['card', 'apple_pay', 'google_pay', 'paypal'],
      default: 'card'
    },
    lastPaymentDate: {
      type: Date
    },
    nextBillingDate: {
      type: Date
    },
    paymentMethodUpdatedAt: {
      type: Date
    },
    purchaseHistory: [{
      type: {
        type: String,
        enum: ['subscription', 'addon', 'boost', 'super_likes', 'rewind'],
        required: true
      },
      productId: String,
      addOnId: String,
      quantity: {
        type: Number,
        default: 1
      },
      amount: {
        type: Number,
        required: true
      },
      currency: {
        type: String,
        default: 'usd'
      },
      paymentIntentId: String,
      status: {
        type: String,
        enum: ['succeeded', 'pending', 'failed', 'refunded'],
        default: 'succeeded'
      },
      purchasedAt: {
        type: Date,
        default: Date.now
      }
    }],
    promotionsUsed: [{
      promotionId: {
        type: String,
        required: true
      },
      couponId: String,
      discountPercent: Number,
      discountAmount: Number,
      usedAt: {
        type: Date,
        default: Date.now
      }
    }],
    totalSpent: {
      type: Number,
      default: 0
    },
    lifetimeValue: {
      type: Number,
      default: 0
    }
  },
  addOns: {
    boosts: {
      total: { type: Number, default: 0 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 0 },
      lastUsed: Date
    },
    superLikes: {
      total: { type: Number, default: 0 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 0 },
      lastUsed: Date,
      monthlyAllowance: { type: Number, default: 1 },
      monthlyUsed: { type: Number, default: 0 }
    },
    rewinds: {
      total: { type: Number, default: 0 },
      used: { type: Number, default: 0 },
      remaining: { type: Number, default: 0 },
      lastUsed: Date
    }
  },
  onboarding: {
    startedAt: Date,
    completedAt: Date,
    currentStep: {
      type: String,
      default: 'welcome'
    },
    completedSteps: [String],
    progress: {
      type: Number,
      default: 0
    },
    isComplete: {
      type: Boolean,
      default: false
    },
    personalityProfile: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    preferences: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    analyticsData: {
      registrationSource: String,
      deviceType: String,
      startTime: Date,
      stepsCompleted: Number,
      lastStepCompletedAt: Date
    },
    tips: [String],
    recommendations: [String]
  },
  analytics: {
    cancellationReasons: [{
      reason: String,
      timestamp: Date,
      tier: String
    }],
    conversionEvents: [{
      eventType: String,
      fromTier: String,
      toTier: String,
      timestamp: Date,
      revenue: Number
    }],
    usageStats: {
      dailyLikes: { type: Number, default: 0 },
      monthlyMatches: { type: Number, default: 0 },
      conversationsStarted: { type: Number, default: 0 },
      activitiesJoined: { type: Number, default: 0 },
      lastResetDate: { type: Date, default: Date.now }
    }
  },
  settings: {
    notifications: {
      matches: {
        type: Boolean,
        default: true
      },
      messages: {
        type: Boolean,
        default: true
      },
      activities: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      }
    },
    privacy: {
      showAge: {
        type: Boolean,
        default: true
      },
      showDistance: {
        type: Boolean,
        default: true
      },
      onlineStatus: {
        type: Boolean,
        default: false
      }
    },
    discovery: {
      enabled: {
        type: Boolean,
        default: true
      },
      maxDistance: {
        type: Number,
        default: 25
      }
    }
  },
  subscription: {
    type: {
      type: String,
      enum: ['free', 'premium', 'premium_plus'],
      default: 'free'
    },
    startDate: Date,
    endDate: Date,
    features: [String]
  },
  safety: {
    blockedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    reportedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    reports: [{
      reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      reason: {
        type: String,
        required: true,
        enum: ['inappropriate', 'spam', 'fake', 'harassment', 'other']
      },
      description: {
        type: String,
        maxlength: 500
      },
      reportedAt: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ['pending', 'reviewed', 'resolved'],
        default: 'pending'
      }
    }]
  },
  isPhoneOnlyUser: {
    type: Boolean,
    default: false
  },
  appleId: {
    type: String,
    sparse: true
  },
  isAppleUser: {
    type: Boolean,
    default: false
  },
  analytics: {
    lastActiveAt: {
      type: Date,
      default: Date.now
    },
    totalSwipes: {
      type: Number,
      default: 0
    },
    totalMatches: {
      type: Number,
      default: 0
    },
    totalMessages: {
      type: Number,
      default: 0
    },
    profileViews: {
      type: Number,
      default: 0
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted', 'pending'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Indexes (email index is already created by unique: true in schema)
userSchema.index({ 'profile.location': '2dsphere' });
userSchema.index({ 'analytics.lastActiveAt': 1 });
userSchema.index({ createdAt: 1 });
userSchema.index({ 'profile.age': 1 });
userSchema.index({ 'profile.gender': 1 });

// Pre-save hook to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Method to get public profile
userSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  delete userObject.passwordHash;
  delete userObject.verification;
  delete userObject.safety;
  delete userObject.subscription;
  delete userObject.analytics;
  return userObject;
};

// Method to get minimal profile for discovery
userSchema.methods.getDiscoveryProfile = function() {
  return {
    _id: this._id,
    profile: {
      name: this.profile.name,
      age: this.profile.age,
      occupation: this.profile.occupation,
      bio: this.profile.bio,
      photos: this.profile.photos,
      prompts: this.profile.prompts,
      interests: this.profile.interests,
      intentTags: this.profile.intentTags,
      energyLevel: this.profile.energyLevel,
      location: this.profile.location
    }
  };
};

// Static method to find users for discovery
userSchema.statics.findForDiscovery = function(userId, preferences, limit = 10) {
  const query = {
    _id: { $ne: userId },
    'settings.discovery.enabled': true,
    'profile.age': {
      $gte: preferences.agePreference.min,
      $lte: preferences.agePreference.max
    }
  };
  
  if (preferences.genderPreference && preferences.genderPreference.length > 0) {
    query['profile.gender'] = { $in: preferences.genderPreference };
  }
  
  if (preferences.location && preferences.distancePreference) {
    query['profile.location'] = {
      $near: {
        $geometry: preferences.location,
        $maxDistance: preferences.distancePreference * 1000 // Convert km to meters
      }
    };
  }
  
  return this.find(query).limit(limit);
};

module.exports = mongoose.model('User', userSchema);