const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Match = require('../models/Match');
const { auth, requireEmailVerification } = require('../middleware/auth');
const logger = require('../utils/logger');
const geolib = require('geolib');

const router = express.Router();

// Get users for discovery
router.get('/users', auth, requireEmailVerification, [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('minAge').optional().isInt({ min: 18, max: 100 }),
  query('maxAge').optional().isInt({ min: 18, max: 100 }),
  query('maxDistance').optional().isFloat({ min: 1, max: 100 }),
  query('interests').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const {
      limit = 10,
      minAge,
      maxAge,
      maxDistance,
      interests
    } = req.query;

    const currentUser = req.user;
    
    // Build discovery query
    const query = {
      _id: { $ne: currentUser._id },
      'settings.discovery.enabled': true
    };

    // Apply user's preferences
    if (currentUser.profile.agePreference) {
      query['profile.age'] = {
        $gte: currentUser.profile.agePreference.min || 18,
        $lte: currentUser.profile.agePreference.max || 100
      };
    }

    // Apply query filters
    if (minAge || maxAge) {
      query['profile.age'] = {
        ...query['profile.age'],
        ...(minAge && { $gte: parseInt(minAge) }),
        ...(maxAge && { $lte: parseInt(maxAge) })
      };
    }

    // Apply gender preference
    if (currentUser.profile.genderPreference && currentUser.profile.genderPreference.length > 0) {
      query['profile.gender'] = { $in: currentUser.profile.genderPreference };
    }

    // Apply location filtering
    const distanceLimit = maxDistance 
      ? parseFloat(maxDistance) 
      : currentUser.profile.distancePreference || 25;

    if (currentUser.profile.location && currentUser.profile.location.coordinates) {
      query['profile.location'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: currentUser.profile.location.coordinates
          },
          $maxDistance: distanceLimit * 1000 // Convert km to meters
        }
      };
    }

    // Apply interests filtering
    if (interests) {
      const interestArray = interests.split(',').map(i => i.trim());
      query['profile.interests'] = { $in: interestArray };
    }

    // Get users that haven't been swiped on yet
    const swipedUserIds = await Match.find({
      $or: [
        { user1: currentUser._id },
        { user2: currentUser._id }
      ]
    }).distinct('user1 user2').then(ids => 
      ids.filter(id => id.toString() !== currentUser._id.toString())
    );

    if (swipedUserIds.length > 0) {
      query._id = { $nin: [...swipedUserIds, currentUser._id] };
    }

    // Find potential matches
    const users = await User.find(query)
      .select('profile')
      .limit(parseInt(limit))
      .lean();

    // Calculate compatibility scores and distances
    const enhancedUsers = users.map(user => {
      const compatibility = calculateCompatibility(currentUser, user);
      const distance = calculateDistance(currentUser.profile.location, user.profile.location);
      
      return {
        ...user,
        compatibility,
        distance: Math.round(distance * 10) / 10 // Round to 1 decimal
      };
    });

    // Sort by compatibility score (highest first)
    enhancedUsers.sort((a, b) => b.compatibility.score - a.compatibility.score);

    logger.info('Discovery users fetched', {
      userId: currentUser._id,
      queryFilters: req.query,
      resultCount: enhancedUsers.length
    });

    res.json({
      success: true,
      data: {
        users: enhancedUsers,
        totalCount: enhancedUsers.length,
        hasMore: enhancedUsers.length === parseInt(limit)
      }
    });

  } catch (error) {
    logger.error('Discovery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch discovery users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Swipe on a user
router.post('/swipe', auth, requireEmailVerification, [
  body('userId').isMongoId().withMessage('Valid user ID required'),
  body('action').isIn(['like', 'pass', 'super_like']).withMessage('Invalid swipe action')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { userId, action } = req.body;
    const currentUser = req.user;

    // Can't swipe on yourself
    if (userId === currentUser._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot swipe on yourself'
      });
    }

    // Check if target user exists and discovery is enabled
    const targetUser = await User.findById(userId);
    if (!targetUser || !targetUser.settings.discovery.enabled) {
      return res.status(404).json({
        success: false,
        message: 'User not found or not available for discovery'
      });
    }

    // Check if already swiped
    const existingMatch = await Match.findExistingSwipe(currentUser._id, userId);
    if (existingMatch) {
      return res.status(400).json({
        success: false,
        message: 'Already swiped on this user'
      });
    }

    // Create new match record
    const match = new Match({
      user1: currentUser._id,
      user2: userId,
      user1Action: action,
      user2Action: 'pending'
    });

    // Calculate compatibility score
    const compatibility = calculateCompatibility(currentUser, targetUser);
    match.compatibility = compatibility;

    await match.save();

    // Update user analytics
    await User.findByIdAndUpdate(currentUser._id, {
      $inc: { 'analytics.totalSwipes': 1 }
    });

    // Check if this creates a mutual match
    let isMatch = false;
    let conversation = null;

    // Check if the other user has already liked this user
    const reverseMatch = await Match.findOne({
      user1: userId,
      user2: currentUser._id,
      user1Action: { $in: ['like', 'super_like'] }
    });

    if (reverseMatch && action === 'like') {
      // It's a match! Update both records
      match.user2Action = reverseMatch.user1Action;
      match.mutual = true;
      match.matchedAt = new Date();
      await match.save();

      // Remove the reverse match since we now have the mutual match
      await Match.findByIdAndDelete(reverseMatch._id);

      // Create conversation
      const Conversation = require('../models/Conversation');
      conversation = new Conversation({
        matchId: match._id,
        participants: [currentUser._id, userId]
      });
      await conversation.save();

      match.conversationId = conversation._id;
      await match.save();

      // Update match analytics
      await User.updateMany(
        { _id: { $in: [currentUser._id, userId] } },
        { $inc: { 'analytics.totalMatches': 1 } }
      );

      isMatch = true;

      logger.info('New match created', {
        user1: currentUser._id,
        user2: userId,
        matchId: match._id
      });
    }

    res.json({
      success: true,
      data: {
        isMatch,
        matchId: isMatch ? match._id : null,
        conversationId: isMatch ? conversation._id : null,
        compatibility: compatibility.score
      }
    });

  } catch (error) {
    logger.error('Swipe error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process swipe',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Report a user
router.post('/report', auth, requireEmailVerification, [
  body('userId').isMongoId().withMessage('Valid user ID required'),
  body('reason').isIn(['inappropriate', 'spam', 'fake', 'harassment', 'other']).withMessage('Invalid report reason'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { userId, reason, description } = req.body;
    const currentUser = req.user;

    // Can't report yourself
    if (userId === currentUser._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot report yourself'
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add report to target user's safety record
    targetUser.safety.reports.push({
      reportedBy: currentUser._id,
      reason,
      description,
      reportedAt: new Date(),
      status: 'pending'
    });

    // Add reporter to reportedBy list if not already there
    if (!targetUser.safety.reportedBy.includes(currentUser._id)) {
      targetUser.safety.reportedBy.push(currentUser._id);
    }

    await targetUser.save();

    logger.info('User reported', {
      reportedUser: userId,
      reportedBy: currentUser._id,
      reason
    });

    res.json({
      success: true,
      message: 'Report submitted successfully'
    });

  } catch (error) {
    logger.error('Report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit report',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Block a user
router.post('/block', auth, requireEmailVerification, [
  body('userId').isMongoId().withMessage('Valid user ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { userId } = req.body;
    const currentUser = req.user;

    // Can't block yourself
    if (userId === currentUser._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot block yourself'
      });
    }

    // Add to blocked users list
    if (!currentUser.safety.blockedUsers.includes(userId)) {
      currentUser.safety.blockedUsers.push(userId);
      await currentUser.save();
    }

    // Remove any existing matches
    await Match.deleteMany({
      $or: [
        { user1: currentUser._id, user2: userId },
        { user1: userId, user2: currentUser._id }
      ]
    });

    logger.info('User blocked', {
      blocker: currentUser._id,
      blocked: userId
    });

    res.json({
      success: true,
      message: 'User blocked successfully'
    });

  } catch (error) {
    logger.error('Block error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Helper function to calculate compatibility between two users
function calculateCompatibility(user1, user2) {
  const factors = [];
  let totalScore = 0;
  let totalWeight = 0;

  // Interest compatibility (weight: 0.3)
  const interestScore = calculateInterestCompatibility(user1.profile.interests, user2.profile.interests);
  factors.push({ category: 'interests', score: interestScore, weight: 0.3 });
  totalScore += interestScore * 0.3;
  totalWeight += 0.3;

  // Age compatibility (weight: 0.2)
  const ageScore = calculateAgeCompatibility(user1.profile.age, user2.profile.age);
  factors.push({ category: 'age', score: ageScore, weight: 0.2 });
  totalScore += ageScore * 0.2;
  totalWeight += 0.2;

  // Energy level compatibility (weight: 0.2)
  const energyScore = calculateEnergyCompatibility(user1.profile.energyLevel, user2.profile.energyLevel);
  factors.push({ category: 'energy_level', score: energyScore, weight: 0.2 });
  totalScore += energyScore * 0.2;
  totalWeight += 0.2;

  // Looking for compatibility (weight: 0.3)
  const lookingForScore = calculateLookingForCompatibility(user1.profile.lookingFor, user2.profile.lookingFor);
  factors.push({ category: 'looking_for', score: lookingForScore, weight: 0.3 });
  totalScore += lookingForScore * 0.3;
  totalWeight += 0.3;

  const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

  return {
    score: Math.max(0, Math.min(100, finalScore)),
    factors
  };
}

function calculateInterestCompatibility(interests1, interests2) {
  if (!interests1 || !interests2 || interests1.length === 0 || interests2.length === 0) {
    return 50; // Neutral score if no interests
  }

  const commonInterests = interests1.filter(interest => interests2.includes(interest));
  const totalInterests = new Set([...interests1, ...interests2]).size;
  
  return Math.round((commonInterests.length / Math.max(interests1.length, interests2.length)) * 100);
}

function calculateAgeCompatibility(age1, age2) {
  const ageDiff = Math.abs(age1 - age2);
  if (ageDiff <= 2) return 100;
  if (ageDiff <= 5) return 80;
  if (ageDiff <= 10) return 60;
  if (ageDiff <= 15) return 40;
  return 20;
}

function calculateEnergyCompatibility(energy1, energy2) {
  const energyLevels = ['Low-Key', 'Moderate', 'Energetic'];
  const index1 = energyLevels.indexOf(energy1);
  const index2 = energyLevels.indexOf(energy2);
  
  const diff = Math.abs(index1 - index2);
  if (diff === 0) return 100;
  if (diff === 1) return 70;
  return 40;
}

function calculateLookingForCompatibility(lookingFor1, lookingFor2) {
  if (lookingFor1 === lookingFor2) return 100;
  
  // Compatible combinations
  const compatiblePairs = [
    ['Casual', 'Activity Partner'],
    ['Serious', 'Friends'],
    ['Friends', 'Activity Partner']
  ];
  
  const isCompatible = compatiblePairs.some(pair => 
    (pair.includes(lookingFor1) && pair.includes(lookingFor2))
  );
  
  return isCompatible ? 70 : 30;
}

function calculateDistance(location1, location2) {
  if (!location1 || !location2 || !location1.coordinates || !location2.coordinates) {
    return 0;
  }

  return geolib.getDistance(
    { latitude: location1.coordinates[1], longitude: location1.coordinates[0] },
    { latitude: location2.coordinates[1], longitude: location2.coordinates[0] }
  ) / 1000; // Convert to kilometers
}

module.exports = router;