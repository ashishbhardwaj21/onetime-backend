/**
 * Automated Content Moderation System
 * 
 * Features:
 * - Text content filtering (profanity, harassment, spam)
 * - Image content analysis and moderation
 * - User behavior pattern detection
 * - Automatic actions (warnings, suspensions, bans)
 * - Human moderator escalation
 * - Appeal system integration
 * - Real-time content scanning
 * - Machine learning-based detection
 */

const User = require('../models/User');
const Message = require('../models/Message');

class ContentModerationSystem {
  constructor() {
    // Profanity and inappropriate content filters
    this.profanityFilter = [
      // Basic profanity list (would be much more comprehensive in production)
      'damn', 'hell', 'stupid', 'idiot', 'hate', 'kill', 'die',
      // Add more comprehensive list from external service
    ];

    // Harassment and bullying patterns
    this.harassmentPatterns = [
      /you\s+(are|look)\s+(ugly|fat|stupid|disgusting)/i,
      /go\s+(kill|hurt)\s+yourself/i,
      /nobody\s+likes\s+you/i,
      /you\s+should\s+(die|disappear)/i,
      /worthless\s+(piece\s+of\s+)?trash/i
    ];

    // Spam detection patterns
    this.spamPatterns = [
      /buy\s+now/i,
      /click\s+here/i,
      /free\s+money/i,
      /get\s+rich\s+quick/i,
      /www\./i,
      /https?:\/\//i,
      /\$\d+/i,
      /call\s+me\s+at/i,
      /text\s+me\s+at/i
    ];

    // Inappropriate content categories
    this.inappropriateCategories = [
      'sexual_content',
      'violence',
      'harassment',
      'hate_speech',
      'spam',
      'self_harm',
      'illegal_activity',
      'personal_information'
    ];

    // Moderation thresholds
    this.thresholds = {
      profanity: 0.3,
      harassment: 0.1,
      spam: 0.2,
      inappropriate: 0.15
    };

    // User behavior tracking
    this.userBehaviorTracking = new Map();
    
    // Cleanup old behavior data every hour
    setInterval(() => this.cleanupBehaviorData(), 60 * 60 * 1000);
  }

  /**
   * Moderate text content (messages, bios, etc.)
   * @param {string} content - Text content to moderate
   * @param {string} userId - User ID who created the content
   * @param {string} contentType - Type of content (message, bio, etc.)
   * @returns {Object} Moderation result
   */
  async moderateTextContent(content, userId, contentType = 'message') {
    try {
      console.log(`🔍 Moderating ${contentType} from user: ${userId}`);

      const moderationResult = {
        content,
        userId,
        contentType,
        violations: [],
        score: 0,
        action: 'approved',
        confidence: 0,
        timestamp: new Date()
      };

      // Check for profanity
      const profanityCheck = this.checkProfanity(content);
      if (profanityCheck.detected) {
        moderationResult.violations.push({
          type: 'profanity',
          severity: profanityCheck.severity,
          matches: profanityCheck.matches,
          score: profanityCheck.score
        });
        moderationResult.score += profanityCheck.score;
      }

      // Check for harassment
      const harassmentCheck = this.checkHarassment(content);
      if (harassmentCheck.detected) {
        moderationResult.violations.push({
          type: 'harassment',
          severity: harassmentCheck.severity,
          pattern: harassmentCheck.pattern,
          score: harassmentCheck.score
        });
        moderationResult.score += harassmentCheck.score;
      }

      // Check for spam
      const spamCheck = this.checkSpam(content);
      if (spamCheck.detected) {
        moderationResult.violations.push({
          type: 'spam',
          severity: spamCheck.severity,
          indicators: spamCheck.indicators,
          score: spamCheck.score
        });
        moderationResult.score += spamCheck.score;
      }

      // Check for personal information
      const piiCheck = this.checkPersonalInformation(content);
      if (piiCheck.detected) {
        moderationResult.violations.push({
          type: 'personal_information',
          severity: piiCheck.severity,
          types: piiCheck.types,
          score: piiCheck.score
        });
        moderationResult.score += piiCheck.score;
      }

      // Determine action based on score and violations
      moderationResult.action = this.determineAction(moderationResult);
      moderationResult.confidence = this.calculateConfidence(moderationResult);

      // Update user behavior tracking
      this.updateUserBehavior(userId, moderationResult);

      // Execute moderation action
      await this.executeModerationAction(userId, moderationResult);

      console.log(`✅ Moderation complete - Action: ${moderationResult.action}`);
      return moderationResult;

    } catch (error) {
      console.error('❌ Content moderation error:', error);
      throw error;
    }
  }

