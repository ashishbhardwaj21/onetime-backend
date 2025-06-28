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