/**
 * Advanced Security and Fraud Detection System
 * 
 * Features:
 * - Real-time fraud detection and prevention
 * - Bot and fake account detection
 * - Suspicious behavior pattern analysis
 * - Device fingerprinting and tracking
 * - IP reputation and geo-blocking
 * - Rate limiting and abuse prevention
 * - Account verification and validation
 * - Security incident response
 * - Risk scoring and automatic actions
 */

const crypto = require('crypto');
const geoip = require('geoip-lite');
const User = require('../models/User');
const UserSwipe = require('../models/UserSwipe');
const Message = require('../models/Message');

class SecurityFraudDetection {
  constructor() {
    // Risk scoring thresholds
    this.riskThresholds = {
      low: 0.3,
      medium: 0.6,
      high: 0.8,
      critical: 0.95
    };

    // Suspicious patterns tracking
    this.suspiciousPatterns = new Map();
    this.deviceFingerprints = new Map();
    this.ipReputation = new Map();
    
    // Rate limiting windows
    this.rateLimits = {
      registration: { window: 60 * 60 * 1000, max: 3 }, // 3 registrations per hour per IP
      login: { window: 15 * 60 * 1000, max: 5 }, // 5 login attempts per 15 minutes
      messaging: { window: 60 * 1000, max: 20 }, // 20 messages per minute
      swipes: { window: 60 * 1000, max: 100 }, // 100 swipes per minute
      profileUpdates: { window: 60 * 60 * 1000, max: 10 } // 10 profile updates per hour
    };

    // Known bad indicators
    this.blacklistedIPs = new Set();
    this.suspiciousEmails = new Set();
    this.bannedDevices = new Set();

    // Cleanup intervals
    setInterval(() => this.cleanupOldData(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Analyze user registration for fraud indicators
   * @param {Object} registrationData - User registration data
   * @param {Object} requestInfo - Request metadata (IP, user agent, etc.)
   * @returns {Object} Security analysis result
   */
  async analyzeRegistration(registrationData, requestInfo) {
    try {
      console.log(`🔍 Analyzing registration security for: ${registrationData.email}`);

      const analysis = {
        riskScore: 0,
        riskLevel: 'low',
        flags: [],
        recommendations: [],
        allowRegistration: true,
        requiresVerification: false
      };

      // Check IP reputation and geolocation
      const ipAnalysis = await this.analyzeIP(requestInfo.ip);
      analysis.riskScore += ipAnalysis.riskScore;
      if (ipAnalysis.flags.length > 0) {
        analysis.flags.push(...ipAnalysis.flags);
      }

      // Check email patterns
      const emailAnalysis = this.analyzeEmail(registrationData.email);
      analysis.riskScore += emailAnalysis.riskScore;
      if (emailAnalysis.flags.length > 0) {
        analysis.flags.push(...emailAnalysis.flags);
      }

      // Check device fingerprinting
      const deviceAnalysis = await this.analyzeDevice(requestInfo);
      analysis.riskScore += deviceAnalysis.riskScore;
      if (deviceAnalysis.flags.length > 0) {
        analysis.flags.push(...deviceAnalysis.flags);
      }

      // Check registration rate limiting
      const rateLimitAnalysis = this.checkRateLimit('registration', requestInfo.ip);
      if (rateLimitAnalysis.exceeded) {
        analysis.riskScore += 0.5;
        analysis.flags.push('rate_limit_exceeded');
      }

      // Check profile completeness patterns
      const profileAnalysis = this.analyzeProfileData(registrationData);
      analysis.riskScore += profileAnalysis.riskScore;
      if (profileAnalysis.flags.length > 0) {
        analysis.flags.push(...profileAnalysis.flags);
      }

      // Determine final risk level and actions
      analysis.riskLevel = this.calculateRiskLevel(analysis.riskScore);
      analysis.allowRegistration = analysis.riskLevel !== 'critical';
      analysis.requiresVerification = analysis.riskLevel === 'high' || analysis.riskLevel === 'critical';

      // Generate recommendations
      analysis.recommendations = this.generateSecurityRecommendations(analysis);

      console.log(`🔍 Registration analysis complete - Risk: ${analysis.riskLevel} (${analysis.riskScore.toFixed(2)})`);
      return analysis;

    } catch (error) {
      console.error('❌ Registration security analysis error:', error);
      throw error;
    }
  }

  /**
   * Analyze user behavior for suspicious patterns
   * @param {string} userId - User ID to analyze
   * @param {Object} activity - Recent activity data
   * @returns {Object} Behavior analysis result
   */
  async analyzeBehaviorPatterns(userId, activity) {
    try {
      console.log(`🔍 Analyzing behavior patterns for user: ${userId}`);

      const analysis = {
        riskScore: 0,
        riskLevel: 'low',
        patterns: [],
        anomalies: [],
        recommendedActions: []
      };

      // Get user's historical data
      const [user, swipeHistory, messageHistory] = await Promise.all([
        User.findById(userId),
        UserSwipe.find({ user: userId }).sort({ timestamp: -1 }).limit(100),
        Message.find({ sender: userId }).sort({ timestamp: -1 }).limit(50)
      ]);

      if (!user) {
        throw new Error('User not found');
      }

      // Analyze swipe patterns
      const swipeAnalysis = this.analyzeSwipePatterns(swipeHistory);
      analysis.riskScore += swipeAnalysis.riskScore;
      if (swipeAnalysis.patterns.length > 0) {
        analysis.patterns.push(...swipeAnalysis.patterns);
      }

      // Analyze messaging patterns
      const messageAnalysis = this.analyzeMessagingPatterns(messageHistory);
      analysis.riskScore += messageAnalysis.riskScore;
      if (messageAnalysis.patterns.length > 0) {
        analysis.patterns.push(...messageAnalysis.patterns);
      }

      // Analyze profile update patterns
      const profileAnalysis = await this.analyzeProfileUpdatePatterns(userId);
      analysis.riskScore += profileAnalysis.riskScore;
      if (profileAnalysis.patterns.length > 0) {
        analysis.patterns.push(...profileAnalysis.patterns);
      }

      // Check for bot-like behavior
      const botAnalysis = this.detectBotBehavior(user, swipeHistory, messageHistory);
      analysis.riskScore += botAnalysis.riskScore;
      if (botAnalysis.indicators.length > 0) {
        analysis.anomalies.push(...botAnalysis.indicators);
      }

      // Analyze location consistency
      const locationAnalysis = this.analyzeLocationConsistency(user);
      analysis.riskScore += locationAnalysis.riskScore;
      if (locationAnalysis.anomalies.length > 0) {
        analysis.anomalies.push(...locationAnalysis.anomalies);
      }

      // Determine risk level and actions
      analysis.riskLevel = this.calculateRiskLevel(analysis.riskScore);
      analysis.recommendedActions = this.generateBehaviorRecommendations(analysis);

      console.log(`🔍 Behavior analysis complete - Risk: ${analysis.riskLevel} (${analysis.riskScore.toFixed(2)})`);
      return analysis;

    } catch (error) {
      console.error('❌ Behavior analysis error:', error);
      throw error;
    }
  }

  /**
   * Real-time fraud detection for user actions
   * @param {string} userId - User performing the action
   * @param {string} action - Action type (swipe, message, etc.)
   * @param {Object} actionData - Action data
   * @param {Object} requestInfo - Request metadata
   * @returns {Object} Real-time fraud analysis
   */
  async detectRealTimeFraud(userId, action, actionData, requestInfo) {
    try {
      const analysis = {
        allowed: true,
        riskScore: 0,
        flags: [],
        delay: 0, // Suggested delay before allowing action
        requiresCaptcha: false
      };

      // Rate limiting check
      const rateLimitKey = `${action}_${userId}`;
      const rateLimit = this.rateLimits[action];
      
      if (rateLimit && this.checkRateLimit(rateLimitKey, userId).exceeded) {
        analysis.riskScore += 0.4;
        analysis.flags.push('rate_limit_exceeded');
        analysis.delay = 5000; // 5 second delay
      }

      // Check for rapid sequential actions
      const rapidActionCheck = this.checkRapidActions(userId, action);
      if (rapidActionCheck.suspicious) {
        analysis.riskScore += 0.3;
        analysis.flags.push('rapid_sequential_actions');
        analysis.requiresCaptcha = true;
      }

      // Action-specific fraud checks
      switch (action) {
        case 'swipe':
          const swipeCheck = this.checkSwipeFraud(userId, actionData);
          analysis.riskScore += swipeCheck.riskScore;
          break;
          
        case 'message':
          const messageCheck = this.checkMessageFraud(userId, actionData);
          analysis.riskScore += messageCheck.riskScore;
          if (messageCheck.flags.length > 0) {
            analysis.flags.push(...messageCheck.flags);
          }
          break;
          
        case 'profile_update':
          const profileCheck = this.checkProfileUpdateFraud(userId, actionData);
          analysis.riskScore += profileCheck.riskScore;
          break;
      }

      // Device consistency check
      const deviceCheck = this.checkDeviceConsistency(userId, requestInfo);
      analysis.riskScore += deviceCheck.riskScore;
      if (deviceCheck.flags.length > 0) {
        analysis.flags.push(...deviceCheck.flags);
      }

      // Determine if action should be allowed
      if (analysis.riskScore >= this.riskThresholds.critical) {
        analysis.allowed = false;
      } else if (analysis.riskScore >= this.riskThresholds.high) {
        analysis.requiresCaptcha = true;
        analysis.delay = 3000;
      }

      return analysis;

    } catch (error) {
      console.error('❌ Real-time fraud detection error:', error);
      return { allowed: true, riskScore: 0, flags: [] };
    }
  }

  /**
   * Analyze IP address for reputation and geo-location
   * @param {string} ip - IP address to analyze
   * @returns {Object} IP analysis result
   */
  async analyzeIP(ip) {
    const analysis = {
      riskScore: 0,
      flags: [],
      location: null,
      isVPN: false,
      isProxy: false
    };

    try {
      // Check if IP is blacklisted
      if (this.blacklistedIPs.has(ip)) {
        analysis.riskScore += 0.8;
        analysis.flags.push('blacklisted_ip');
      }

      // Get geo-location data
      const geoData = geoip.lookup(ip);
      if (geoData) {
        analysis.location = {
          country: geoData.country,
          region: geoData.region,
          city: geoData.city,
          timezone: geoData.timezone
        };

        // Check for high-risk countries (simplified example)
        const highRiskCountries = ['CN', 'RU', 'NG']; // This would be more comprehensive
        if (highRiskCountries.includes(geoData.country)) {
          analysis.riskScore += 0.2;
          analysis.flags.push('high_risk_country');
        }
      }

      // Check IP reputation (in production, integrate with threat intelligence APIs)
      const reputation = this.ipReputation.get(ip);
      if (reputation && reputation.malicious) {
        analysis.riskScore += 0.6;
        analysis.flags.push('malicious_ip');
      }

      // Detect VPN/Proxy (simplified - in production use specialized services)
      if (this.isLikelyVPN(ip)) {
        analysis.riskScore += 0.3;
        analysis.flags.push('vpn_detected');
        analysis.isVPN = true;
      }

    } catch (error) {
      console.error('IP analysis error:', error);
    }

    return analysis;
  }

  /**
   * Analyze email address for suspicious patterns
   * @param {string} email - Email to analyze
   * @returns {Object} Email analysis result
   */
  analyzeEmail(email) {
    const analysis = {
      riskScore: 0,
      flags: []
    };

    // Check against suspicious email patterns
    if (this.suspiciousEmails.has(email)) {
      analysis.riskScore += 0.7;
      analysis.flags.push('suspicious_email');
    }

    // Check for disposable email domains
    const disposableDomains = ['10minutemail', 'guerrillamail', 'tempmail'];
    const domain = email.split('@')[1];
    if (disposableDomains.some(d => domain.includes(d))) {
      analysis.riskScore += 0.5;
      analysis.flags.push('disposable_email');
    }

    // Check for suspicious patterns
    if (email.match(/\d{10,}/)) { // Long number sequences
      analysis.riskScore += 0.3;
      analysis.flags.push('suspicious_email_pattern');
    }

    // Check for recently created email pattern
    if (email.match(/\d{4}$/)) { // Ends with year
      analysis.riskScore += 0.2;
      analysis.flags.push('potentially_new_email');
    }

    return analysis;
  }

  /**
   * Analyze device fingerprint
   * @param {Object} requestInfo - Request information including device data
   * @returns {Object} Device analysis result
   */
  async analyzeDevice(requestInfo) {
    const analysis = {
      riskScore: 0,
      flags: []
    };

    try {
      // Create device fingerprint
      const fingerprint = this.createDeviceFingerprint(requestInfo);
      
      // Check if device is banned
      if (this.bannedDevices.has(fingerprint)) {
        analysis.riskScore += 0.9;
        analysis.flags.push('banned_device');
      }

      // Check for device anomalies
      if (requestInfo.userAgent) {
        // Check for suspicious user agents
        if (this.isSuspiciousUserAgent(requestInfo.userAgent)) {
          analysis.riskScore += 0.4;
          analysis.flags.push('suspicious_user_agent');
        }

        // Check for bot indicators
        if (this.indicatesBot(requestInfo.userAgent)) {
          analysis.riskScore += 0.6;
          analysis.flags.push('bot_user_agent');
        }
      }

      // Track device usage
      const deviceUsage = this.deviceFingerprints.get(fingerprint) || {
        firstSeen: new Date(),
        accounts: new Set(),
        lastSeen: new Date()
      };

      deviceUsage.accounts.add(requestInfo.userId);
      deviceUsage.lastSeen = new Date();

      // Flag devices used by multiple accounts
      if (deviceUsage.accounts.size > 3) {
        analysis.riskScore += 0.5;
        analysis.flags.push('multi_account_device');
      }

      this.deviceFingerprints.set(fingerprint, deviceUsage);

    } catch (error) {
      console.error('Device analysis error:', error);
    }

    return analysis;
  }

  /**
   * Analyze swipe patterns for bot-like behavior
   * @param {Array} swipeHistory - User's swipe history
   * @returns {Object} Swipe pattern analysis
   */
  analyzeSwipePatterns(swipeHistory) {
    const analysis = {
      riskScore: 0,
      patterns: []
    };

    if (swipeHistory.length === 0) {
      return analysis;
    }

    // Check for rapid swiping
    const rapidSwipes = this.findRapidSwipes(swipeHistory);
    if (rapidSwipes.count > 50) { // More than 50 swipes in a minute
      analysis.riskScore += 0.4;
      analysis.patterns.push('rapid_swiping');
    }

    // Check for uniform patterns (always like or always pass)
    const likes = swipeHistory.filter(s => s.action === 'like').length;
    const passes = swipeHistory.filter(s => s.action === 'pass').length;
    const total = likes + passes;
    
    if (total > 20) {
      const likeRate = likes / total;
      if (likeRate > 0.95 || likeRate < 0.05) {
        analysis.riskScore += 0.3;
        analysis.patterns.push('uniform_swipe_pattern');
      }
    }

    // Check for time-based patterns (always swiping at exact intervals)
    const timeIntervals = this.analyzeSwipeTimeIntervals(swipeHistory);
    if (timeIntervals.tooUniform) {
      analysis.riskScore += 0.5;
      analysis.patterns.push('robotic_timing');
    }

    return analysis;
  }

  /**
   * Analyze messaging patterns for spam or bot behavior
   * @param {Array} messageHistory - User's message history
   * @returns {Object} Messaging pattern analysis
   */
  analyzeMessagingPatterns(messageHistory) {
    const analysis = {
      riskScore: 0,
      patterns: []
    };

    if (messageHistory.length === 0) {
      return analysis;
    }

    // Check for identical messages
    const messageTexts = messageHistory.map(m => m.content.toLowerCase().trim());
    const uniqueMessages = new Set(messageTexts);
    
    if (messageTexts.length > 10 && uniqueMessages.size < messageTexts.length * 0.3) {
      analysis.riskScore += 0.6;
      analysis.patterns.push('repetitive_messages');
    }

    // Check for spam indicators
    const spamCount = messageHistory.filter(m => 
      this.containsSpamIndicators(m.content)
    ).length;
    
    if (spamCount > messageHistory.length * 0.5) {
      analysis.riskScore += 0.7;
      analysis.patterns.push('spam_messages');
    }

    // Check for rapid messaging
    const rapidMessages = this.findRapidMessages(messageHistory);
    if (rapidMessages.count > 20) { // More than 20 messages per minute
      analysis.riskScore += 0.4;
      analysis.patterns.push('rapid_messaging');
    }

    return analysis;
  }

  /**
   * Detect bot-like behavior across all user activities
   * @param {Object} user - User object
   * @param {Array} swipeHistory - Swipe history
   * @param {Array} messageHistory - Message history
   * @returns {Object} Bot detection analysis
   */
  detectBotBehavior(user, swipeHistory, messageHistory) {
    const analysis = {
      riskScore: 0,
      indicators: [],
      confidence: 0
    };

    // Check profile completeness patterns
    if (this.hasBot ProfilePattern(user.profile)) {
      analysis.riskScore += 0.4;
      analysis.indicators.push('bot_profile_pattern');
    }

    // Check activity timing patterns
    const activityPattern = this.analyzeActivityTiming(swipeHistory, messageHistory);
    if (activityPattern.suspicious) {
      analysis.riskScore += 0.3;
      analysis.indicators.push('suspicious_activity_timing');
    }

    // Check for lack of human-like variations
    const variationScore = this.calculateBehaviorVariation(swipeHistory, messageHistory);
    if (variationScore < 0.2) {
      analysis.riskScore += 0.5;
      analysis.indicators.push('lack_of_variation');
    }

    // Calculate confidence based on data volume
    const dataPoints = swipeHistory.length + messageHistory.length;
    analysis.confidence = Math.min(1, dataPoints / 100); // Full confidence with 100+ data points

    return analysis;
  }

  // Helper methods for fraud detection

  createDeviceFingerprint(requestInfo) {
    const parts = [
      requestInfo.userAgent || '',
      requestInfo.acceptLanguage || '',
      requestInfo.timezone || '',
      requestInfo.screenResolution || '',
      requestInfo.platform || ''
    ];
    
    return crypto.createHash('sha256')
      .update(parts.join('|'))
      .digest('hex')
      .substring(0, 16);
  }

  isSuspiciousUserAgent(userAgent) {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /curl/i,
      /wget/i,
      /postman/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  indicatesBot(userAgent) {
    return /bot|crawler|spider|scraper/i.test(userAgent);
  }

  isLikelyVPN(ip) {
    // Simplified VPN detection - in production use specialized services
    const vpnRanges = [
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16'
    ];
    
    // This is very basic - real VPN detection is much more complex
    return false; // Placeholder
  }

  checkRateLimit(key, identifier) {
    const rateLimitKey = `${key}_${identifier}`;
    const now = Date.now();
    
    // Get or create rate limit data
    let rateLimitData = this.suspiciousPatterns.get(rateLimitKey) || {
      attempts: [],
      window: this.rateLimits[key]?.window || 60000,
      max: this.rateLimits[key]?.max || 10
    };

    // Clean old attempts
    rateLimitData.attempts = rateLimitData.attempts.filter(
      timestamp => now - timestamp < rateLimitData.window
    );

    // Check if limit exceeded
    const exceeded = rateLimitData.attempts.length >= rateLimitData.max;
    
    // Add current attempt
    rateLimitData.attempts.push(now);
    
    // Store updated data
    this.suspiciousPatterns.set(rateLimitKey, rateLimitData);

    return {
      exceeded,
      count: rateLimitData.attempts.length,
      remaining: Math.max(0, rateLimitData.max - rateLimitData.attempts.length)
    };
  }

  calculateRiskLevel(riskScore) {
    if (riskScore >= this.riskThresholds.critical) return 'critical';
    if (riskScore >= this.riskThresholds.high) return 'high';
    if (riskScore >= this.riskThresholds.medium) return 'medium';
    return 'low';
  }

  generateSecurityRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.flags.includes('suspicious_email')) {
      recommendations.push('Require email verification');
    }
    
    if (analysis.flags.includes('high_risk_country')) {
      recommendations.push('Additional identity verification');
    }
    
    if (analysis.flags.includes('vpn_detected')) {
      recommendations.push('Request alternative verification method');
    }
    
    if (analysis.riskLevel === 'high' || analysis.riskLevel === 'critical') {
      recommendations.push('Manual review required');
    }
    
    return recommendations;
  }

  // Cleanup old tracking data
  cleanupOldData() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    // Clean rate limiting data
    for (const [key, data] of this.suspiciousPatterns.entries()) {
      if (data.attempts) {
        data.attempts = data.attempts.filter(timestamp => timestamp > oneDayAgo);
        if (data.attempts.length === 0) {
          this.suspiciousPatterns.delete(key);
        }
      }
    }
    
    // Clean device fingerprint data
    for (const [fingerprint, data] of this.deviceFingerprints.entries()) {
      if (data.lastSeen < oneDayAgo) {
        this.deviceFingerprints.delete(fingerprint);
      }
    }
    
    console.log('🧹 Cleaned up old security tracking data');
  }

  // Placeholder methods for complex analysis (would be implemented with real data)
  analyzeProfileData(data) { return { riskScore: 0, flags: [] }; }
  checkRapidActions(userId, action) { return { suspicious: false }; }
  checkSwipeFraud(userId, data) { return { riskScore: 0 }; }
  checkMessageFraud(userId, data) { return { riskScore: 0, flags: [] }; }
  checkProfileUpdateFraud(userId, data) { return { riskScore: 0 }; }
  checkDeviceConsistency(userId, requestInfo) { return { riskScore: 0, flags: [] }; }
  analyzeProfileUpdatePatterns(userId) { return { riskScore: 0, patterns: [] }; }
  analyzeLocationConsistency(user) { return { riskScore: 0, anomalies: [] }; }
  findRapidSwipes(history) { return { count: 0 }; }
  analyzeSwipeTimeIntervals(history) { return { tooUniform: false }; }
  containsSpamIndicators(text) { return false; }
  findRapidMessages(history) { return { count: 0 }; }
  hasBotProfilePattern(profile) { return false; }
  analyzeActivityTiming(swipes, messages) { return { suspicious: false }; }
  calculateBehaviorVariation(swipes, messages) { return 0.5; }
  generateBehaviorRecommendations(analysis) { return []; }
}

module.exports = SecurityFraudDetection;