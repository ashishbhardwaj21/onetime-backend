/**
 * Advanced A/B Testing Service
 * 
 * Features:
 * - Multi-variant testing framework
 * - Statistical significance calculation
 * - Real-time test monitoring
 * - Automated test management
 * - Feature flag integration
 * - Conversion tracking
 * - Segmented testing
 * - Performance impact analysis
 */

const User = require('../models/User');

class ABTestingService {
  constructor() {
    this.activeTests = new Map();
    this.testResults = new Map();
    this.featureFlags = new Map();
    
    // Initialize A/B testing framework
    this.initializeABTesting();
  }

  /**
   * Initialize A/B testing framework
   */
  async initializeABTesting() {
    try {
      console.log('🧪 Initializing A/B Testing Service...');
      
      // Load active tests from database
      await this.loadActiveTests();
      
      // Initialize feature flags
      this.initializeFeatureFlags();
      
      // Start test monitoring
      this.startTestMonitoring();
      
      console.log('✅ A/B Testing Service initialized');
      
    } catch (error) {
      console.error('❌ A/B Testing initialization error:', error);
    }
  }

  /**
   * Create new A/B test
   */
  async createABTest(testConfig) {
    try {
      console.log(`🔬 Creating A/B test: ${testConfig.name}`);
      
      const test = {
        id: this.generateTestId(),
        name: testConfig.name,
        description: testConfig.description,
        hypothesis: testConfig.hypothesis,
        variants: testConfig.variants.map((variant, index) => ({
          id: variant.id || `variant_${String.fromCharCode(65 + index)}`,
          name: variant.name,
          description: variant.description,
          config: variant.config,
          traffic: variant.traffic || (100 / testConfig.variants.length),
          participants: 0,
          conversions: 0,
          metrics: {}
        })),
        targetAudience: testConfig.targetAudience || {},
        startDate: new Date(),
        endDate: testConfig.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        primaryMetric: testConfig.primaryMetric,
        secondaryMetrics: testConfig.secondaryMetrics || [],
        minSampleSize: testConfig.minSampleSize || 1000,
        confidenceLevel: testConfig.confidenceLevel || 0.95,
        createdBy: testConfig.createdBy,
        createdAt: new Date()
      };

      // Validate test configuration
      this.validateTestConfig(test);
      
      // Store test
      this.activeTests.set(test.id, test);
      
      // Initialize test tracking
      this.initializeTestTracking(test);
      
      console.log(`✅ A/B test created: ${test.id}`);
      return test;

    } catch (error) {
      console.error('A/B test creation error:', error);
      throw error;
    }
  }

  /**
   * Assign user to test variant
   */
  async assignUserToTest(userId, testId) {
    try {
      const test = this.activeTests.get(testId);
      if (!test || test.status !== 'active') {
        return null;
      }

      // Check if user is eligible for test
      const user = await User.findById(userId);
      if (!this.isUserEligible(user, test.targetAudience)) {
        return null;
      }

      // Check if user already assigned
      const existingAssignment = await this.getUserTestAssignment(userId, testId);
      if (existingAssignment) {
        return existingAssignment;
      }

      // Assign to variant based on traffic allocation
      const variant = this.selectVariantForUser(userId, test);
      
      // Record assignment
      const assignment = {
        userId,
        testId,
        variantId: variant.id,
        assignedAt: new Date(),
        hasConverted: false,
        metrics: {}
      };

      // Update variant participant count
      variant.participants++;
      
      // Store assignment
      await this.storeTestAssignment(assignment);
      
      console.log(`👤 User ${userId} assigned to test ${testId}, variant ${variant.id}`);
      return assignment;

    } catch (error) {
      console.error('Test assignment error:', error);
      return null;
    }
  }

  /**
   * Track conversion event
   */
  async trackConversion(userId, testId, conversionData = {}) {
    try {
      const assignment = await this.getUserTestAssignment(userId, testId);
      if (!assignment || assignment.hasConverted) {
        return false;
      }

      const test = this.activeTests.get(testId);
      if (!test) {
        return false;
      }

      // Find variant
      const variant = test.variants.find(v => v.id === assignment.variantId);
      if (!variant) {
        return false;
      }

      // Record conversion
      assignment.hasConverted = true;
      assignment.convertedAt = new Date();
      assignment.conversionData = conversionData;

      // Update variant metrics
      variant.conversions++;
      variant.conversionRate = (variant.conversions / variant.participants) * 100;

      // Update test metrics
      await this.updateTestMetrics(test, variant, conversionData);
      
      // Store updated assignment
      await this.updateTestAssignment(assignment);

      console.log(`✅ Conversion tracked for user ${userId} in test ${testId}`);
      return true;

    } catch (error) {
      console.error('Conversion tracking error:', error);
      return false;
    }
  }

