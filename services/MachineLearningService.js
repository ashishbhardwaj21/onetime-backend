/**
 * Machine Learning Service
 * Handles ML model training, prediction, and optimization
 */

const tf = require('@tensorflow/tfjs-node');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const User = require('../models/User');
const Interaction = require('../models/Interaction');
const Match = require('../models/Match');

class MachineLearningService {
  constructor() {
    this.models = new Map();
    this.modelConfigs = {
      userCompatibility: {
        inputShape: [50],
        hiddenLayers: [128, 64, 32],
        outputShape: 1,
        activation: 'sigmoid',
        loss: 'binaryCrossentropy',
        optimizer: 'adam',
        metrics: ['accuracy']
      },
      activityRecommendation: {
        inputShape: [30],
        hiddenLayers: [64, 32, 16],
        outputShape: 1,
        activation: 'linear',
        loss: 'meanSquaredError',
        optimizer: 'adam',
        metrics: ['mae']
      },
      churnPrediction: {
        inputShape: [25],
        hiddenLayers: [64, 32],
        outputShape: 1,
        activation: 'sigmoid',
        loss: 'binaryCrossentropy',
        optimizer: 'adam',
        metrics: ['accuracy', 'precision', 'recall']
      },
      engagementScoring: {
        inputShape: [35],
        hiddenLayers: [96, 48, 24],
        outputShape: 5,
        activation: 'softmax',
        loss: 'categoricalCrossentropy',
        optimizer: 'adam',
        metrics: ['accuracy']
      }
    };
    
    this.trainingData = new Map();
    this.modelPerformance = new Map();
    this.initialize();
  }

  async initialize() {
    try {
      await this.loadOrCreateModels();
      await this.loadTrainingData();
      logger.info('Machine Learning Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ML service:', error);
    }
  }

  async loadOrCreateModels() {
    const modelDir = path.join(__dirname, '../ml-models');
    
    // Ensure models directory exists
    try {
      await fs.mkdir(modelDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    for (const [modelName, config] of Object.entries(this.modelConfigs)) {
      try {
        const modelPath = path.join(modelDir, `${modelName}/model.json`);
        
        try {
          // Try to load existing model
          const model = await tf.loadLayersModel(`file://${modelPath}`);
          this.models.set(modelName, model);
          logger.info(`Loaded existing model: ${modelName}`);
        } catch (loadError) {
          // Create new model if loading fails
          const model = this.createModel(config);
          this.models.set(modelName, model);
          
          // Save the new model
          await model.save(`file://${path.join(modelDir, modelName)}`);
          logger.info(`Created new model: ${modelName}`);
        }
      } catch (error) {
        logger.error(`Error with model ${modelName}:`, error);
      }
    }
  }

  createModel(config) {
    const { inputShape, hiddenLayers, outputShape, activation, loss, optimizer, metrics } = config;
    
    const layers = [];
    
    // Input layer
    layers.push(tf.layers.dense({
      inputShape,
      units: hiddenLayers[0],
      activation: 'relu'
    }));
    
    // Hidden layers with dropout
    for (let i = 0; i < hiddenLayers.length; i++) {
      if (i > 0) {
        layers.push(tf.layers.dense({
          units: hiddenLayers[i],
          activation: 'relu'
        }));
      }
      
      // Add dropout for regularization
      if (i < hiddenLayers.length - 1) {
        layers.push(tf.layers.dropout({ rate: 0.2 }));
      }
    }
    
    // Output layer
    layers.push(tf.layers.dense({
      units: outputShape,
      activation
    }));
    
    const model = tf.sequential({ layers });
    
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss,
      metrics
    });
    
    return model;
  }

  async loadTrainingData() {
    // Load historical interaction data for training
    const interactions = await Interaction.find({
      type: { $in: ['like', 'pass', 'match', 'message_sent'] },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    }).populate('userId targetUserId').lean();

    this.trainingData.set('interactions', interactions);
    logger.info(`Loaded ${interactions.length} interactions for training`);
  }

