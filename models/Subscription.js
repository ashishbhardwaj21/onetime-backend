/**
 * Subscription Model
 * Defines subscription and billing data structures
 */

const mongoose = require('mongoose');

// Subscription tier schema
const subscriptionTierSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    enum: ['free', 'premium', 'vip']
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'usd'
  },
  interval: {
    type: String,
    enum: ['month', 'year'],
    default: 'month'
  },
  features: {
    dailyLikes: { type: mongoose.Schema.Types.Mixed }, // number or 'unlimited'
    monthlyMatches: { type: mongoose.Schema.Types.Mixed },
    photosAllowed: { type: Number },
    advancedFilters: { type: Boolean },
    seeWhoLikesYou: { type: Boolean },
    unlimitedRewinds: { type: Boolean },
    readReceipts: { type: Boolean },
    prioritySupport: { type: Boolean },
    boosts: { type: mongoose.Schema.Types.Mixed },
    superLikes: { type: mongoose.Schema.Types.Mixed },
    incognitoMode: { type: Boolean },
    passportMode: { type: Boolean },
    videoCallMinutes: { type: mongoose.Schema.Types.Mixed },
    aiInsights: { type: Boolean }
  },
  limits: {
    conversationsPerDay: { type: mongoose.Schema.Types.Mixed },
    activitiesPerWeek: { type: mongoose.Schema.Types.Mixed },
    profileViewsPerDay: { type: mongoose.Schema.Types.Mixed }
  }
});

// User subscription schema (embedded in User model)
const userSubscriptionSchema = new mongoose.Schema({
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
  trialStartDate: {
    type: Date
  },
  trialEndDate: {
    type: Date
  },
  features: {
    dailyLikes: { type: mongoose.Schema.Types.Mixed },
    monthlyMatches: { type: mongoose.Schema.Types.Mixed },
    photosAllowed: { type: Number },
    advancedFilters: { type: Boolean },
    seeWhoLikesYou: { type: Boolean },
    unlimitedRewinds: { type: Boolean },
    readReceipts: { type: Boolean },
    prioritySupport: { type: Boolean },
    boosts: { type: mongoose.Schema.Types.Mixed },
    superLikes: { type: mongoose.Schema.Types.Mixed },
    incognitoMode: { type: Boolean },
    passportMode: { type: Boolean },
    videoCallMinutes: { type: mongoose.Schema.Types.Mixed },
    aiInsights: { type: Boolean }
  },
  limits: {
    conversationsPerDay: { type: mongoose.Schema.Types.Mixed },
    activitiesPerWeek: { type: mongoose.Schema.Types.Mixed },
    profileViewsPerDay: { type: mongoose.Schema.Types.Mixed }
  },
  metadata: {
    upgradedFrom: { type: String },
    upgradedAt: { type: Date },
    promotionUsed: { type: String },
    referralSource: { type: String }
  }
});

// Billing information schema (embedded in User model)
const billingSchema = new mongoose.Schema({
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
  billingAddress: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    postal_code: String,
    country: String
  },
  invoices: [{
    invoiceId: String,
    amount: Number,
    currency: String,
    status: {
      type: String,
      enum: ['paid', 'pending', 'failed', 'refunded']
    },
    invoiceDate: Date,
    paidDate: Date,
    downloadUrl: String
  }],
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
    },
    refundedAt: Date,
    refundAmount: Number
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
    },
    subscriptionId: String
  }],
  failedPayments: [{
    attemptDate: Date,
    amount: Number,
    currency: String,
    failureReason: String,
    paymentMethodId: String,
    retryCount: {
      type: Number,
      default: 0
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
});

// Add-ons schema (embedded in User model)
const addOnsSchema = new mongoose.Schema({
  boosts: {
    total: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
    lastUsed: Date,
    activeBooost: {
      startTime: Date,
      endTime: Date,
      isActive: { type: Boolean, default: false }
    }
  },
  superLikes: {
    total: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
    lastUsed: Date,
    monthlyAllowance: { type: Number, default: 0 },
    monthlyUsed: { type: Number, default: 0 }
  },
  rewinds: {
    total: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
    lastUsed: Date,
    unlimitedUntil: Date
  },
  readReceipts: {
    enabled: { type: Boolean, default: false },
    unlimitedUntil: Date
  },
  incognitoMode: {
    enabled: { type: Boolean, default: false },
    unlimitedUntil: Date,
    sessionsRemaining: { type: Number, default: 0 }
  }
});

// Revenue analytics schema
const revenueAnalyticsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    required: true
  },
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date,
    required: true
  },
  revenue: {
    subscriptions: {
      type: Number,
      default: 0
    },
    addOns: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    }
  },
  subscriptionMetrics: {
    newSubscriptions: { type: Number, default: 0 },
    canceledSubscriptions: { type: Number, default: 0 },
    renewedSubscriptions: { type: Number, default: 0 },
    upgradedSubscriptions: { type: Number, default: 0 },
    downgradedSubscriptions: { type: Number, default: 0 }
  },
  addOnMetrics: {
    boostsPurchased: { type: Number, default: 0 },
    superLikesPurchased: { type: Number, default: 0 },
    rewindsPurchased: { type: Number, default: 0 }
  },
  churnAnalysis: {
    churnRate: { type: Number, default: 0 },
    churnReasons: [{
      reason: String,
      count: Number
    }]
  },
  conversionMetrics: {
    freeToPremium: { type: Number, default: 0 },
    premiumToVip: { type: Number, default: 0 },
    trialConversions: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Promotion schema
const promotionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed_amount', 'free_trial'],
    required: true
  },
  discountPercent: {
    type: Number,
    min: 0,
    max: 100
  },
  discountAmount: {
    type: Number,
    min: 0
  },
  freeTrialDays: {
    type: Number,
    min: 0
  },
  applicableTiers: [{
    type: String,
    enum: ['premium', 'vip']
  }],
  eligibilityCriteria: {
    newUsersOnly: { type: Boolean, default: false },
    returningUsersOnly: { type: Boolean, default: false },
    maxUsagesPerUser: { type: Number, default: 1 },
    minAccountAge: { type: Number }, // days
    maxAccountAge: { type: Number }, // days
    requiredActions: [String] // e.g., ['profile_complete', 'photo_verified']
  },
  validFrom: {
    type: Date,
    required: true
  },
  validUntil: {
    type: Date,
    required: true
  },
  usageLimit: {
    type: Number,
    default: null // null = unlimited
  },
  currentUsage: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  stripeCouponId: {
    type: String
  },
  metadata: {
    campaign: String,
    source: String,
    expectedConversions: Number,
    actualConversions: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Create models
const SubscriptionTier = mongoose.model('SubscriptionTier', subscriptionTierSchema);
const RevenueAnalytics = mongoose.model('RevenueAnalytics', revenueAnalyticsSchema);
const Promotion = mongoose.model('Promotion', promotionSchema);

module.exports = {
  SubscriptionTier,
  RevenueAnalytics,
  Promotion,
  userSubscriptionSchema,
  billingSchema,
  addOnsSchema
};