/**
 * Comprehensive User Onboarding Service
 * 
 * Features:
 * - Intelligent step-by-step onboarding flow
 * - Personalized welcome experience
 * - Profile completion guidance
 * - Interest and preference discovery
 * - Location setup and privacy settings
 * - Photo upload assistance
 * - Matching preferences configuration
 * - Safety and guidelines education
 * - Gamified progress tracking
 * - Personalized recommendations
 * - Onboarding analytics and optimization
 */

const User = require('../models/User');
const PhotoVerificationService = require('./PhotoVerificationService');
const ContentModerationSystem = require('./ContentModerationSystem');
const SecurityFraudDetection = require('./SecurityFraudDetection');
const PushNotificationService = require('./PushNotificationService');

class OnboardingService {
  constructor() {
    this.photoService = new PhotoVerificationService();
    this.moderation = new ContentModerationSystem();
    this.security = new SecurityFraudDetection();
    this.pushService = new PushNotificationService();
    
    // Onboarding configuration
    this.onboardingSteps = [
      'welcome',
      'profile_basics',
      'photos',
      'interests',
      'preferences',
      'location',
      'safety',
      'matching',
      'notification_setup',
      'completion'
    ];
    
    // Step requirements and weights
    this.stepWeights = {
      welcome: { weight: 5, required: true },
      profile_basics: { weight: 20, required: true },
      photos: { weight: 25, required: true },
      interests: { weight: 15, required: true },
      preferences: { weight: 10, required: true },
      location: { weight: 10, required: true },
      safety: { weight: 5, required: true },
      matching: { weight: 5, required: false },
      notification_setup: { weight: 3, required: false },
      completion: { weight: 2, required: true }
    };
    
    // Personalization data
    this.interestCategories = [
      'sports', 'music', 'movies', 'travel', 'food', 'fitness', 'reading',
      'gaming', 'art', 'photography', 'cooking', 'dancing', 'hiking',
      'technology', 'fashion', 'pets', 'volunteering', 'meditation'
    ];
    
    this.personalityTraits = [
      'outgoing', 'introverted', 'adventurous', 'homebody', 'creative',
      'analytical', 'spontaneous', 'organized', 'optimistic', 'thoughtful'
    ];
  }

  /**
   * Initialize onboarding for a new user
   */
  async initializeOnboarding(userId, registrationData = {}) {
    try {
      console.log(`🎯 Initializing onboarding for user ${userId}`);
      
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create onboarding progress
      const onboardingData = {
        startedAt: new Date(),
        currentStep: 'welcome',
        completedSteps: [],
        progress: 0,
        personalityProfile: {},
        preferences: {},
        analyticsData: {
          registrationSource: registrationData.source || 'unknown',
          deviceType: registrationData.deviceType || 'unknown',
          startTime: new Date()
        },
        tips: [],
        recommendations: []
      };

      // Store onboarding data
      user.onboarding = onboardingData;
      await user.save();

      // Generate welcome experience
      const welcomeData = await this.generateWelcomeExperience(user, registrationData);

      console.log(`✅ Onboarding initialized for user ${userId}`);
      
      return {
        onboardingId: user.onboarding._id,
        currentStep: 'welcome',
        progress: 0,
        totalSteps: this.onboardingSteps.length,
        welcomeData,
        nextStepPreview: await this.getStepPreview('profile_basics')
      };

    } catch (error) {
      console.error('Onboarding initialization error:', error);
      throw error;
    }
  }

  /**
   * Complete a specific onboarding step
   */
  async completeOnboardingStep(userId, stepName, stepData) {
    try {
      console.log(`📝 Completing onboarding step: ${stepName} for user ${userId}`);
      
      const user = await User.findById(userId);
      if (!user || !user.onboarding) {
        throw new Error('Onboarding not found');
      }

      // Validate step
      if (!this.onboardingSteps.includes(stepName)) {
        throw new Error('Invalid onboarding step');
      }

      // Process step data based on step type
      const result = await this.processStepData(user, stepName, stepData);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          recommendations: result.recommendations || []
        };
      }