  async predictUserCompatibility(user1Id, user2Id) {
    try {
      const model = this.models.get('userCompatibility');
      if (!model) {
        throw new Error('User compatibility model not loaded');
      }

      const user1 = await User.findById(user1Id).lean();
      const user2 = await User.findById(user2Id).lean();
      
      if (!user1 || !user2) {
        throw new Error('User(s) not found');
      }

      const features = await this.extractUserCompatibilityFeatures(user1, user2);
      const featureTensor = tf.tensor2d([features]);
      
      const prediction = await model.predict(featureTensor).data();
      featureTensor.dispose();
      
      return {
        compatibility: prediction[0],
        confidence: this.calculatePredictionConfidence(features),
        features: this.getFeatureImportance(features)
      };
    } catch (error) {
      logger.error('Error predicting user compatibility:', error);
      throw error;
    }
  }

  async predictActivityEngagement(userId, activityId) {
    try {
      const model = this.models.get('activityRecommendation');
      if (!model) {
        throw new Error('Activity recommendation model not loaded');
      }

      const user = await User.findById(userId).lean();
      const activity = await Activity.findById(activityId).lean();
      
      if (!user || !activity) {
        throw new Error('User or activity not found');
      }

      const features = await this.extractActivityEngagementFeatures(user, activity);
      const featureTensor = tf.tensor2d([features]);
      
      const prediction = await model.predict(featureTensor).data();
      featureTensor.dispose();
      
      return {
        engagementScore: prediction[0],
        likelihood: this.scoreToLikelihood(prediction[0]),
        reasons: this.generateEngagementReasons(features, prediction[0])
      };
    } catch (error) {
      logger.error('Error predicting activity engagement:', error);
      throw error;
    }
  }

  async predictChurnRisk(userId) {
    try {
      const model = this.models.get('churnPrediction');
      if (!model) {
        throw new Error('Churn prediction model not loaded');
      }

      const user = await User.findById(userId).lean();
      if (!user) {
        throw new Error('User not found');
      }

      const features = await this.extractChurnFeatures(user);
      const featureTensor = tf.tensor2d([features]);
      
      const prediction = await model.predict(featureTensor).data();
      featureTensor.dispose();
      
      const churnRisk = prediction[0];
      let riskLevel = 'low';
      if (churnRisk > 0.7) riskLevel = 'high';
      else if (churnRisk > 0.4) riskLevel = 'medium';
      
      return {
        churnRisk,
        riskLevel,
        interventions: this.suggestChurnInterventions(riskLevel, features),
        factors: this.identifyChurnFactors(features, churnRisk)
      };
    } catch (error) {
      logger.error('Error predicting churn risk:', error);
      throw error;
    }
  }

  async scoreUserEngagement(userId) {
    try {
      const model = this.models.get('engagementScoring');
      if (!model) {
        throw new Error('Engagement scoring model not loaded');
      }

      const user = await User.findById(userId).lean();
      if (!user) {
        throw new Error('User not found');
      }

      const features = await this.extractEngagementFeatures(user);
      const featureTensor = tf.tensor2d([features]);
      
      const prediction = await model.predict(featureTensor).data();
      featureTensor.dispose();
      
      // Convert softmax output to engagement categories
      const categories = ['very_low', 'low', 'medium', 'high', 'very_high'];
      const maxIndex = prediction.indexOf(Math.max(...prediction));
      
      return {
        level: categories[maxIndex],
        score: prediction[maxIndex],
        distribution: categories.reduce((acc, cat, index) => {
          acc[cat] = prediction[index];
          return acc;
        }, {}),
        recommendations: this.generateEngagementRecommendations(categories[maxIndex])
      };
    } catch (error) {
      logger.error('Error scoring user engagement:', error);
      throw error;
    }
  }

