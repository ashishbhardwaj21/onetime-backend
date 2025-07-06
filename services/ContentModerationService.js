/**
 * Content Moderation Service
 * Handles automated and manual content moderation for user safety
 */

const logger = require('../utils/logger');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Message = require('../models/Message');
const AdminUser = require('../models/AdminUser');

class ContentModerationService {
  constructor() {
    this.moderationRules = {
      // Prohibited content patterns
      prohibitedWords: [
        // Profanity and hate speech
        'hate', 'violence', 'abuse', 'harassment',
        // Inappropriate content (simplified for demo)
        'inappropriate', 'explicit', 'illegal'
      ],
      
      // Suspicious patterns
      suspiciousPatterns: [
        /(\d{3}[-.]?\d{3}[-.]?\d{4})/g, // Phone numbers
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, // Email addresses
        /(https?:\/\/[^\s]+)/g, // URLs
        /(\$\d+)/g, // Money amounts
        /(venmo|paypal|cashapp|zelle)/gi // Payment apps
      ],
      
      // Spam indicators
      spamIndicators: [
        /(.)\1{4,}/g, // Repeated characters
        /[A-Z]{5,}/g, // Excessive caps
        /(buy now|click here|limited time|act fast)/gi // Spam phrases
      ]
    };

    this.autoModerationThresholds = {
      suspiciousScore: 0.7,
      prohibitedScore: 0.9,
      spamScore: 0.8
    };
  }

  async moderateContent(content, contentType, userId, metadata = {}) {
    try {
      const moderationResult = {
        approved: true,
        score: 0,
        flags: [],
        action: 'approve',
        reason: null,
        requiresReview: false,
        moderatedContent: content
      };

      // Text content moderation
      if (typeof content === 'string') {
        const textAnalysis = this.analyzeText(content);
        moderationResult.score = textAnalysis.score;
        moderationResult.flags = textAnalysis.flags;

        // Apply moderation rules
        if (textAnalysis.score >= this.autoModerationThresholds.prohibitedScore) {
          moderationResult.approved = false;
          moderationResult.action = 'block';
          moderationResult.reason = 'Content violates community guidelines';
        } else if (textAnalysis.score >= this.autoModerationThresholds.suspiciousScore) {
          moderationResult.requiresReview = true;
          moderationResult.action = 'flag_for_review';
          moderationResult.reason = 'Content flagged for manual review';
        } else if (textAnalysis.score >= this.autoModerationThresholds.spamScore) {
          moderationResult.approved = false;
          moderationResult.action = 'warn';
          moderationResult.reason = 'Content appears to be spam';
        }

        // Apply content filters
        if (moderationResult.approved && textAnalysis.needsFiltering) {
          moderationResult.moderatedContent = this.filterContent(content);
        }
      }

      // Image content moderation (placeholder)
      if (contentType === 'image' && metadata.imageUrl) {
        const imageAnalysis = await this.analyzeImage(metadata.imageUrl);
        if (imageAnalysis.score > moderationResult.score) {
          moderationResult.score = imageAnalysis.score;
          moderationResult.flags.push(...imageAnalysis.flags);
        }
      }

      // User history check
      const userHistory = await this.checkUserHistory(userId);
      if (userHistory.riskScore > 0.5) {
        moderationResult.score += userHistory.riskScore * 0.3;
        moderationResult.flags.push('user_risk_factor');
      }

      // Log moderation decision
      await this.logModerationDecision(userId, contentType, moderationResult, metadata);

      return moderationResult;

    } catch (error) {
      logger.error('Content moderation error:', error);
      
      // Fail-safe: require review on error
      return {
        approved: false,
        score: 1.0,
        flags: ['moderation_error'],
        action: 'flag_for_review',
        reason: 'Moderation system error - requires manual review',
        requiresReview: true,
        moderatedContent: content
      };
    }
  }