  /**
   * Moderate image content
   * @param {string} imageUrl - URL of the image to moderate
   * @param {string} userId - User ID who uploaded the image
   * @returns {Object} Image moderation result
   */
  async moderateImageContent(imageUrl, userId) {
    try {
      console.log(`🖼️ Moderating image from user: ${userId}`);

      // In production, this would integrate with services like:
      // - Google Cloud Vision API
      // - AWS Rekognition
      // - Microsoft Content Moderator
      // - Custom ML models

      const moderationResult = {
        imageUrl,
        userId,
        contentType: 'image',
        violations: [],
        score: 0,
        action: 'approved',
        confidence: 0.8,
        timestamp: new Date(),
        analysis: {
          adult_content: 0.1,
          violence: 0.05,
          inappropriate: 0.1,
          faces_detected: 1,
          text_detected: false
        }
      };

      // Simulate image analysis (replace with actual API calls)
      const imageAnalysis = await this.analyzeImageContent(imageUrl);
      moderationResult.analysis = imageAnalysis;

      // Check for violations based on analysis
      if (imageAnalysis.adult_content > 0.5) {
        moderationResult.violations.push({
          type: 'adult_content',
          severity: 'high',
          score: imageAnalysis.adult_content
        });
        moderationResult.score += imageAnalysis.adult_content;
      }

      if (imageAnalysis.violence > 0.3) {
        moderationResult.violations.push({
          type: 'violence',
          severity: 'medium',
          score: imageAnalysis.violence
        });
        moderationResult.score += imageAnalysis.violence;
      }

      // Check for multiple faces (dating app specific)
      if (imageAnalysis.faces_detected > 1) {
        moderationResult.violations.push({
          type: 'multiple_faces',
          severity: 'low',
          score: 0.2
        });
        moderationResult.score += 0.2;
      }

      // Check for no faces detected
      if (imageAnalysis.faces_detected === 0) {
        moderationResult.violations.push({
          type: 'no_face',
          severity: 'medium',
          score: 0.3
        });
        moderationResult.score += 0.3;
      }

      moderationResult.action = this.determineAction(moderationResult);
      
      // Update user behavior
      this.updateUserBehavior(userId, moderationResult);

      // Execute action
      await this.executeModerationAction(userId, moderationResult);

      console.log(`✅ Image moderation complete - Action: ${moderationResult.action}`);
      return moderationResult;

    } catch (error) {
      console.error('❌ Image moderation error:', error);
      throw error;
    }
  }

