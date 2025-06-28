const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  category: {
    type: String,
    enum: ['dining', 'outdoor', 'entertainment', 'cultural', 'sports', 'social', 'virtual'],
    required: true
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
    address: {
      type: String,
      required: true,
      maxlength: 200
    },
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  priceRange: {
    type: String,
    enum: ['free', 'budget', 'moderate', 'expensive'],
    required: true
  },
  estimatedCost: {
    min: Number,
    max: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  },
  duration: {
    type: Number, // in minutes
    required: true,
    min: 30,
    max: 480
  },
  bestTimeOfDay: [{
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'night', 'anytime']
  }],
  bestDays: [{
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'weekdays', 'weekends', 'anytime']
  }],
  seasonality: [{
    type: String,
    enum: ['spring', 'summer', 'fall', 'winter', 'year-round']
  }],
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  images: [{
    url: String,
    caption: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  contact: {
    website: String,
    phone: String,
    email: String,
    socialMedia: {
      instagram: String,
      facebook: String,
      twitter: String
    }
  },
  ratings: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    review: {
      type: String,
      maxlength: 500
    },
    ratedAt: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  reports: [{
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reason: {
      type: String,
      enum: ['inappropriate', 'inaccurate', 'spam', 'closed', 'other'],
      required: true
    },
    description: String,
    reportedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'resolved'],
      default: 'pending'
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'deleted'],
    default: 'active'
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  metadata: {
    source: {
      type: String,
      enum: ['user_suggested', 'admin_created', 'api_import', 'partner'],
      default: 'user_suggested'
    },
    externalId: String, // For imported activities
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    viewCount: {
      type: Number,
      default: 0
    },
    bookmarkCount: {
      type: Number,
      default: 0
    },
    shareCount: {
      type: Number,
      default: 0
    }
  },
  accessibility: {
    wheelchairAccessible: Boolean,
    parkingAvailable: Boolean,
    publicTransportNearby: Boolean,
    additionalInfo: String
  },
  requirements: {
    ageRestriction: {
      min: Number,
      max: Number
    },
    reservationRequired: Boolean,
    advanceBooking: String, // e.g., "24 hours", "1 week"
    groupSizeLimit: {
      min: Number,
      max: Number
    }
  }
}, {
  timestamps: true
});

// Indexes
activitySchema.index({ location: '2dsphere' });
activitySchema.index({ category: 1, priceRange: 1 });
activitySchema.index({ averageRating: -1 });
activitySchema.index({ tags: 1 });
activitySchema.index({ status: 1, isApproved: 1 });
activitySchema.index({ createdBy: 1 });
activitySchema.index({ createdAt: -1 });
activitySchema.index({ 'metadata.viewCount': -1 });

// Text index for search
activitySchema.index({
  title: 'text',
  description: 'text',
  tags: 'text',
  'location.address': 'text'
});

// Virtual for primary image
activitySchema.virtual('primaryImage').get(function() {
  const primaryImg = this.images.find(img => img.isPrimary);
  return primaryImg || this.images[0] || null;
});

// Virtual for rating summary
activitySchema.virtual('ratingSummary').get(function() {
  if (this.ratings.length === 0) {
    return {
      average: 0,
      total: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
  }

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;

  this.ratings.forEach(rating => {
    distribution[rating.rating]++;
    sum += rating.rating;
  });

  return {
    average: Math.round((sum / this.ratings.length) * 10) / 10,
    total: this.ratings.length,
    distribution
  };
});

// Method to check if user has rated this activity
activitySchema.methods.hasUserRated = function(userId) {
  return this.ratings.some(rating => rating.user.toString() === userId.toString());
};

// Method to get user's rating
activitySchema.methods.getUserRating = function(userId) {
  return this.ratings.find(rating => rating.user.toString() === userId.toString());
};

// Method to add or update rating
activitySchema.methods.updateRating = function(userId, rating, review) {
  const existingRating = this.getUserRating(userId);
  
  if (existingRating) {
    existingRating.rating = rating;
    existingRating.review = review;
    existingRating.ratedAt = new Date();
  } else {
    this.ratings.push({
      user: userId,
      rating,
      review,
      ratedAt: new Date()
    });
  }
  
  this.updateAverageRating();
};

// Method to update average rating
activitySchema.methods.updateAverageRating = function() {
  if (this.ratings.length === 0) {
    this.averageRating = 0;
    this.totalRatings = 0;
    return;
  }
  
  const sum = this.ratings.reduce((total, rating) => total + rating.rating, 0);
  this.averageRating = Math.round((sum / this.ratings.length) * 10) / 10;
  this.totalRatings = this.ratings.length;
};

// Method to increment view count
activitySchema.methods.incrementViewCount = function() {
  this.metadata.viewCount += 1;
  this.metadata.lastUpdated = new Date();
};

// Method to check if activity is suitable for time/day
activitySchema.methods.isSuitableFor = function(timeOfDay, dayOfWeek) {
  const timeMatch = this.bestTimeOfDay.includes('anytime') || 
                   this.bestTimeOfDay.includes(timeOfDay);
  
  const dayMatch = this.bestDays.includes('anytime') ||
                  this.bestDays.includes(dayOfWeek) ||
                  (this.bestDays.includes('weekdays') && ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(dayOfWeek)) ||
                  (this.bestDays.includes('weekends') && ['saturday', 'sunday'].includes(dayOfWeek));
  
  return timeMatch && dayMatch;
};

// Static method to find activities by location
activitySchema.statics.findNearby = function(coordinates, maxDistance = 25000) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    },
    status: 'active',
    isApproved: true
  });
};

// Static method to find activities by category and filters
activitySchema.statics.findByFilters = function(filters) {
  const query = {
    status: 'active',
    isApproved: true
  };
  
  if (filters.category) {
    query.category = filters.category;
  }
  
  if (filters.priceRange) {
    query.priceRange = filters.priceRange;
  }
  
  if (filters.timeOfDay) {
    query.bestTimeOfDay = { $in: [filters.timeOfDay, 'anytime'] };
  }
  
  if (filters.tags && filters.tags.length > 0) {
    query.tags = { $in: filters.tags };
  }
  
  if (filters.minRating) {
    query.averageRating = { $gte: filters.minRating };
  }
  
  return this.find(query);
};

// Pre-save hook to update average rating
activitySchema.pre('save', function(next) {
  if (this.isModified('ratings')) {
    this.updateAverageRating();
  }
  next();
});

// Pre-save hook to ensure location is valid
activitySchema.pre('save', function(next) {
  if (this.location && this.location.coordinates) {
    const [lng, lat] = this.location.coordinates;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return next(new Error('Invalid coordinates'));
    }
  }
  next();
});

module.exports = mongoose.model('Activity', activitySchema);