  analyzeText(text) {
    const analysis = {
      score: 0,
      flags: [],
      needsFiltering: false
    };

    const lowerText = text.toLowerCase();

    // Check for prohibited words
    let prohibitedCount = 0;
    this.moderationRules.prohibitedWords.forEach(word => {
      if (lowerText.includes(word)) {
        prohibitedCount++;
        analysis.flags.push(`prohibited_word_${word}`);
      }
    });

    if (prohibitedCount > 0) {
      analysis.score += Math.min(prohibitedCount * 0.3, 0.9);
      analysis.needsFiltering = true;
    }

    // Check for suspicious patterns
    let suspiciousCount = 0;
    this.moderationRules.suspiciousPatterns.forEach((pattern, index) => {
      const matches = text.match(pattern);
      if (matches) {
        suspiciousCount += matches.length;
        analysis.flags.push(`suspicious_pattern_${index}`);
      }
    });

    if (suspiciousCount > 0) {
      analysis.score += Math.min(suspiciousCount * 0.2, 0.6);
    }

    // Check for spam indicators
    let spamCount = 0;
    this.moderationRules.spamIndicators.forEach((pattern, index) => {
      const matches = text.match(pattern);
      if (matches) {
        spamCount += matches.length;
        analysis.flags.push(`spam_indicator_${index}`);
      }
    });

    if (spamCount > 0) {
      analysis.score += Math.min(spamCount * 0.25, 0.8);
    }

    // Text length analysis
    if (text.length > 1000) {
      analysis.score += 0.1;
      analysis.flags.push('excessive_length');
    }

    // Repeated content check (simplified)
    const uniqueWords = new Set(text.toLowerCase().split(/\s+/));
    const repetitionRatio = 1 - (uniqueWords.size / text.split(/\s+/).length);
    if (repetitionRatio > 0.7) {
      analysis.score += 0.3;
      analysis.flags.push('repetitive_content');
    }

    return analysis;
  }

  async analyzeImage(imageUrl) {
    // Placeholder for image moderation
    // In a real implementation, this would use services like:
    // - Google Cloud Vision API
    // - Amazon Rekognition
    // - Microsoft Azure Computer Vision
    
    return {
      score: 0,
      flags: [],
      analysis: {
        safeSearch: {
          adult: 'VERY_UNLIKELY',
          violence: 'VERY_UNLIKELY',
          racy: 'VERY_UNLIKELY'
        }
      }
    };
  }

  async checkUserHistory(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { riskScore: 0.5, factors: ['user_not_found'] };
      }

      let riskScore = 0;
      const factors = [];

      // Check account age
      const accountAge = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (accountAge < 1) {
        riskScore += 0.3;
        factors.push('new_account');
      }

      // Check verification status
      if (!user.verification?.isVerified) {
        riskScore += 0.2;
        factors.push('unverified_account');
      }

      // Check previous reports
      const reportCount = user.safety?.reports?.length || 0;
      if (reportCount > 0) {
        riskScore += Math.min(reportCount * 0.2, 0.6);
        factors.push('previous_reports');
      }

      // Check moderation history
      const moderationHistory = user.safety?.moderationHistory?.length || 0;
      if (moderationHistory > 0) {
        riskScore += Math.min(moderationHistory * 0.15, 0.5);
        factors.push('moderation_history');
      }