  /**
   * Check user behavior patterns for suspicious activity
   * @param {string} userId - User ID to analyze
   * @returns {Object} Behavior analysis result
   */
  async analyzeBehaviorPatterns(userId) {
    try {
      const userBehavior = this.userBehaviorTracking.get(userId) || {
        violations: [],
        actions: [],
        patterns: {}
      };

      const analysis = {
        userId,
        riskLevel: 'low',
        patterns: [],
        recommendations: [],
        score: 0
      };

      // Check violation frequency
      const recentViolations = userBehavior.violations.filter(v => 
        Date.now() - v.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
      );

      if (recentViolations.length >= 3) {
        analysis.patterns.push('frequent_violations');
        analysis.score += 0.4;
      }

      // Check messaging patterns (rapid messaging, copy-paste)
      const messagingPatterns = await this.analyzeMessagingPatterns(userId);
      if (messagingPatterns.suspicious) {
        analysis.patterns.push('suspicious_messaging');
        analysis.score += messagingPatterns.score;
      }

      // Check profile changes
      const profileChanges = await this.analyzeProfileChanges(userId);
      if (profileChanges.frequent) {
        analysis.patterns.push('frequent_profile_changes');
        analysis.score += 0.2;
      }

      // Determine risk level
      if (analysis.score >= 0.7) {
        analysis.riskLevel = 'high';
        analysis.recommendations.push('Consider account suspension');
      } else if (analysis.score >= 0.4) {
        analysis.riskLevel = 'medium';
        analysis.recommendations.push('Monitor closely');
      }

      return analysis;

    } catch (error) {
      console.error('Behavior analysis error:', error);
      return { userId, riskLevel: 'low', patterns: [], score: 0 };
    }
  }

  /**
   * Report content for human review
   * @param {string} contentId - ID of the content to report
   * @param {string} reporterId - User ID who made the report
   * @param {string} reason - Reason for the report
   * @param {Object} details - Additional details
   * @returns {Object} Report result
   */
  async reportContent(contentId, reporterId, reason, details = {}) {
    try {
      const report = {
        contentId,
        reporterId,
        reason,
        details,
        timestamp: new Date(),
        status: 'pending',
        priority: this.calculateReportPriority(reason, details)
      };

      // Auto-moderate based on report
      const autoModeration = await this.autoModerateReport(report);
      
      if (autoModeration.action !== 'approve') {
        report.status = 'auto_resolved';
        report.action = autoModeration.action;
      } else {
        // Queue for human review
        report.status = 'queued_for_review';
      }

      // Store report (in production, this would go to a reports database)
      console.log(`📋 Content report created: ${JSON.stringify(report)}`);

      return {
        reportId: `report_${Date.now()}`,
        status: report.status,
        action: report.action || 'queued',
        estimatedReviewTime: this.estimateReviewTime(report.priority)
      };

    } catch (error) {
      console.error('Content reporting error:', error);
      throw error;
    }
  }

  // Content checking methods

  checkProfanity(content) {
    const words = content.toLowerCase().split(/\s+/);
    const matches = words.filter(word => 
      this.profanityFilter.some(profanity => word.includes(profanity))
    );

    if (matches.length === 0) {
      return { detected: false, score: 0 };
    }

    const score = Math.min(1, matches.length / words.length * 2);
    const severity = score > 0.5 ? 'high' : score > 0.2 ? 'medium' : 'low';

    return {
      detected: true,
      matches,
      score,
      severity
    };
  }

  checkHarassment(content) {
    for (const pattern of this.harassmentPatterns) {
      if (pattern.test(content)) {
        return {
          detected: true,
          pattern: pattern.source,
          score: 0.8,
          severity: 'high'
        };
      }
    }

    // Check for aggressive language patterns
    const aggressiveWords = ['hate', 'disgusting', 'pathetic', 'loser'];
    const aggressiveCount = aggressiveWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;

    if (aggressiveCount >= 2) {
      return {
        detected: true,
        pattern: 'aggressive_language',
        score: 0.4,
        severity: 'medium'
      };
    }

    return { detected: false, score: 0 };
  }

  checkSpam(content) {
    const matches = this.spamPatterns.filter(pattern => pattern.test(content));
    
    if (matches.length === 0) {
      return { detected: false, score: 0 };
    }

    // Additional spam indicators
    const indicators = [];
    if (content.includes('$')) indicators.push('money_mention');
    if (content.match(/\d{10,}/)) indicators.push('phone_number');
    if (content.includes('@')) indicators.push('email_address');
    if (content.match(/[A-Z]{3,}/)) indicators.push('excessive_caps');

    const score = Math.min(1, (matches.length + indicators.length) * 0.2);
    const severity = score > 0.6 ? 'high' : score > 0.3 ? 'medium' : 'low';

    return {
      detected: true,
      indicators,
      score,
      severity
    };
  }