  async trainUserCompatibilityModel() {
    try {
      logger.info('Starting user compatibility model training...');
      
      const model = this.models.get('userCompatibility');
      const trainingData = await this.prepareCompatibilityTrainingData();
      
      if (trainingData.features.length === 0) {
        logger.warn('No training data available for user compatibility model');
        return false;
      }

      const xs = tf.tensor2d(trainingData.features);
      const ys = tf.tensor2d(trainingData.labels, [trainingData.labels.length, 1]);
      
      // Split data into training and validation sets
      const splitIndex = Math.floor(trainingData.features.length * 0.8);
      const xTrain = xs.slice([0, 0], [splitIndex, -1]);
      const yTrain = ys.slice([0, 0], [splitIndex, -1]);
      const xVal = xs.slice([splitIndex, 0], [-1, -1]);
      const yVal = ys.slice([splitIndex, 0], [-1, -1]);

      const history = await model.fit(xTrain, yTrain, {
        epochs: 50,
        batchSize: 32,
        validationData: [xVal, yVal],
        callbacks: [
          tf.callbacks.earlyStopping({ patience: 10 }),
          tf.callbacks.reduceLROnPlateau({ patience: 5 })
        ]
      });

      // Clean up tensors
      xs.dispose();
      ys.dispose();
      xTrain.dispose();
      yTrain.dispose();
      xVal.dispose();
      yVal.dispose();

      // Save the trained model
      const modelPath = path.join(__dirname, '../ml-models/userCompatibility');
      await model.save(`file://${modelPath}`);
      
      const finalLoss = history.history.loss[history.history.loss.length - 1];
      const finalAccuracy = history.history.acc[history.history.acc.length - 1];
      
      this.modelPerformance.set('userCompatibility', {
        loss: finalLoss,
        accuracy: finalAccuracy,
        trainedAt: new Date(),
        epochs: history.history.loss.length
      });

      logger.info(`User compatibility model trained successfully. Loss: ${finalLoss}, Accuracy: ${finalAccuracy}`);
      return true;
    } catch (error) {
      logger.error('Error training user compatibility model:', error);
      return false;
    }
  }

  async prepareCompatibilityTrainingData() {
    const interactions = this.trainingData.get('interactions') || [];
    const features = [];
    const labels = [];

    for (const interaction of interactions) {
      if (!interaction.userId || !interaction.targetUserId) continue;

      try {
        const userFeatures = await this.extractUserCompatibilityFeatures(
          interaction.userId, 
          interaction.targetUserId
        );
        
        const label = interaction.type === 'like' || interaction.type === 'match' ? 1 : 0;
        
        features.push(userFeatures);
        labels.push(label);
      } catch (error) {
        logger.warn('Error preparing training sample:', error);
      }
    }

    return { features, labels };
  }

  async extractUserCompatibilityFeatures(user1, user2) {
    const features = new Array(50).fill(0);
    let index = 0;

    // Age features
    const age1 = user1.profile?.age || 25;
    const age2 = user2.profile?.age || 25;
    features[index++] = Math.abs(age1 - age2) / 20; // Normalized age difference
    features[index++] = (age1 + age2) / 2 / 50; // Average age normalized
    
    // Location features
    if (user1.profile?.location?.coordinates && user2.profile?.location?.coordinates) {
      const distance = this.calculateDistance(
        user1.profile.location.coordinates,
        user2.profile.location.coordinates
      );
      features[index++] = Math.min(distance / 100, 1); // Normalized distance
      features[index++] = user1.profile.location.city === user2.profile.location.city ? 1 : 0;
    } else {
      features[index++] = 0.5; // Unknown distance
      features[index++] = 0; // Different cities
    }

    // Interest overlap
    const interests1 = user1.interests || [];
    const interests2 = user2.interests || [];
    const commonInterests = interests1.filter(i => interests2.includes(i));
    features[index++] = commonInterests.length / Math.max(interests1.length, interests2.length, 1);
    features[index++] = commonInterests.length / 10; // Absolute count normalized

    // Profile completeness
    features[index++] = this.calculateProfileCompleteness(user1);
    features[index++] = this.calculateProfileCompleteness(user2);

    // Education level similarity
    const education1 = user1.profile?.education || 'unknown';
    const education2 = user2.profile?.education || 'unknown';
    features[index++] = education1 === education2 ? 1 : 0;

    // Activity level
    features[index++] = user1.profile?.activityLevel || 0.5;
    features[index++] = user2.profile?.activityLevel || 0.5;

    // Subscription status
    features[index++] = user1.subscription?.tier === 'premium' ? 1 : 0;
    features[index++] = user2.subscription?.tier === 'premium' ? 1 : 0;

    // Photo count
    features[index++] = Math.min((user1.photos?.length || 0) / 5, 1);
    features[index++] = Math.min((user2.photos?.length || 0) / 5, 1);

    // Account age (days since registration)
    const accountAge1 = (Date.now() - user1.createdAt) / (1000 * 60 * 60 * 24);
    const accountAge2 = (Date.now() - user2.createdAt) / (1000 * 60 * 60 * 24);
    features[index++] = Math.min(accountAge1 / 365, 1); // Normalized to years
    features[index++] = Math.min(accountAge2 / 365, 1);

    // Last activity (days ago)
    const lastActive1 = (Date.now() - user1.lastActive) / (1000 * 60 * 60 * 24);
    const lastActive2 = (Date.now() - user2.lastActive) / (1000 * 60 * 60 * 24);
    features[index++] = Math.min(lastActive1 / 30, 1); // Normalized to months
    features[index++] = Math.min(lastActive2 / 30, 1);

    // Fill remaining features with relevant data or zeros
    while (index < 50) {
      features[index++] = 0;
    }

    return features;
  }