      // Mark step as completed
      if (!user.onboarding.completedSteps.includes(stepName)) {
        user.onboarding.completedSteps.push(stepName);
      }

      // Update progress
      user.onboarding.progress = this.calculateProgress(user.onboarding.completedSteps);
      
      // Determine next step
      const nextStep = this.getNextStep(user.onboarding.completedSteps);
      user.onboarding.currentStep = nextStep;

      // Update analytics
      user.onboarding.analyticsData.stepsCompleted = user.onboarding.completedSteps.length;
      user.onboarding.analyticsData.lastStepCompletedAt = new Date();

      // Save user data
      await user.save();

      // Generate response data
      const responseData = {
        success: true,
        stepCompleted: stepName,
        currentStep: nextStep,
        progress: user.onboarding.progress,
        isComplete: nextStep === 'completion',
        achievements: this.checkAchievements(user),
        nextStepPreview: nextStep ? await this.getStepPreview(nextStep) : null,
        personalizedTips: await this.generatePersonalizedTips(user)
      };

      // Send completion rewards/notifications
      if (nextStep === 'completion') {
        await this.handleOnboardingCompletion(user);
      }

      console.log(`✅ Step ${stepName} completed for user ${userId}. Next: ${nextStep}`);
      
      return responseData;

    } catch (error) {
      console.error('Onboarding step completion error:', error);
      throw error;
    }
  }

  /**
   * Process specific step data
   */
  async processStepData(user, stepName, stepData) {
    try {
      switch (stepName) {
        case 'welcome':
          return await this.processWelcomeStep(user, stepData);
        
        case 'profile_basics':
          return await this.processProfileBasicsStep(user, stepData);
        
        case 'photos':
          return await this.processPhotosStep(user, stepData);
        
        case 'interests':
          return await this.processInterestsStep(user, stepData);
        
        case 'preferences':
          return await this.processPreferencesStep(user, stepData);
        
        case 'location':
          return await this.processLocationStep(user, stepData);
        
        case 'safety':
          return await this.processSafetyStep(user, stepData);
        
        case 'matching':
          return await this.processMatchingStep(user, stepData);
        
        case 'notification_setup':
          return await this.processNotificationStep(user, stepData);
        
        case 'completion':
          return await this.processCompletionStep(user, stepData);
        
        default:
          throw new Error(`Unknown step: ${stepName}`);
      }
    } catch (error) {
      console.error(`Step processing error for ${stepName}:`, error);
      return {
        success: false,
        error: error.message,
        recommendations: [`Please check your ${stepName} information and try again`]
      };
    }
  }

  /**
   * Process welcome step
   */
  async processWelcomeStep(user, stepData) {
    const { acknowledgeTerms, privacyAccepted, ageConfirmed } = stepData;
    
    if (!acknowledgeTerms || !privacyAccepted || !ageConfirmed) {
      return {
        success: false,
        error: 'Please accept all terms and confirmations to continue'
      };
    }

    // Store acceptance data
    user.legal = {
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      privacyPolicyAccepted: true,
      privacyPolicyAcceptedAt: new Date(),
      ageConfirmed: true
    };

    return { success: true };
  }

  /**
   * Process profile basics step
   */
  async processProfileBasicsStep(user, stepData) {
    const { name, age, gender, bio, occupation, education } = stepData;
    
    // Validate required fields
    if (!name || !age || !gender) {
      return {
        success: false,
        error: 'Name, age, and gender are required',
        recommendations: ['Please fill in all required fields']
      };
    }

    // Age validation
    if (age < 18 || age > 100) {
      return {
        success: false,
        error: 'Age must be between 18 and 100',
        recommendations: ['Please enter a valid age']
      };
    }

    // Content moderation for bio
    if (bio) {
      const moderationResult = await this.moderation.moderateTextContent(bio, user._id, 'bio');
      if (moderationResult.action === 'block') {
        return {
          success: false,
          error: 'Bio contains inappropriate content',
          recommendations: ['Please revise your bio to remove inappropriate content']
        };
      }
    }

    // Update user profile
    user.profile = {
      ...user.profile,
      name: name.trim(),
      age: parseInt(age),
      gender,
      bio: bio ? bio.trim() : '',
      occupation: occupation ? occupation.trim() : '',
      education: education ? education.trim() : ''
    };

    return { success: true };
  }

  /**
   * Process photos step
   */
  async processPhotosStep(user, stepData) {
    const { photoAction, photoData } = stepData;
    
    if (photoAction === 'upload' && photoData) {
      // Handle photo upload through photo service
      try {
        const result = await this.photoService.manageProfilePhotos(user._id, 'add', photoData);
        return {
          success: true,
          data: result,
          recommendations: ['Great! Consider adding 2-3 more photos for better matches']
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          recommendations: ['Try a different photo with better lighting and quality']
        };
      }
    } else if (photoAction === 'skip') {
      // Allow skipping but warn about impact
      return {
        success: true,
        recommendations: [
          'Photos significantly increase your match potential',
          'You can add photos later from your profile settings'
        ]
      };
    }

    return {
      success: false,
      error: 'Invalid photo action',
      recommendations: ['Please upload a photo or skip this step']
    };
  }

  /**
   * Process interests step
   */
  async processInterestsStep(user, stepData) {
    const { interests, hobbies, lifestyle } = stepData;
    
    if (!interests || !Array.isArray(interests) || interests.length < 3) {
      return {
        success: false,
        error: 'Please select at least 3 interests',
        recommendations: ['Interests help us find better matches for you']
      };
    }

    // Validate interests against allowed categories
    const validInterests = interests.filter(interest => 
      this.interestCategories.includes(interest)
    );

    if (validInterests.length < 3) {
      return {
        success: false,
        error: 'Please select valid interests from the provided options'
      };
    }

    // Update user interests
    user.profile.interests = validInterests;
    user.profile.hobbies = hobbies || [];
    user.profile.lifestyle = lifestyle || {};

    // Build personality profile
    user.onboarding.personalityProfile.interests = this.analyzeInterestPersonality(validInterests);

    return {
      success: true,
      recommendations: ['Great choices! These will help us find compatible matches']
    };
  }

  /**
   * Process preferences step
   */
  async processPreferencesStep(user, stepData) {
    const { ageRange, genderPreference, maxDistance, dealBreakers } = stepData;
    
    // Validate age range
    if (!ageRange || !ageRange.min || !ageRange.max) {
      return {
        success: false,
        error: 'Please specify your age preference range'
      };
    }

    if (ageRange.min < 18 || ageRange.max > 100 || ageRange.min > ageRange.max) {
      return {
        success: false,
        error: 'Please enter a valid age range'
      };
    }

    // Update preferences
    user.profile.agePreference = ageRange;
    user.profile.genderPreference = genderPreference || 'all';
    user.profile.maxDistance = maxDistance || 50;
    user.profile.dealBreakers = dealBreakers || [];

    return { success: true };
  }

  /**
   * Process location step
   */
  async processLocationStep(user, stepData) {
    const { location, allowLocationSharing, locationPrivacy } = stepData;
    
    if (!location || !location.coordinates) {
      return {
        success: false,
        error: 'Location is required for matching',
        recommendations: ['We need your location to find nearby matches']
      };
    }

    // Update location
    user.profile.location = {
      type: 'Point',
      coordinates: location.coordinates,
      city: location.city,
      state: location.state,
      country: location.country
    };

    // Update privacy settings
    user.privacy = {
      ...user.privacy,
      locationSharing: allowLocationSharing,
      locationPrivacy: locationPrivacy || 'approximate'
    };

    return { success: true };
  }

  /**
   * Process safety step
   */
  async processSafetyStep(user, stepData) {
    const { safetyAcknowledged, reportingUnderstood, blockingUnderstood } = stepData;
    
    if (!safetyAcknowledged || !reportingUnderstood || !blockingUnderstood) {
      return {
        success: false,
        error: 'Please acknowledge all safety guidelines'
      };
    }

    user.safety = {
      guidelinesAcknowledged: true,
      acknowledgedAt: new Date(),
      reportingUnderstood: true,
      blockingUnderstood: true
    };

    return { success: true };
  }

  /**
   * Process matching step
   */
  async processMatchingStep(user, stepData) {
    const { matchingStyle, activityPreference, communicationStyle } = stepData;
    
    user.matching = {
      style: matchingStyle || 'balanced',
      activityPreference: activityPreference || 'mixed',
      communicationStyle: communicationStyle || 'casual'
    };

    return { success: true };
  }

  /**
   * Process notification setup step
   */
  async processNotificationStep(user, stepData) {
    const { pushNotifications, emailNotifications, notificationTypes } = stepData;
    
    user.notifications = {
      push: pushNotifications || {},
      email: emailNotifications || {},
      types: notificationTypes || {}
    };

    // Register for push notifications if enabled
    if (pushNotifications?.enabled && stepData.deviceToken) {
      await this.pushService.registerDeviceToken(
        user._id, 
        stepData.deviceToken, 
        stepData.platform || 'ios'
      );
    }

    return { success: true };
  }

  /**
   * Process completion step
   */
  async processCompletionStep(user, stepData) {
    user.onboarding.completedAt = new Date();
    user.onboarding.isComplete = true;
    user.status = 'active'; // Activate user account
    
    return { success: true };
  }

  /**
   * Generate welcome experience
   */
  async generateWelcomeExperience(user, registrationData) {
    return {
      welcomeMessage: `Welcome to OneTime, ${user.profile?.name || 'there'}! 🎉`,
      personalizedIntro: this.generatePersonalizedIntro(registrationData),
      quickStats: {
        totalUsers: '50,000+',
        averageMatches: '15 per week',
        successRate: '89%'
      },
      featuresHighlight: [
        'AI-powered matching',
        'Real-time activities',
        'Verified profiles',
        'Safe and secure'
      ]
    };
  }

  /**
   * Get preview data for next step
   */
  async getStepPreview(stepName) {
    const previews = {
      profile_basics: {
        title: 'Tell us about yourself',
        description: 'Share your basic information to create your profile',
        fields: ['name', 'age', 'gender', 'bio'],
        estimatedTime: '2 minutes'
      },
      photos: {
        title: 'Add your photos',
        description: 'Upload photos to show your personality',
        fields: ['primary_photo', 'additional_photos'],
        estimatedTime: '3 minutes'
      },
      interests: {
        title: 'What do you enjoy?',
        description: 'Select interests that represent you',
        fields: ['interests', 'hobbies'],
        estimatedTime: '2 minutes'
      },
      preferences: {
        title: 'Matching preferences',
        description: 'Tell us who you\'d like to meet',
        fields: ['age_range', 'distance', 'deal_breakers'],
        estimatedTime: '2 minutes'
      }
    };

    return previews[stepName] || null;
  }

  /**
   * Calculate onboarding progress
   */
  calculateProgress(completedSteps) {
    let totalWeight = 0;
    let completedWeight = 0;

    for (const step of this.onboardingSteps) {
      const weight = this.stepWeights[step]?.weight || 0;
      totalWeight += weight;
      
      if (completedSteps.includes(step)) {
        completedWeight += weight;
      }
    }

    return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  }

  /**
   * Get next step in onboarding flow
   */
  getNextStep(completedSteps) {
    for (const step of this.onboardingSteps) {
      if (!completedSteps.includes(step)) {
        return step;
      }
    }
    return 'completion';
  }

  /**
   * Check for onboarding achievements
   */
  checkAchievements(user) {
    const achievements = [];
    
    if (user.profile?.photos?.length >= 1) {
      achievements.push({
        id: 'first_photo',
        title: 'Picture Perfect',
        description: 'Added your first photo',
        icon: '📸'
      });
    }
    
    if (user.profile?.interests?.length >= 5) {
      achievements.push({
        id: 'interest_explorer',
        title: 'Interest Explorer',
        description: 'Selected 5+ interests',
        icon: '🎯'
      });
    }
    
    if (user.onboarding?.progress >= 50) {
      achievements.push({
        id: 'halfway_hero',
        title: 'Halfway Hero',
        description: 'Completed 50% of onboarding',
        icon: '🏃‍♂️'
      });
    }

    return achievements;
  }

  /**
   * Generate personalized tips
   */
  async generatePersonalizedTips(user) {
    const tips = [];
    
    if (!user.profile?.photos?.length) {
      tips.push('Add photos to increase your match rate by 10x!');
    }
    
    if (!user.profile?.bio) {
      tips.push('A thoughtful bio helps others understand your personality');
    }
    
    if (user.profile?.interests?.length < 5) {
      tips.push('More interests lead to better conversation starters');
    }

    return tips;
  }

  /**
   * Handle onboarding completion
   */
  async handleOnboardingCompletion(user) {
    try {
      // Send completion notification
      await this.pushService.sendNotificationToUser(
        user._id,
        'onboarding_complete',
        { userName: user.profile.name }
      );

      // Calculate profile completeness
      const completeness = this.calculateProfileCompleteness(user);
      
      // Update user status
      user.profile.completeness = completeness;
      user.profile.completedOnboardingAt = new Date();
      
      console.log(`🎉 Onboarding completed for user ${user._id} - ${completeness}% profile completeness`);
      
    } catch (error) {
      console.error('Onboarding completion handling error:', error);
    }
  }

  /**
   * Calculate profile completeness
   */
  calculateProfileCompleteness(user) {
    let score = 0;
    const profile = user.profile;
    
    // Basic info (40 points)
    if (profile.name) score += 10;
    if (profile.age) score += 10;
    if (profile.bio && profile.bio.length >= 50) score += 20;
    
    // Photos (30 points)
    if (profile.photos?.length >= 1) score += 15;
    if (profile.photos?.length >= 3) score += 15;
    
    // Interests (20 points)
    if (profile.interests?.length >= 3) score += 10;
    if (profile.interests?.length >= 6) score += 10;
    
    // Preferences (10 points)
    if (profile.agePreference) score += 5;
    if (profile.maxDistance) score += 5;

    return Math.min(score, 100);
  }

  /**
   * Get onboarding status for user
   */
  async getOnboardingStatus(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.onboarding) {
        return {
          status: 'not_started',
          canStartOnboarding: true
        };
      }

      return {
        status: user.onboarding.isComplete ? 'completed' : 'in_progress',
        currentStep: user.onboarding.currentStep,
        progress: user.onboarding.progress,
        completedSteps: user.onboarding.completedSteps,
        totalSteps: this.onboardingSteps.length,
        achievements: this.checkAchievements(user),
        nextStepPreview: await this.getStepPreview(user.onboarding.currentStep)
      };

    } catch (error) {
      console.error('Get onboarding status error:', error);
      throw error;
    }
  }

  // Helper methods
  generatePersonalizedIntro(registrationData) {
    const intros = [
      "Ready to find meaningful connections?",
      "Your dating adventure starts here!",
      "Let's create your perfect profile together",
      "Welcome to a smarter way to date!"
    ];
    
    return intros[Math.floor(Math.random() * intros.length)];
  }

  analyzeInterestPersonality(interests) {
    const analysis = {
      adventurous: 0,
      creative: 0,
      social: 0,
      intellectual: 0,
      active: 0
    };

    const mappings = {
      travel: ['adventurous'],
      hiking: ['adventurous', 'active'],
      sports: ['active', 'social'],
      art: ['creative'],
      reading: ['intellectual'],
      music: ['creative', 'social'],
      photography: ['creative'],
      cooking: ['creative'],
      gaming: ['intellectual'],
      fitness: ['active']
    };

    interests.forEach(interest => {
      const traits = mappings[interest] || [];
      traits.forEach(trait => {
        if (analysis[trait] !== undefined) {
          analysis[trait]++;
        }
      });
    });

    return analysis;
  }
}

module.exports = OnboardingService;