  /**
   * Get test results and analysis
   */
  async getTestResults(testId) {
    try {
      const test = this.activeTests.get(testId);
      if (!test) {
        throw new Error('Test not found');
      }

      const analysis = {
        testId,
        testName: test.name,
        status: test.status,
        duration: Math.floor((new Date() - test.startDate) / (1000 * 60 * 60 * 24)),
        variants: test.variants.map(variant => ({
          id: variant.id,
          name: variant.name,
          participants: variant.participants,
          conversions: variant.conversions,
          conversionRate: variant.participants > 0 ? 
            (variant.conversions / variant.participants) * 100 : 0,
          metrics: variant.metrics
        })),
        statisticalAnalysis: await this.performStatisticalAnalysis(test),
        recommendations: this.generateTestRecommendations(test),
        insights: this.generateTestInsights(test)
      };

      // Calculate winner if test is complete
      if (test.status === 'completed' || this.hasMinimumSampleSize(test)) {
        analysis.winner = this.determineTestWinner(test);
        analysis.significance = this.calculateStatisticalSignificance(test);
      }

      return analysis;

    } catch (error) {
      console.error('Test results error:', error);
      throw error;
    }
  }

  /**
   * Stop A/B test
   */
  async stopTest(testId, reason = 'manual_stop') {
    try {
      const test = this.activeTests.get(testId);
      if (!test) {
        throw new Error('Test not found');
      }

      test.status = 'stopped';
      test.stoppedAt = new Date();
      test.stopReason = reason;

      // Generate final results
      const finalResults = await this.getTestResults(testId);
      
      // Archive test
      this.testResults.set(testId, finalResults);
      
      // Clean up active test
      this.activeTests.delete(testId);

      console.log(`🛑 A/B test stopped: ${testId} (${reason})`);
      return finalResults;

    } catch (error) {
      console.error('Stop test error:', error);
      throw error;
    }
  }

  /**
   * Get feature flag value for user
   */
  async getFeatureFlag(userId, flagName) {
    try {
      const flag = this.featureFlags.get(flagName);
      if (!flag) {
        return null;
      }

      // Check if flag has A/B test
      if (flag.abTestId) {
        const assignment = await this.assignUserToTest(userId, flag.abTestId);
        if (assignment) {
          const test = this.activeTests.get(flag.abTestId);
          const variant = test.variants.find(v => v.id === assignment.variantId);
          return variant?.config?.[flagName] || flag.defaultValue;
        }
      }

      // Check user eligibility for flag
      const user = await User.findById(userId);
      if (flag.targetAudience && !this.isUserEligible(user, flag.targetAudience)) {
        return flag.defaultValue;
      }

      // Return flag value based on rollout percentage
      if (flag.rolloutPercentage < 100) {
        const userHash = this.hashUserId(userId);
        const bucket = userHash % 100;
        if (bucket >= flag.rolloutPercentage) {
          return flag.defaultValue;
        }
      }

      return flag.value;

    } catch (error) {
      console.error('Feature flag error:', error);
      return null;
    }
  }