  async extractActivityEngagementFeatures(user, activity) {
    const features = new Array(30).fill(0);
    let index = 0;

    // User interests vs activity tags
    const userInterests = user.interests || [];
    const activityTags = activity.tags || [];
    const interestMatch = userInterests.filter(i => activityTags.includes(i)).length;
    features[index++] = interestMatch / Math.max(userInterests.length, 1);

    // Activity category preference
    const userActivityHistory = await this.getUserActivityHistory(user._id);
    const categoryHistory = userActivityHistory.filter(a => a.category === activity.category);
    features[index++] = categoryHistory.length / Math.max(userActivityHistory.length, 1);

    // Distance to activity
    if (user.profile?.location?.coordinates && activity.location?.coordinates) {
      const distance = this.calculateDistance(
        user.profile.location.coordinates,
        activity.location.coordinates
      );
      features[index++] = Math.min(distance / 50, 1);
    } else {
      features[index++] = 0.5;
    }

    // Time preference
    const activityHour = new Date(activity.dateTime).getHours();
    const userPreferredHours = await this.getUserPreferredHours(user._id);
    features[index++] = userPreferredHours.includes(activityHour) ? 1 : 0;

    // Group size preference
    const currentParticipants = activity.participants?.length || 0;
    const maxParticipants = activity.maxParticipants || 10;
    features[index++] = currentParticipants / maxParticipants;

    // Activity popularity
    features[index++] = Math.min(currentParticipants / 20, 1);

    // User's social level
    features[index++] = user.profile?.socialLevel || 0.5;

    // Fill remaining features
    while (index < 30) {
      features[index++] = 0;
    }

    return features;
  }

