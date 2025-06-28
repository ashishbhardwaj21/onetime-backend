/**
 * Enhanced Discovery Routes with Advanced Matching
 * Provides sophisticated matching algorithms and personalized discovery
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const UserSwipe = require('../models/UserSwipe');
const Match = require('../models/Match');
const AdvancedMatchingEngine = require('../services/AdvancedMatchingEngine');

// Initialize matching engine
const matchingEngine = new AdvancedMatchingEngine();

/**
 * GET /api/discovery/enhanced
 * Get personalized matches using advanced algorithm
 */
router.get('/enhanced', async (req, res) => {
  try {
    const userId = req.user._id;
    const preferences = {
      ageRange: {
        min: parseInt(req.query.minAge) || 18,
        max: parseInt(req.query.maxAge) || 100
      },
      genderPreference: req.query.gender || 'all',
      maxDistance: parseInt(req.query.maxDistance) || 50,
      minCompatibilityScore: parseInt(req.query.minScore) || 30,
      limit: parseInt(req.query.limit) || 10
    };

    console.log(`🎯 Enhanced discovery for user: ${userId}`);
    console.log('Preferences:', preferences);

    // Use advanced matching engine
    const matches = await matchingEngine.findPotentialMatches(userId, preferences);

    // Format response for frontend
    const formattedMatches = matches.map(match => ({
      user: {
        _id: match.user._id,
        profile: {
          name: match.user.profile.name,
          age: match.user.profile.age,
          photos: match.user.profile.photos || [],
          bio: match.user.profile.bio,
          interests: match.user.profile.interests,
          energyLevel: match.user.profile.energyLevel,
          location: {
            city: match.user.profile.location?.city,
            state: match.user.profile.location?.state
          }
        },
        lastActive: match.user.lastActive
      },
      compatibility: {
        score: match.compatibilityScore,
        breakdown: match.scoreBreakdown,
        explanation: matchingEngine.getMatchExplanation(match.scoreBreakdown)
      },
      distance: match.distance,
      matchReasons: matchingEngine.getMatchExplanation(match.scoreBreakdown)
    }));

    res.status(200).json({
      success: true,
      message: 'Enhanced matches retrieved',
      data: {
        matches: formattedMatches,
        totalFound: formattedMatches.length,
        filters: preferences,
        algorithm: 'advanced_compatibility_v2'
      }
    });

  } catch (error) {
    console.error('Enhanced discovery error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get enhanced matches'
    });
  }
});

/**
 * GET /api/discovery/compatibility/:targetUserId
 * Get detailed compatibility analysis with specific user
 */
router.get('/compatibility/:targetUserId', async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.targetUserId;

    // Get both users
    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId).populate('profile.interests'),
      User.findById(targetUserId).populate('profile.interests')
    ]);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Target user not found'
      });
    }

    // Calculate detailed compatibility
    const compatibility = await matchingEngine.calculateCompatibilityScore(currentUser, targetUser);
    const distance = matchingEngine.calculateDistance(currentUser, targetUser);

    res.status(200).json({
      success: true,
      message: 'Compatibility analysis complete',
      data: {
        targetUser: {
          _id: targetUser._id,
          name: targetUser.profile.name,
          age: targetUser.profile.age
        },
        compatibility: {
          overallScore: compatibility.total,
          breakdown: {
            interests: {
              score: Math.round(compatibility.breakdown.interests * 100),
              description: compatibility.breakdown.interests > 0.7 ? 'Highly compatible' :
                          compatibility.breakdown.interests > 0.4 ? 'Somewhat compatible' : 'Limited compatibility'
            },
            lifestyle: {
              score: Math.round(compatibility.breakdown.lifestyle * 100),
              description: 'Lifestyle compatibility analysis'
            },
            values: {
              score: Math.round(compatibility.breakdown.values * 100),
              description: 'Values and goals alignment'
            },
            location: {
              score: Math.round(compatibility.breakdown.location * 100),
              distance: distance,
              description: distance ? `${distance} km away` : 'Distance unknown'
            },
            activity: {
              score: Math.round(compatibility.breakdown.activity * 100),
              description: 'Activity preferences match'
            },
            behavioral: {
              score: Math.round(compatibility.breakdown.behavioral * 100),
              description: 'Communication style compatibility'
            }
          },
          recommendations: matchingEngine.getMatchExplanation(compatibility.breakdown)
        }
      }
    });

  } catch (error) {
    console.error('Compatibility analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze compatibility'
    });
  }
});

/**
 * POST /api/discovery/smart-swipe
 * Enhanced swipe with learning capabilities
 */