  checkPersonalInformation(content) {
    const piiTypes = [];
    let score = 0;

    // Phone number patterns
    if (content.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/)) {
      piiTypes.push('phone_number');
      score += 0.3;
    }

    // Email patterns
    if (content.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)) {
      piiTypes.push('email_address');
      score += 0.2;
    }

    // Social media handles
    if (content.match(/@[A-Za-z0-9_]+/)) {
      piiTypes.push('social_handle');
      score += 0.1;
    }

    // Address patterns (simplified)
    if (content.match(/\d+\s+[A-Za-z\s]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard)/i)) {
      piiTypes.push('address');
      score += 0.4;
    }

    if (piiTypes.length === 0) {
      return { detected: false, score: 0 };
    }

    return {
      detected: true,
      types: piiTypes,
      score,
      severity: score > 0.3 ? 'high' : 'medium'
    };
  }

  // Action determination and execution

  determineAction(moderationResult) {
    const { score, violations } = moderationResult;

    // High-severity violations
    const highSeverityViolations = violations.filter(v => v.severity === 'high');
    if (highSeverityViolations.length > 0) {
      return 'block';
    }

    // Score-based decisions
    if (score >= 0.8) return 'block';
    if (score >= 0.5) return 'flag_for_review';
    if (score >= 0.3) return 'warn';
    if (score >= 0.1) return 'soft_warn';

    return 'approved';
  }

  calculateConfidence(moderationResult) {
    const { violations, score } = moderationResult;
    
    let confidence = 0.5; // Base confidence
    
    // Higher confidence for clear violations
    if (violations.some(v => v.type === 'harassment')) confidence += 0.3;
    if (violations.some(v => v.type === 'personal_information')) confidence += 0.2;
    if (score > 0.7) confidence += 0.2;
    
    return Math.min(1, confidence);
  }

  async executeModerationAction(userId, moderationResult) {
    const { action, contentType, violations } = moderationResult;

    try {
      switch (action) {
        case 'block':
          await this.blockContent(userId, moderationResult);
          await this.notifyUser(userId, 'content_blocked', violations);
          break;
          
        case 'flag_for_review':
          await this.flagForReview(userId, moderationResult);
          break;
          
        case 'warn':
          await this.issueWarning(userId, moderationResult);
          await this.notifyUser(userId, 'content_warning', violations);
          break;
          
        case 'soft_warn':
          await this.issueSoftWarning(userId, moderationResult);
          break;
          
        case 'approved':
          // No action needed
          break;
      }

      // Log the action
      this.logModerationAction(userId, moderationResult);

    } catch (error) {
      console.error('Moderation action execution error:', error);
    }
  }

  // Helper methods

  updateUserBehavior(userId, moderationResult) {
    const behavior = this.userBehaviorTracking.get(userId) || {
      violations: [],
      actions: [],
      patterns: {}
    };

    if (moderationResult.violations.length > 0) {
      behavior.violations.push({
        timestamp: Date.now(),
        violations: moderationResult.violations,
        score: moderationResult.score
      });
    }

    behavior.actions.push({
      timestamp: Date.now(),
      action: moderationResult.action,
      contentType: moderationResult.contentType
    });

    this.userBehaviorTracking.set(userId, behavior);
  }

  async analyzeImageContent(imageUrl) {
    // Placeholder for actual image analysis
    // In production, integrate with AI services
    return {
      adult_content: Math.random() * 0.3,
      violence: Math.random() * 0.1,
      inappropriate: Math.random() * 0.2,
      faces_detected: Math.floor(Math.random() * 3),
      text_detected: Math.random() > 0.8
    };
  }

  async analyzeMessagingPatterns(userId) {
    // Analyze user's messaging patterns for spam/harassment
    const messages = await Message.find({ sender: userId })
      .sort({ timestamp: -1 })
      .limit(50);

    const patterns = {
      suspicious: false,
      score: 0,
      reasons: []
    };

    if (messages.length >= 10) {
      // Check for identical messages
      const messageTexts = messages.map(m => m.content.toLowerCase().trim());
      const uniqueMessages = new Set(messageTexts);
      
      if (uniqueMessages.size < messageTexts.length * 0.5) {
        patterns.suspicious = true;
        patterns.score += 0.4;
        patterns.reasons.push('repetitive_messages');
      }

      // Check for rapid messaging
      const recentMessages = messages.filter(m => 
        Date.now() - new Date(m.timestamp).getTime() < 60 * 60 * 1000 // Last hour
      );

      if (recentMessages.length > 20) {
        patterns.suspicious = true;
        patterns.score += 0.3;
        patterns.reasons.push('rapid_messaging');
      }
    }

    return patterns;
  }

  async analyzeProfileChanges(userId) {
    // This would track profile change frequency
    // For now, return mock data
    return {
      frequent: false,
      changeCount: 2,
      lastChange: new Date()
    };
  }

  calculateReportPriority(reason, details) {
    const highPriorityReasons = ['harassment', 'threats', 'inappropriate_images'];
    const mediumPriorityReasons = ['spam', 'fake_profile', 'inappropriate_content'];
    
    if (highPriorityReasons.includes(reason)) return 'high';
    if (mediumPriorityReasons.includes(reason)) return 'medium';
    return 'low';
  }

  async autoModerateReport(report) {
    // Auto-resolve obvious cases
    if (report.reason === 'spam' && report.details.obviousSpam) {
      return { action: 'block', confidence: 0.9 };
    }
    
    return { action: 'approve', confidence: 0.3 };
  }

  estimateReviewTime(priority) {
    const times = {
      high: '2-4 hours',
      medium: '4-8 hours',
      low: '24-48 hours'
    };
    
    return times[priority] || '24-48 hours';
  }

  // Action execution methods
  async blockContent(userId, moderationResult) {
    console.log(`🚫 Blocking content from user: ${userId}`);
    // Implementation would update database, remove content, etc.
  }

  async flagForReview(userId, moderationResult) {
    console.log(`🏃 Flagging content for human review: ${userId}`);
    // Implementation would add to review queue
  }

  async issueWarning(userId, moderationResult) {
    console.log(`⚠️ Issuing warning to user: ${userId}`);
    // Implementation would log warning, possibly suspend features temporarily
  }

  async issueSoftWarning(userId, moderationResult) {
    console.log(`💬 Issuing soft warning to user: ${userId}`);
    // Implementation would show gentle reminder to user
  }

  async notifyUser(userId, notificationType, violations) {
    console.log(`📢 Notifying user ${userId} about ${notificationType}`);
    // Implementation would send in-app notification or email
  }

  logModerationAction(userId, moderationResult) {
    console.log(`📝 Logged moderation action for user: ${userId}, action: ${moderationResult.action}`);
    // Implementation would store in moderation log database
  }

  cleanupBehaviorData() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    for (const [userId, behavior] of this.userBehaviorTracking.entries()) {
      // Remove old violations and actions
      behavior.violations = behavior.violations.filter(v => v.timestamp > oneDayAgo);
      behavior.actions = behavior.actions.filter(a => a.timestamp > oneDayAgo);
      
      // Remove users with no recent activity
      if (behavior.violations.length === 0 && behavior.actions.length === 0) {
        this.userBehaviorTracking.delete(userId);
      }
    }
    
    console.log('🧹 Cleaned up old behavior tracking data');
  }
}

module.exports = ContentModerationSystem;