  async extractChurnFeatures(user) {
    const features = new Array(25).fill(0);
    let index = 0;

    // Days since last login
    const daysSinceLogin = (Date.now() - user.lastActive) / (1000 * 60 * 60 * 24);
    features[index++] = Math.min(daysSinceLogin / 30, 1);

    // Profile completeness
    features[index++] = this.calculateProfileCompleteness(user);

    // Number of matches
    const matches = await Match.countDocuments({
      $or: [{ user1: user._id }, { user2: user._id }]
    });
    features[index++] = Math.min(matches / 50, 1);

    // Message activity
    const recentMessages = await Interaction.countDocuments({
      userId: user._id,
      type: 'message_sent',
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    features[index++] = Math.min(recentMessages / 20, 1);

    // Subscription status
    features[index++] = user.subscription?.tier === 'premium' ? 1 : 0;

    // Photo count
    features[index++] = Math.min((user.photos?.length || 0) / 5, 1);

    // Account age
    const accountAge = (Date.now() - user.createdAt) / (1000 * 60 * 60 * 24);
    features[index++] = Math.min(accountAge / 365, 1);

    // Fill remaining features
    while (index < 25) {
      features[index++] = 0;
    }

    return features;
  }

  async extractEngagementFeatures(user) {
    const features = new Array(35).fill(0);
    let index = 0;

    // Recent activity
    const recentInteractions = await Interaction.countDocuments({
      userId: user._id,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    features[index++] = Math.min(recentInteractions / 50, 1);

    // Session frequency
    const sessions = await Interaction.countDocuments({
      userId: user._id,
      type: 'session_start',
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    features[index++] = Math.min(sessions / 14, 1); // Max 2 sessions per day

    // Profile interactions
    const profileViews = await Interaction.countDocuments({
      userId: user._id,
      type: 'view_profile',
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    features[index++] = Math.min(profileViews / 30, 1);

    // Add more engagement features...
    while (index < 35) {
      features[index++] = 0;
    }

    return features;
  }

  // Helper methods
  calculateDistance(coords1, coords2) {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(coords2[1] - coords1[1]);
    const dLon = this.toRadians(coords2[0] - coords1[0]);
    const lat1 = this.toRadians(coords1[1]);
    const lat2 = this.toRadians(coords2[1]);

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  calculateProfileCompleteness(user) {
    const fields = ['name', 'age', 'bio', 'location', 'interests', 'photos'];
    let completed = 0;
    
    fields.forEach(field => {
      if (field === 'photos') {
        if (user.photos && user.photos.length > 0) completed++;
      } else if (field === 'interests') {
        if (user.interests && user.interests.length > 0) completed++;
      } else if (user.profile && user.profile[field]) {
        completed++;
      }
    });
    
    return completed / fields.length;
  }

  calculatePredictionConfidence(features) {
    // Simple confidence calculation based on feature completeness
    const nonZeroFeatures = features.filter(f => f !== 0).length;
    return Math.min(nonZeroFeatures / features.length, 1);
  }

  getFeatureImportance(features) {
    // Simplified feature importance (in practice, this would use model interpretability techniques)
    return {
      location: features[2] || 0,
      interests: features[4] || 0,
      age: features[0] || 0,
      profile_completeness: features[6] || 0
    };
  }

  scoreToLikelihood(score) {
    if (score > 0.8) return 'very_high';
    if (score > 0.6) return 'high';
    if (score > 0.4) return 'medium';
    if (score > 0.2) return 'low';
    return 'very_low';
  }

  generateEngagementReasons(features, score) {
    const reasons = [];
    if (features[0] > 0.8) reasons.push('Strong interest alignment');
    if (features[2] < 0.3) reasons.push('Close proximity');
    if (features[4] > 0.7) reasons.push('Popular activity');
    return reasons;
  }

  suggestChurnInterventions(riskLevel, features) {
    const interventions = [];
    
    switch (riskLevel) {
      case 'high':
        interventions.push('Send personalized re-engagement email');
        interventions.push('Offer premium features trial');
        interventions.push('Provide customer support outreach');
        break;
      case 'medium':
        interventions.push('Show better recommendations');
        interventions.push('Send activity suggestions');
        interventions.push('Improve onboarding experience');
        break;
      default:
        interventions.push('Continue current engagement strategy');
    }
    
    return interventions;
  }

  identifyChurnFactors(features, churnRisk) {
    const factors = [];
    if (features[0] > 0.5) factors.push('Low login frequency');
    if (features[1] < 0.5) factors.push('Incomplete profile');
    if (features[2] < 0.3) factors.push('Few matches');
    return factors;
  }

  generateEngagementRecommendations(level) {
    const recommendations = {
      very_low: ['Complete your profile', 'Upload more photos', 'Try new activities'],
      low: ['Improve your bio', 'Be more active in messaging', 'Join group activities'],
      medium: ['Engage with recommendations', 'Try premium features', 'Attend events'],
      high: ['Share your experiences', 'Refer friends', 'Provide feedback'],
      very_high: ['Become a community leader', 'Organize activities', 'Mentor new users']
    };
    
    return recommendations[level] || recommendations.medium;
  }

  async getUserActivityHistory(userId) {
    return await Interaction.find({
      userId,
      type: 'activity_join'
    }).populate('targetActivityId').lean();
  }

  async getUserPreferredHours(userId) {
    const interactions = await Interaction.find({
      userId,
      'timing.timeOfDay': { $exists: true }
    }).lean();
    
    const hourCounts = {};
    interactions.forEach(interaction => {
      const hour = new Date(interaction.createdAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    const avgCount = Object.values(hourCounts).reduce((a, b) => a + b, 0) / 24;
    return Object.keys(hourCounts)
      .filter(hour => hourCounts[hour] > avgCount)
      .map(Number);
  }

  async getModelPerformance(modelName) {
    return this.modelPerformance.get(modelName);
  }

  async updateModelWithFeedback(modelName, feedback) {
    // Implement online learning with user feedback
    logger.info(`Updating ${modelName} with feedback:`, feedback);
    // This would implement incremental learning
  }
}

module.exports = new MachineLearningService();