      return {
        riskScore: Math.min(riskScore, 1.0),
        factors
      };

    } catch (error) {
      logger.error('Error checking user history:', error);
      return { riskScore: 0.5, factors: ['history_check_error'] };
    }
  }

  filterContent(content) {
    let filteredContent = content;

    // Replace prohibited words with asterisks
    this.moderationRules.prohibitedWords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      filteredContent = filteredContent.replace(regex, '*'.repeat(word.length));
    });

    // Remove or mask suspicious patterns
    this.moderationRules.suspiciousPatterns.forEach(pattern => {
      filteredContent = filteredContent.replace(pattern, '[FILTERED]');
    });

    return filteredContent;
  }

  async logModerationDecision(userId, contentType, decision, metadata) {
    try {
      logger.info('Content moderation decision', {
        userId,
        contentType,
        decision: {
          approved: decision.approved,
          score: decision.score,
          action: decision.action,
          flags: decision.flags
        },
        metadata,
        timestamp: new Date()
      });

      // Update user's moderation stats if needed
      if (!decision.approved || decision.requiresReview) {
        await this.updateUserModerationStats(userId, decision);
      }

    } catch (error) {
      logger.error('Error logging moderation decision:', error);
    }
  }

  async updateUserModerationStats(userId, decision) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      // Initialize safety object if it doesn't exist
      if (!user.safety) {
        user.safety = {
          moderationHistory: [],
          flaggedContent: 0,
          warningsIssued: 0
        };
      }

      // Add to moderation history
      user.safety.moderationHistory.push({
        action: decision.action,
        reason: decision.reason,
        score: decision.score,
        flags: decision.flags,
        timestamp: new Date()
      });

      // Update counters
      if (decision.action === 'block' || decision.action === 'flag_for_review') {
        user.safety.flaggedContent = (user.safety.flaggedContent || 0) + 1;
      }
      
      if (decision.action === 'warn') {
        user.safety.warningsIssued = (user.safety.warningsIssued || 0) + 1;
      }

      // Auto-suspend users with too many violations
      if (user.safety.flaggedContent >= 5 || user.safety.warningsIssued >= 10) {
        user.status = 'suspended';
        user.safety.suspendedAt = new Date();
        user.safety.suspensionReason = 'Multiple content policy violations';
        
        logger.warn('User auto-suspended for policy violations', {
          userId,
          flaggedContent: user.safety.flaggedContent,
          warnings: user.safety.warningsIssued
        });
      }

      await user.save();

    } catch (error) {
      logger.error('Error updating user moderation stats:', error);
    }
  }

  async reportContent(reportData) {
    try {
      const {
        reporterId,
        targetId,
        targetType, // 'user', 'activity', 'message'
        reason,
        category,
        description,
        evidence
      } = reportData;

      // Validate report data
      if (!reporterId || !targetId || !targetType || !reason) {
        throw new Error('Missing required report data');
      }

      const report = {
        reportedBy: reporterId,
        reason,
        category,
        description,
        evidence,
        reportedAt: new Date(),
        status: 'pending',
        priority: this.calculateReportPriority(category, reason)
      };

      // Add report to target entity
      let target;
      switch (targetType) {
        case 'user':
          target = await User.findById(targetId);
          if (target) {
            if (!target.safety) target.safety = {};
            if (!target.safety.reports) target.safety.reports = [];
            target.safety.reports.push(report);
            await target.save();
          }
          break;

        case 'activity':
          target = await Activity.findById(targetId);
          if (target) {
            if (!target.reports) target.reports = [];
            target.reports.push(report);
            await target.save();
          }
          break;

        case 'message':
          target = await Message.findById(targetId);
          if (target) {
            if (!target.reports) target.reports = [];
            target.reports.push(report);
            await target.save();
          }
          break;
      }

      // Log the report
      logger.info('Content reported', {
        reporterId,
        targetId,
        targetType,
        reason,
        category,
        priority: report.priority
      });

      // Auto-moderate if high priority
      if (report.priority === 'high') {
        await this.autoModerateReport(targetId, targetType, report);
      }

      return {
        success: true,
        reportId: report._id || `${targetType}_${targetId}_${Date.now()}`,
        status: report.status,
        message: 'Report submitted successfully'
      };

    } catch (error) {
      logger.error('Error processing content report:', error);
      throw error;
    }
  }

  calculateReportPriority(category, reason) {
    const highPriorityCategories = ['harassment', 'hate_speech', 'violence', 'illegal_content'];
    const highPriorityReasons = ['safety_concern', 'immediate_threat', 'child_safety'];

    if (highPriorityCategories.includes(category) || highPriorityReasons.includes(reason)) {
      return 'high';
    }

    const mediumPriorityCategories = ['spam', 'inappropriate_content', 'impersonation'];
    if (mediumPriorityCategories.includes(category)) {
      return 'medium';
    }

    return 'low';
  }

  async autoModerateReport(targetId, targetType, report) {
    try {
      // Auto-moderate high-priority reports
      if (report.priority === 'high') {
        switch (targetType) {
          case 'user':
            const user = await User.findById(targetId);
            if (user && user.status === 'active') {
              user.status = 'suspended';
              user.safety.autoSuspendedAt = new Date();
              user.safety.autoSuspensionReason = `High priority report: ${report.reason}`;
              await user.save();
              
              logger.warn('User auto-suspended due to high priority report', {
                userId: targetId,
                reason: report.reason,
                category: report.category
              });
            }
            break;

          case 'activity':
            const activity = await Activity.findById(targetId);
            if (activity && activity.status === 'active') {
              activity.status = 'inactive';
              activity.moderationNote = `Auto-disabled due to report: ${report.reason}`;
              await activity.save();
              
              logger.warn('Activity auto-disabled due to high priority report', {
                activityId: targetId,
                reason: report.reason
              });
            }
            break;
        }
      }

    } catch (error) {
      logger.error('Error in auto-moderation:', error);
    }
  }

  async getModerationQueue(filters = {}) {
    try {
      const {
        status = 'pending',
        priority,
        contentType,
        limit = 50,
        offset = 0
      } = filters;

      const reports = [];

      // Get user reports
      if (!contentType || contentType === 'user') {
        const userReports = await User.find({
          'safety.reports': {
            $elemMatch: {
              status,
              ...(priority && { priority })
            }
          }
        })
        .populate('safety.reports.reportedBy', 'profile.name email')
        .select('email profile safety.reports')
        .limit(limit)
        .skip(offset);

        userReports.forEach(user => {
          user.safety.reports
            .filter(r => r.status === status && (!priority || r.priority === priority))
            .forEach(report => {
              reports.push({
                type: 'user',
                targetId: user._id,
                target: {
                  email: user.email,
                  name: user.profile?.name
                },
                report
              });
            });
        });
      }

      // Get activity reports
      if (!contentType || contentType === 'activity') {
        const activityReports = await Activity.find({
          'reports': {
            $elemMatch: {
              status,
              ...(priority && { priority })
            }
          }
        })
        .populate('reports.reportedBy', 'profile.name email')
        .populate('organizer', 'profile.name email')
        .select('title category reports organizer')
        .limit(limit)
        .skip(offset);

        activityReports.forEach(activity => {
          activity.reports
            .filter(r => r.status === status && (!priority || r.priority === priority))
            .forEach(report => {
              reports.push({
                type: 'activity',
                targetId: activity._id,
                target: {
                  title: activity.title,
                  category: activity.category,
                  organizer: activity.organizer
                },
                report
              });
            });
        });
      }

      // Sort by priority and date
      reports.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.report.priority] || 0;
        const bPriority = priorityOrder[b.report.priority] || 0;
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority; // High priority first
        }
        
        return new Date(a.report.reportedAt) - new Date(b.report.reportedAt); // Older first
      });

      return {
        reports: reports.slice(0, limit),
        total: reports.length,
        hasMore: reports.length > limit
      };

    } catch (error) {
      logger.error('Error getting moderation queue:', error);
      throw error;
    }
  }

  async processReport(reportId, action, moderatorId, reason) {
    try {
      const validActions = ['approve', 'reject', 'escalate', 'suspend_user', 'remove_content'];
      if (!validActions.includes(action)) {
        throw new Error('Invalid moderation action');
      }

      // Find and update the report
      // This is simplified - in a real implementation, you'd need to find the specific report
      // across different models and update it appropriately

      const moderationAction = {
        action,
        moderator: moderatorId,
        reason,
        processedAt: new Date()
      };

      logger.info('Report processed by moderator', {
        reportId,
        action,
        moderatorId,
        reason
      });

      return {
        success: true,
        action: moderationAction,
        message: `Report ${action}ed successfully`
      };

    } catch (error) {
      logger.error('Error processing report:', error);
      throw error;
    }
  }

  async getModerationStats(timeframe = '7d') {
    try {
      const endDate = new Date();
      let startDate;

      switch (timeframe) {
        case '24h':
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }

      const [
        totalReports,
        pendingReports,
        autoModerationCount,
        suspendedUsers,
        removedContent
      ] = await Promise.all([
        this.countReports(startDate, endDate),
        this.countReports(startDate, endDate, { status: 'pending' }),
        this.countAutoModerationActions(startDate, endDate),
        User.countDocuments({
          status: 'suspended',
          'safety.suspendedAt': { $gte: startDate, $lte: endDate }
        }),
        Activity.countDocuments({
          status: 'inactive',
          updatedAt: { $gte: startDate, $lte: endDate },
          moderationNote: { $exists: true }
        })
      ]);

      return {
        timeframe,
        period: { start: startDate, end: endDate },
        stats: {
          totalReports,
          pendingReports,
          processedReports: totalReports - pendingReports,
          autoModerationCount,
          suspendedUsers,
          removedContent,
          averageResponseTime: await this.calculateAverageResponseTime(startDate, endDate)
        }
      };

    } catch (error) {
      logger.error('Error getting moderation stats:', error);
      throw error;
    }
  }

  async countReports(startDate, endDate, filters = {}) {
    // Simplified count - would need to aggregate across all models in real implementation
    const userReports = await User.countDocuments({
      'safety.reports': {
        $elemMatch: {
          reportedAt: { $gte: startDate, $lte: endDate },
          ...filters
        }
      }
    });

    const activityReports = await Activity.countDocuments({
      'reports': {
        $elemMatch: {
          reportedAt: { $gte: startDate, $lte: endDate },
          ...filters
        }
      }
    });

    return userReports + activityReports;
  }

  async countAutoModerationActions(startDate, endDate) {
    // Count auto-suspensions and auto-removals
    const autoSuspensions = await User.countDocuments({
      'safety.autoSuspendedAt': { $gte: startDate, $lte: endDate }
    });

    const autoRemovals = await Activity.countDocuments({
      status: 'inactive',
      updatedAt: { $gte: startDate, $lte: endDate },
      moderationNote: { $regex: /auto/i }
    });

    return autoSuspensions + autoRemovals;
  }

  async calculateAverageResponseTime(startDate, endDate) {
    // Simplified calculation - would need more complex aggregation in real implementation
    return 4.5; // hours (placeholder)
  }
}

module.exports = new ContentModerationService();