/**
 * Admin User Model
 * Manages administrative users with role-based permissions
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  profile: {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    avatar: String,
    department: {
      type: String,
      enum: ['engineering', 'product', 'marketing', 'support', 'operations', 'executive'],
      default: 'operations'
    },
    title: {
      type: String,
      maxlength: 100
    },
    phoneNumber: String
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'moderator', 'analyst', 'support_agent'],
    default: 'support_agent',
    required: true
  },
  permissions: [{
    resource: {
      type: String,
      required: true,
      enum: [
        'users', 'activities', 'subscriptions', 'analytics', 'content_moderation',
        'financial_reports', 'system_settings', 'admin_management', 'ml_models',
        'notifications', 'reports', 'security', 'api_keys', 'webhooks'
      ]
    },
    actions: [{
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'approve', 'reject', 'export', 'import']
    }]
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending_verification'],
    default: 'pending_verification'
  },
  security: {
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    twoFactorSecret: String,
    lastPasswordChange: {
      type: Date,
      default: Date.now
    },
    passwordResetToken: String,
    passwordResetExpires: Date,
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: Date,
    ipWhitelist: [String],
    sessionTimeout: {
      type: Number,
      default: 3600000 // 1 hour in milliseconds
    }
  },
  activity: {
    lastLogin: Date,
    lastLoginIP: String,
    loginHistory: [{
      timestamp: Date,
      ip: String,
      userAgent: String,
      success: Boolean,
      location: {
        country: String,
        city: String,
        region: String
      }
    }],
    actionLog: [{
      timestamp: {
        type: Date,
        default: Date.now
      },
      action: String,
      resource: String,
      resourceId: String,
      details: mongoose.Schema.Types.Mixed,
      ip: String
    }]
  },
  preferences: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    language: {
      type: String,
      default: 'en'
    },
    notifications: {
      email: {
        securityAlerts: { type: Boolean, default: true },
        systemUpdates: { type: Boolean, default: true },
        userReports: { type: Boolean, default: true },
        weeklyDigest: { type: Boolean, default: false }
      },
      dashboard: {
        realTimeAlerts: { type: Boolean, default: true },
        criticalIssues: { type: Boolean, default: true }
      }
    },
    dashboardLayout: {
      widgets: [String],
      defaultView: {
        type: String,
        enum: ['overview', 'users', 'analytics', 'moderation'],
        default: 'overview'
      }
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.security.twoFactorSecret;
      delete ret.security.passwordResetToken;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes
adminUserSchema.index({ email: 1 }, { unique: true });
adminUserSchema.index({ role: 1, status: 1 });
adminUserSchema.index({ 'activity.lastLogin': -1 });
adminUserSchema.index({ createdAt: -1 });

// Virtual for full name
adminUserSchema.virtual('profile.fullName').get(function() {
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

// Virtual for account locked status
adminUserSchema.virtual('security.isLocked').get(function() {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

// Pre-save middleware to hash password
adminUserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.security.lastPasswordChange = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
adminUserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

adminUserSchema.methods.hasPermission = function(resource, action) {
  // Super admin has all permissions
  if (this.role === 'super_admin') return true;
  
  const permission = this.permissions.find(p => p.resource === resource);
  return permission ? permission.actions.includes(action) : false;
};

adminUserSchema.methods.canAccessResource = function(resource) {
  if (this.role === 'super_admin') return true;
  return this.permissions.some(p => p.resource === resource);
};

adminUserSchema.methods.logAction = function(action, resource, resourceId, details, ip) {
  this.activity.actionLog.push({
    action,
    resource,
    resourceId,
    details,
    ip,
    timestamp: new Date()
  });
  
  // Keep only last 1000 actions
  if (this.activity.actionLog.length > 1000) {
    this.activity.actionLog = this.activity.actionLog.slice(-1000);
  }
  
  return this.save();
};

adminUserSchema.methods.recordLogin = function(ip, userAgent, location, success = true) {
  this.activity.loginHistory.push({
    timestamp: new Date(),
    ip,
    userAgent,
    success,
    location
  });
  
  // Keep only last 100 login records
  if (this.activity.loginHistory.length > 100) {
    this.activity.loginHistory = this.activity.loginHistory.slice(-100);
  }
  
  if (success) {
    this.activity.lastLogin = new Date();
    this.activity.lastLoginIP = ip;
    this.security.loginAttempts = 0;
    this.security.lockUntil = undefined;
  } else {
    this.security.loginAttempts += 1;
    
    // Lock account after 5 failed attempts
    if (this.security.loginAttempts >= 5) {
      this.security.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    }
  }
  
  return this.save();
};

adminUserSchema.methods.generatePasswordResetToken = function() {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.security.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.security.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  return resetToken;
};

adminUserSchema.methods.enableTwoFactor = function() {
  const speakeasy = require('speakeasy');
  const secret = speakeasy.generateSecret({
    name: 'OneTime Admin',
    issuer: 'OneTime Dating App'
  });
  
  this.security.twoFactorSecret = secret.base32;
  this.security.twoFactorEnabled = true;
  
  return {
    secret: secret.base32,
    qrCode: secret.otpauth_url
  };
};

adminUserSchema.methods.verifyTwoFactor = function(token) {
  if (!this.security.twoFactorEnabled || !this.security.twoFactorSecret) {
    return false;
  }
  
  const speakeasy = require('speakeasy');
  return speakeasy.totp.verify({
    secret: this.security.twoFactorSecret,
    encoding: 'base32',
    token,
    window: 2
  });
};

// Static methods
adminUserSchema.statics.createDefaultRoles = function() {
  return [
    {
      role: 'super_admin',
      permissions: [
        { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'activities', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'subscriptions', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'analytics', actions: ['read', 'export'] },
        { resource: 'content_moderation', actions: ['read', 'approve', 'reject'] },
        { resource: 'financial_reports', actions: ['read', 'export'] },
        { resource: 'system_settings', actions: ['read', 'update'] },
        { resource: 'admin_management', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'ml_models', actions: ['read', 'update'] },
        { resource: 'security', actions: ['read', 'update'] }
      ]
    },
    {
      role: 'admin',
      permissions: [
        { resource: 'users', actions: ['read', 'update'] },
        { resource: 'activities', actions: ['read', 'update', 'delete'] },
        { resource: 'subscriptions', actions: ['read', 'update'] },
        { resource: 'analytics', actions: ['read', 'export'] },
        { resource: 'content_moderation', actions: ['read', 'approve', 'reject'] },
        { resource: 'financial_reports', actions: ['read'] },
        { resource: 'admin_management', actions: ['read'] }
      ]
    },
    {
      role: 'moderator',
      permissions: [
        { resource: 'users', actions: ['read', 'update'] },
        { resource: 'activities', actions: ['read', 'update'] },
        { resource: 'content_moderation', actions: ['read', 'approve', 'reject'] }
      ]
    },
    {
      role: 'analyst',
      permissions: [
        { resource: 'users', actions: ['read'] },
        { resource: 'activities', actions: ['read'] },
        { resource: 'subscriptions', actions: ['read'] },
        { resource: 'analytics', actions: ['read', 'export'] }
      ]
    },
    {
      role: 'support_agent',
      permissions: [
        { resource: 'users', actions: ['read'] },
        { resource: 'activities', actions: ['read'] }
      ]
    }
  ];
};

adminUserSchema.statics.getByEmailWithPassword = function(email) {
  return this.findOne({ email }).select('+password');
};

adminUserSchema.statics.findActiveAdmins = function() {
  return this.find({ 
    status: 'active',
    isActive: true 
  }).select('-password');
};

adminUserSchema.statics.getRecentActivity = function(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        'activity.actionLog.timestamp': { $gte: since }
      }
    },
    {
      $unwind: '$activity.actionLog'
    },
    {
      $match: {
        'activity.actionLog.timestamp': { $gte: since }
      }
    },
    {
      $group: {
        _id: '$_id',
        email: { $first: '$email' },
        fullName: { $first: { $concat: ['$profile.firstName', ' ', '$profile.lastName'] } },
        role: { $first: '$role' },
        actions: { $push: '$activity.actionLog' }
      }
    },
    {
      $sort: { 'actions.timestamp': -1 }
    }
  ]);
};

module.exports = mongoose.model('AdminUser', adminUserSchema);