  /**
   * Create feature flag
   */
  createFeatureFlag(flagConfig) {
    try {
      const flag = {
        name: flagConfig.name,
        description: flagConfig.description,
        value: flagConfig.value,
        defaultValue: flagConfig.defaultValue,
        rolloutPercentage: flagConfig.rolloutPercentage || 100,
        targetAudience: flagConfig.targetAudience || null,
        abTestId: flagConfig.abTestId || null,
        isActive: flagConfig.isActive !== false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.featureFlags.set(flag.name, flag);
      
      console.log(`🚩 Feature flag created: ${flag.name}`);
      return flag;

    } catch (error) {
      console.error('Feature flag creation error:', error);
      throw error;
    }
  }

  /**
   * Perform statistical analysis
   */
  async performStatisticalAnalysis(test) {
    try {
      if (test.variants.length < 2) {
        return { error: 'Insufficient variants for analysis' };
      }

      const [controlVariant, ...treatmentVariants] = test.variants;
      
      const analysis = {
        control: {
          id: controlVariant.id,
          conversionRate: controlVariant.participants > 0 ? 
            (controlVariant.conversions / controlVariant.participants) : 0,
          participants: controlVariant.participants,
          conversions: controlVariant.conversions
        },
        treatments: treatmentVariants.map(variant => {
          const conversionRate = variant.participants > 0 ? 
            (variant.conversions / variant.participants) : 0;
          
          return {
            id: variant.id,
            conversionRate,
            participants: variant.participants,
            conversions: variant.conversions,
            lift: analysis.control.conversionRate > 0 ? 
              ((conversionRate - analysis.control.conversionRate) / analysis.control.conversionRate) * 100 : 0,
            pValue: this.calculatePValue(controlVariant, variant),
            confidenceInterval: this.calculateConfidenceInterval(variant)
          };
        })
      };

      // Calculate overall test significance
      analysis.isSignificant = analysis.treatments.some(t => t.pValue < 0.05);
      analysis.hasMinimumSample = this.hasMinimumSampleSize(test);
      analysis.canMakeDecision = analysis.isSignificant && analysis.hasMinimumSample;

      return analysis;

    } catch (error) {
      console.error('Statistical analysis error:', error);
      return { error: 'Analysis failed' };
    }
  }

  // Helper Methods

  generateTestId() {
    return 'test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  validateTestConfig(test) {
    if (!test.name || !test.variants || test.variants.length < 2) {
      throw new Error('Invalid test configuration');
    }

    // Validate traffic allocation
    const totalTraffic = test.variants.reduce((sum, v) => sum + v.traffic, 0);
    if (Math.abs(totalTraffic - 100) > 0.1) {
      throw new Error('Traffic allocation must sum to 100%');
    }
  }

  initializeTestTracking(test) {
    // Set up tracking for test metrics
    test.tracking = {
      startTime: new Date(),
      lastUpdated: new Date(),
      sampleSize: 0,
      totalConversions: 0
    };
  }

  isUserEligible(user, targetAudience) {
    if (!targetAudience || Object.keys(targetAudience).length === 0) {
      return true;
    }

    // Check various targeting criteria
    if (targetAudience.subscriptionTier && 
        user.subscription?.tier !== targetAudience.subscriptionTier) {
      return false;
    }

    if (targetAudience.minAge && user.profile?.age < targetAudience.minAge) {
      return false;
    }

    if (targetAudience.maxAge && user.profile?.age > targetAudience.maxAge) {
      return false;
    }

    if (targetAudience.location && 
        !this.matchesLocation(user.profile?.location, targetAudience.location)) {
      return false;
    }

    return true;
  }

  selectVariantForUser(userId, test) {
    // Use consistent hashing to assign user to variant
    const userHash = this.hashUserId(userId);
    const bucket = userHash % 100;
    
    let cumulativeTraffic = 0;
    for (const variant of test.variants) {
      cumulativeTraffic += variant.traffic;
      if (bucket < cumulativeTraffic) {
        return variant;
      }
    }
    
    // Fallback to first variant
    return test.variants[0];
  }

  hashUserId(userId) {
    // Simple hash function for consistent assignment
    let hash = 0;
    const str = userId.toString();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  calculatePValue(controlVariant, treatmentVariant) {
    // Simplified p-value calculation
    const n1 = controlVariant.participants;
    const n2 = treatmentVariant.participants;
    const x1 = controlVariant.conversions;
    const x2 = treatmentVariant.conversions;

    if (n1 === 0 || n2 === 0) return 1;

    const p1 = x1 / n1;
    const p2 = x2 / n2;
    const p = (x1 + x2) / (n1 + n2);
    
    const se = Math.sqrt(p * (1 - p) * (1/n1 + 1/n2));
    const z = Math.abs(p1 - p2) / se;
    
    // Approximate p-value (simplified)
    return z > 1.96 ? 0.01 : z > 1.64 ? 0.05 : 0.1;
  }

  calculateConfidenceInterval(variant) {
    if (variant.participants === 0) return [0, 0];
    
    const p = variant.conversions / variant.participants;
    const se = Math.sqrt(p * (1 - p) / variant.participants);
    const margin = 1.96 * se; // 95% confidence interval
    
    return [
      Math.max(0, p - margin),
      Math.min(1, p + margin)
    ];
  }

  hasMinimumSampleSize(test) {
    return test.variants.every(v => v.participants >= test.minSampleSize / test.variants.length);
  }

  determineTestWinner(test) {
    const analysis = this.performStatisticalAnalysis(test);
    
    if (!analysis.isSignificant || !analysis.hasMinimumSample) {
      return { winner: null, reason: 'Insufficient data or significance' };
    }

    // Find variant with highest conversion rate
    const allVariants = [analysis.control, ...analysis.treatments];
    const winner = allVariants.reduce((best, current) => 
      current.conversionRate > best.conversionRate ? current : best
    );

    return {
      winner: winner.id,
      conversionRate: winner.conversionRate,
      confidence: 'high'
    };
  }

  calculateStatisticalSignificance(test) {
    const analysis = this.performStatisticalAnalysis(test);
    return {
      isSignificant: analysis.isSignificant,
      confidenceLevel: test.confidenceLevel,
      hasMinimumSample: analysis.hasMinimumSample
    };
  }

  generateTestRecommendations(test) {
    const recommendations = [];
    
    if (!this.hasMinimumSampleSize(test)) {
      recommendations.push('Continue test to reach minimum sample size');
    }
    
    const totalParticipants = test.variants.reduce((sum, v) => sum + v.participants, 0);
    if (totalParticipants < 100) {
      recommendations.push('Increase traffic allocation to gather more data');
    }
    
    const duration = (new Date() - test.startDate) / (1000 * 60 * 60 * 24);
    if (duration < 7) {
      recommendations.push('Run test for at least one week to account for weekly patterns');
    }
    
    return recommendations;
  }

  generateTestInsights(test) {
    const insights = [];
    
    // Find best performing variant
    const bestVariant = test.variants.reduce((best, current) => 
      (current.conversions / Math.max(current.participants, 1)) > 
      (best.conversions / Math.max(best.participants, 1)) ? current : best
    );
    
    insights.push(`Variant ${bestVariant.id} shows highest conversion rate`);
    
    // Check for large differences
    const conversionRates = test.variants.map(v => 
      v.participants > 0 ? v.conversions / v.participants : 0
    );
    const maxRate = Math.max(...conversionRates);
    const minRate = Math.min(...conversionRates);
    
    if (maxRate > minRate * 1.2) {
      insights.push('Significant performance difference detected between variants');
    }
    
    return insights;
  }

  // Placeholder methods
  async loadActiveTests() {
    console.log('📥 Loading active tests from database...');
  }

  initializeFeatureFlags() {
    console.log('🚩 Initializing feature flags...');
    
    // Create some default feature flags
    this.createFeatureFlag({
      name: 'new_matching_algorithm',
      description: 'Enable new ML-powered matching algorithm',
      value: true,
      defaultValue: false,
      rolloutPercentage: 50
    });
    
    this.createFeatureFlag({
      name: 'video_chat_feature',
      description: 'Enable video chat functionality',
      value: true,
      defaultValue: false,
      rolloutPercentage: 25
    });
  }

  startTestMonitoring() {
    console.log('📊 Starting test monitoring...');
    
    // Monitor tests every hour
    setInterval(async () => {
      try {
        await this.monitorActiveTests();
      } catch (error) {
        console.error('Test monitoring error:', error);
      }
    }, 60 * 60 * 1000);
  }

  async monitorActiveTests() {
    for (const [testId, test] of this.activeTests) {
      // Check if test should be auto-stopped
      if (test.endDate < new Date()) {
        await this.stopTest(testId, 'end_date_reached');
      }
      
      // Check for early stopping criteria
      const analysis = await this.performStatisticalAnalysis(test);
      if (analysis.isSignificant && analysis.hasMinimumSample) {
        // Could implement early stopping logic here
      }
    }
  }

  async getUserTestAssignment(userId, testId) {
    // In production, this would query the database
    return null; // Placeholder
  }

  async storeTestAssignment(assignment) {
    // In production, this would store in database
    console.log(`💾 Storing test assignment for user ${assignment.userId}`);
  }

  async updateTestAssignment(assignment) {
    // In production, this would update in database
    console.log(`📝 Updating test assignment for user ${assignment.userId}`);
  }

  async updateTestMetrics(test, variant, conversionData) {
    // Update additional metrics based on conversion data
    test.tracking.lastUpdated = new Date();
    test.tracking.totalConversions++;
  }

  matchesLocation(userLocation, targetLocation) {
    // Simplified location matching
    return true;
  }
}

module.exports = ABTestingService;