router.post('/smart-swipe', async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { targetUserId, action, feedback } = req.body; // feedback: optional user input about why they swiped

    if (!['like', 'pass'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid swipe action'
      });
    }

    // Check if already swiped
    const existingSwipe = await UserSwipe.findOne({
      user: currentUserId,
      targetUser: targetUserId
    });

    if (existingSwipe) {
      return res.status(400).json({
        success: false,
        error: 'Already swiped on this user'
      });
    }

    // Get compatibility score before swiping
    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId).populate('profile.interests'),
      User.findById(targetUserId).populate('profile.interests')
    ]);

    const compatibility = await matchingEngine.calculateCompatibilityScore(currentUser, targetUser);

    // Create swipe record with enhanced data
    const swipeData = {
      user: currentUserId,
      targetUser: targetUserId,
      action,
      timestamp: new Date(),
      compatibilityScoreAtSwipe: compatibility.total,
      scoreBreakdown: compatibility.breakdown,
      userFeedback: feedback,
      // Store context for machine learning
      context: {
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        sessionDuration: req.headers['session-duration'], // If provided by client
        positionInStack: req.body.positionInStack || 1
      }
    };

    const swipe = new UserSwipe(swipeData);
    await swipe.save();

    // Check for mutual like (match)
    let isMatch = false;
    let match = null;

    if (action === 'like') {
      const reciprocalSwipe = await UserSwipe.findOne({
        user: targetUserId,
        targetUser: currentUserId,
        action: 'like'
      });

      if (reciprocalSwipe) {
        // Create match
        match = new Match({
          users: [currentUserId, targetUserId],
          compatibility: {
            score: compatibility.total,
            breakdown: compatibility.breakdown
          },
          status: 'active',
          createdAt: new Date()
        });

        await match.save();
        isMatch = true;

        console.log(`🎉 New match created: ${currentUserId} ↔ ${targetUserId}`);
      }
    }

    res.status(200).json({
      success: true,
      message: `Swiped ${action} successfully`,
      data: {
        swipeId: swipe._id,
        action,
        isMatch,
        match: isMatch ? {
          _id: match._id,
          compatibilityScore: compatibility.total,
          user: {
            _id: targetUser._id,
            name: targetUser.profile.name,
            photos: targetUser.profile.photos
          }
        } : null,
        analytics: {
          compatibilityScore: compatibility.total,
          predictedMatchProbability: this.calculateMatchProbability(compatibility.breakdown),
          learningFeedback: 'Swipe recorded for algorithm improvement'
        }
      }
    });

  } catch (error) {
    console.error('Smart swipe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process swipe'
    });
  }
});

/**
 * GET /api/discovery/insights
 * Get personalized insights about matching patterns
 */
router.get('/insights', async (req, res) => {
  try {
    const userId = req.user._id;

    // Analyze user's swipe patterns
    const swipeAnalysis = await UserSwipe.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          avgCompatibilityScore: { $avg: '$compatibilityScoreAtSwipe' }
        }
      }
    ]);

    // Get match success rate
    const totalLikes = swipeAnalysis.find(s => s._id === 'like')?.count || 0;
    const matchCount = await Match.countDocuments({ users: userId });
    const matchRate = totalLikes > 0 ? (matchCount / totalLikes * 100).toFixed(1) : 0;

    // Analyze preferences
    const preferenceInsights = await this.analyzeUserPreferences(userId);

    res.status(200).json({
      success: true,
      message: 'User insights retrieved',
      data: {
        swipeStatistics: {
          totalSwipes: swipeAnalysis.reduce((sum, s) => sum + s.count, 0),
          likes: swipeAnalysis.find(s => s._id === 'like')?.count || 0,
          passes: swipeAnalysis.find(s => s._id === 'pass')?.count || 0,
          matchRate: parseFloat(matchRate)
        },
        preferences: preferenceInsights,
        recommendations: [
          'Try expanding your age range for more matches',
          'Users with shared interests have 40% higher match rates',
          'Active users get 3x more matches'
        ],
        algorithm: {
          version: 'v2.0',
          lastUpdated: new Date(),
          personalizedFactors: ['interests', 'location', 'activity_level']
        }
      }
    });

  } catch (error) {
    console.error('Insights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insights'
    });
  }
});

/**
 * Helper function to calculate match probability
 */
function calculateMatchProbability(scoreBreakdown) {
  // Simple heuristic - can be enhanced with ML
  const weights = {
    interests: 0.3,
    lifestyle: 0.2,
    values: 0.2,
    location: 0.15,
    activity: 0.1,
    behavioral: 0.05
  };

  const weightedScore = Object.entries(scoreBreakdown).reduce((sum, [key, score]) => {
    return sum + (score * (weights[key] || 0));
  }, 0);

  return Math.round(weightedScore * 100);
}

/**
 * Analyze user preferences based on swipe history
 */
async function analyzeUserPreferences(userId) {
  try {
    // Get users that were liked
    const likedSwipes = await UserSwipe.find({
      user: userId,
      action: 'like'
    }).populate('targetUser');

    if (likedSwipes.length === 0) {
      return { message: 'Not enough data for analysis' };
    }

    // Analyze patterns
    const agePreferences = likedSwipes.map(s => s.targetUser.profile.age);
    const avgAge = agePreferences.reduce((sum, age) => sum + age, 0) / agePreferences.length;

    const interestFrequency = {};
    likedSwipes.forEach(swipe => {
      const interests = swipe.targetUser.profile.interests || [];
      interests.forEach(interest => {
        interestFrequency[interest] = (interestFrequency[interest] || 0) + 1;
      });
    });

    const topInterests = Object.entries(interestFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([interest, count]) => ({ interest, frequency: count }));

    return {
      preferredAgeRange: {
        average: Math.round(avgAge),
        range: [Math.min(...agePreferences), Math.max(...agePreferences)]
      },
      topInterests,
      totalLikedProfiles: likedSwipes.length
    };

  } catch (error) {
    console.error('Preference analysis error:', error);
    return { error: 'Analysis failed' };
  }
}

module.exports = router;