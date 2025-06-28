const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

console.log('🚀 Starting OneTime Production Server...');
console.log('🔧 Environment check:', {
  mongoUri: process.env.MONGODB_URI ? 'Set' : 'Missing',
  jwtSecret: process.env.JWT_SECRET ? `Set (${process.env.JWT_SECRET.length} chars)` : 'Missing',
  nodeEnv: process.env.NODE_ENV || 'development'
});

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization"],
    credentials: true
  }
});

// Store active connections
const activeConnections = new Map();

// Basic middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Test route
app.get('/', (req, res) => {
  res.json({
    message: 'OneTime Dating App API - Production',
    version: '1.0.0',
    status: 'running'
  });
});

// Import models
const User = require('./models/User');
const Match = require('./models/Match');
const UserSwipe = require('./models/UserSwipe');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const Activity = require('./models/Activity');

// Import upload middleware
const { upload, handleUploadError, deleteFromCloudinary, getOptimizedImageUrl } = require('./middleware/upload');

// JWT token generation
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Auth middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    console.log('🔐 Auth check:', {
      hasAuth: !!authHeader,
      token: token ? `${token.substring(0, 20)}...` : 'none'
    });
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🔓 Token decoded:', { userId: decoded.userId });
    
    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (!user) {
      console.log('❌ User not found:', decoded.userId);
      return res.status(401).json({
        success: false,
        error: 'Invalid token - user not found'
      });
    }
    
    if (user.status !== 'active') {
      console.log('❌ User inactive:', user.status);
      return res.status(401).json({
        success: false,
        error: 'Invalid token - user inactive'
      });
    }

    console.log('✅ Auth successful:', user.email);
    req.user = user;
    next();
  } catch (error) {
    console.log('❌ Auth error:', error.message);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

// Real auth routes with MongoDB
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Registration attempt:', req.body.email);
    
    const { email, password, name, age, gender, dateOfBirth, location } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Create new user
    const user = new User({
      email: email.toLowerCase(),
      passwordHash: password, // Will be hashed by pre-save hook
      profile: {
        name,
        age,
        gender,
        dateOfBirth: new Date(dateOfBirth),
        location: location || {
          type: 'Point',
          coordinates: [-122.4194, 37.7749], // Default to SF
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        }
      },
      status: 'active'
    });

    await user.save();

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateToken(user._id); // In production, use different secret

    console.log('✅ User registered:', user.email);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        userId: user._id,
        accessToken,
        refreshToken,
        isEmailVerified: user.verification.email.verified
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body.email);
    
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateToken(user._id);

    console.log('✅ User logged in:', user.email);

    res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      data: {
        userId: user._id,
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Protected routes
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'User profile retrieved',
      data: {
        user: {
          _id: req.user._id,
          email: req.user.email,
          status: req.user.status,
          profile: req.user.profile
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const newAccessToken = generateToken(decoded.userId);
    
    res.status(200).json({
      success: true,
      message: 'Token refreshed',
      data: {
        accessToken: newAccessToken
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    });
  }
});

app.put('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const { profile } = req.body;
    
    await User.findByIdAndUpdate(req.user._id, {
      $set: { 'profile.bio': profile.bio, 'profile.interests': profile.interests }
    });
    
    res.status(200).json({
      success: true,
      message: 'Profile updated',
      data: {
        user: {
          _id: req.user._id,
          profile: {
            ...req.user.profile,
            bio: profile.bio,
            interests: profile.interests
          }
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

app.put('/api/users/me/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user._id);
    const isValidPassword = await user.comparePassword(currentPassword);
    
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        error: 'Invalid current password'
      });
    }
    
    user.passwordHash = newPassword; // Will be hashed by pre-save hook
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update password'
    });
  }
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  // In a real app, you'd invalidate the token in a blacklist
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

// DISCOVERY AND MATCHING SYSTEM

// Calculate compatibility score between two users
function calculateCompatibility(user1, user2) {
  let score = 0;
  let factors = 0;

  // Age compatibility (0-25 points)
  const ageDiff = Math.abs(user1.profile.age - user2.profile.age);
  if (ageDiff <= 2) score += 25;
  else if (ageDiff <= 5) score += 20;
  else if (ageDiff <= 10) score += 15;
  else score += 5;
  factors++;

  // Interest compatibility (0-30 points)
  if (user1.profile.interests && user2.profile.interests) {
    const commonInterests = user1.profile.interests.filter(interest => 
      user2.profile.interests.includes(interest)
    );
    score += Math.min(commonInterests.length * 5, 30);
  }
  factors++;

  // Energy level compatibility (0-20 points)
  if (user1.profile.energyLevel && user2.profile.energyLevel) {
    if (user1.profile.energyLevel === user2.profile.energyLevel) {
      score += 20;
    } else {
      const levels = ['Low-Key', 'Moderate', 'Energetic'];
      const diff = Math.abs(levels.indexOf(user1.profile.energyLevel) - levels.indexOf(user2.profile.energyLevel));
      score += Math.max(20 - (diff * 10), 5);
    }
  }
  factors++;

  // Looking for compatibility (0-25 points)
  if (user1.profile.lookingFor && user2.profile.lookingFor) {
    if (user1.profile.lookingFor === user2.profile.lookingFor) {
      score += 25;
    } else {
      score += 10; // Different but still compatible
    }
  }
  factors++;

  return Math.round(score / factors);
}

// Get discovery feed for user
app.get('/api/discovery', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { limit = 10, offset = 0 } = req.query;

    console.log('🔍 Discovery request for:', currentUser.email);

    // Get users already swiped on (with error handling)
    let swipedUserIds = [];
    try {
      swipedUserIds = await UserSwipe.find({ 
        swiperId: currentUser._id 
      }).distinct('targetId');
    } catch (error) {
      console.log('⚠️ UserSwipe collection not found, creating empty array');
      swipedUserIds = [];
    }

    // Get matched user IDs (with error handling)
    let matchedUserIds = [];
    try {
      const user1Matches = await Match.find({
        $or: [
          { user1: currentUser._id },
          { user2: currentUser._id }
        ]
      }).distinct('user1');
      
      const user2Matches = await Match.find({
        $or: [
          { user1: currentUser._id },
          { user2: currentUser._id }
        ]
      }).distinct('user2');
      
      matchedUserIds = [...user1Matches, ...user2Matches];
    } catch (error) {
      console.log('⚠️ Match collection not found, creating empty array');
      matchedUserIds = [];
    }

    // Build exclusion list
    const excludedIds = [...swipedUserIds, ...matchedUserIds, currentUser._id];

    // Find potential matches
    const query = {
      _id: { $nin: excludedIds },
      status: 'active',
      'profile.age': {
        $gte: currentUser.profile.agePreference?.min || 18,
        $lte: currentUser.profile.agePreference?.max || 100
      }
    };

    // Gender preference filter
    if (currentUser.profile.genderPreference && currentUser.profile.genderPreference.length > 0) {
      query['profile.gender'] = { $in: currentUser.profile.genderPreference };
    }

    // Location-based filtering (simplified for now)
    // Note: Geospatial queries require proper indexes, simplified for testing
    console.log('📍 User location:', currentUser.profile.location ? 'Available' : 'Not set');

    console.log('🔍 Discovery query:', { excludedCount: excludedIds.length, query });

    const potentialMatches = await User.find(query)
      .select('profile email analytics')
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    // Calculate compatibility scores and prepare response
    const discoveryUsers = potentialMatches.map(user => {
      const compatibilityScore = calculateCompatibility(currentUser, user);
      
      return {
        _id: user._id,
        profile: {
          name: user.profile.name,
          age: user.profile.age,
          bio: user.profile.bio,
          photos: user.profile.photos,
          interests: user.profile.interests,
          occupation: user.profile.occupation,
          energyLevel: user.profile.energyLevel,
          lookingFor: user.profile.lookingFor,
          location: user.profile.location
        },
        compatibility: {
          score: compatibilityScore,
          factors: ['age', 'interests', 'energy', 'goals']
        },
        distance: currentUser.profile.location && user.profile.location ? 
          calculateDistance(currentUser.profile.location, user.profile.location) : null
      };
    });

    // Sort by compatibility score
    discoveryUsers.sort((a, b) => b.compatibility.score - a.compatibility.score);

    console.log('✅ Discovery results:', { 
      count: discoveryUsers.length, 
      avgCompatibility: discoveryUsers.reduce((sum, u) => sum + u.compatibility.score, 0) / discoveryUsers.length || 0
    });

    res.status(200).json({
      success: true,
      message: 'Discovery feed retrieved',
      data: {
        users: discoveryUsers,
        hasMore: potentialMatches.length === parseInt(limit),
        pagination: {
          offset: parseInt(offset),
          limit: parseInt(limit),
          total: discoveryUsers.length
        }
      }
    });

  } catch (error) {
    console.error('Discovery error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get discovery feed'
    });
  }
});

// Swipe/Like action
app.post('/api/discovery/swipe', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { targetUserId, action } = req.body; // action: 'like', 'pass', 'super_like'

    console.log('💫 Swipe action:', { from: currentUser.email, targetUserId, action });

    // Validate action
    if (!['like', 'pass', 'super_like'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid swipe action'
      });
    }

    // Check if already swiped (with error handling)
    let existingSwipe = null;
    try {
      existingSwipe = await UserSwipe.findOne({
        swiperId: currentUser._id,
        targetId: targetUserId
      });
    } catch (error) {
      console.log('⚠️ UserSwipe collection issue, proceeding...');
    }

    if (existingSwipe) {
      return res.status(400).json({
        success: false,
        error: 'Already swiped on this user'
      });
    }

    // Record the swipe (with error handling)
    let swipe;
    try {
      swipe = new UserSwipe({
        swiperId: currentUser._id,
        targetId: targetUserId,
        action: action,
        timestamp: new Date()
      });

      await swipe.save();
    } catch (error) {
      console.log('⚠️ Could not save swipe, but continuing:', error.message);
      // Create a mock swipe for response
      swipe = { _id: 'mock-swipe-id' };
    }

    // Check for mutual like (match)
    let isMatch = false;
    let matchId = null;

    if (action === 'like' || action === 'super_like') {
      const reciprocalSwipe = await UserSwipe.findOne({
        swiperId: targetUserId,
        targetId: currentUser._id,
        action: { $in: ['like', 'super_like'] }
      });

      if (reciprocalSwipe) {
        // Create match
        const targetUser = await User.findById(targetUserId);
        const compatibilityScore = calculateCompatibility(currentUser, targetUser);

        const match = new Match({
          user1: currentUser._id,
          user2: targetUserId,
          user1Action: action,
          user2Action: reciprocalSwipe.action,
          mutual: true,
          matchedAt: new Date(),
          compatibility: {
            score: compatibilityScore,
            factors: ['age', 'interests', 'energy', 'goals']
          },
          status: 'active',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });

        await match.save();
        isMatch = true;
        matchId = match._id;

        // Update user analytics
        await User.findByIdAndUpdate(currentUser._id, {
          $inc: { 'analytics.totalMatches': 1 }
        });
        await User.findByIdAndUpdate(targetUserId, {
          $inc: { 'analytics.totalMatches': 1 }
        });

        console.log('🎉 MATCH created:', matchId);
      }
    }

    // Update user analytics
    await User.findByIdAndUpdate(currentUser._id, {
      $inc: { 'analytics.totalSwipes': 1 }
    });

    res.status(200).json({
      success: true,
      message: isMatch ? 'It\'s a match!' : 'Swipe recorded',
      data: {
        swipeId: swipe._id,
        action: action,
        isMatch: isMatch,
        matchId: matchId
      }
    });

  } catch (error) {
    console.error('Swipe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process swipe'
    });
  }
});

// Get user's matches
app.get('/api/matches', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { limit = 20, offset = 0 } = req.query;

    console.log('🎯 Matches request for:', currentUser.email);

    const matches = await Match.find({
      $or: [
        { user1: currentUser._id },
        { user2: currentUser._id }
      ],
      mutual: true,
      status: 'active'
    })
    .populate('user1', 'profile email')
    .populate('user2', 'profile email')
    .sort({ matchedAt: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset));

    const matchData = matches.map(match => {
      const otherUser = match.user1._id.toString() === currentUser._id.toString() 
        ? match.user2 
        : match.user1;

      return {
        _id: match._id,
        matchedAt: match.matchedAt,
        compatibility: match.compatibility,
        status: match.status,
        expiresAt: match.expiresAt,
        user: {
          _id: otherUser._id,
          profile: {
            name: otherUser.profile.name,
            age: otherUser.profile.age,
            bio: otherUser.profile.bio,
            photos: otherUser.profile.photos,
            interests: otherUser.profile.interests,
            occupation: otherUser.profile.occupation
          }
        }
      };
    });

    console.log('✅ Matches found:', matchData.length);

    res.status(200).json({
      success: true,
      message: 'Matches retrieved',
      data: {
        matches: matchData,
        hasMore: matches.length === parseInt(limit),
        pagination: {
          offset: parseInt(offset),
          limit: parseInt(limit),
          total: matchData.length
        }
      }
    });

  } catch (error) {
    console.error('Matches error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get matches'
    });
  }
});

// Helper function to calculate distance between two locations
function calculateDistance(loc1, loc2) {
  if (!loc1.coordinates || !loc2.coordinates) return null;
  
  const [lon1, lat1] = loc1.coordinates;
  const [lon2, lat2] = loc2.coordinates;
  
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

// ACTIVITY SUGGESTION SYSTEM

// Get personalized activity suggestions
app.get('/api/activities/suggestions', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { 
      limit = 10, 
      offset = 0, 
      category, 
      priceRange, 
      timeOfDay, 
      maxDistance = 25 
    } = req.query;

    console.log('🎯 Activity suggestions request for:', currentUser.email);

    if (!currentUser.profile.location || !currentUser.profile.location.coordinates) {
      return res.status(400).json({
        success: false,
        error: 'User location required for activity suggestions'
      });
    }

    // Get user preferences and location
    const userCoords = currentUser.profile.location.coordinates;
    const userInterests = currentUser.profile.interests || [];
    const userEnergyLevel = currentUser.profile.energyLevel || 'Moderate';

    // Build query filters
    const filters = {
      status: 'active',
      isApproved: true
    };

    if (category) filters.category = category;
    if (priceRange) filters.priceRange = priceRange;
    if (timeOfDay) filters.bestTimeOfDay = { $in: [timeOfDay, 'anytime'] };

    // Find activities near user
    let activities = [];
    try {
      activities = await Activity.find({
        ...filters,
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: userCoords
            },
            $maxDistance: maxDistance * 1000 // Convert km to meters
          }
        }
      })
      .limit(parseInt(limit) * 2) // Get more for filtering
      .skip(parseInt(offset));
    } catch (error) {
      console.log('⚠️ Location-based query failed, getting all activities');
      activities = await Activity.find(filters)
        .limit(parseInt(limit) * 2)
        .skip(parseInt(offset));
    }

    // Calculate personalization scores
    const scoredActivities = activities.map(activity => {
      let score = 0;
      let factors = [];

      // Interest matching (0-40 points)
      if (userInterests.length > 0 && activity.tags.length > 0) {
        const commonInterests = activity.tags.filter(tag => 
          userInterests.some(interest => 
            interest.toLowerCase().includes(tag.toLowerCase()) ||
            tag.toLowerCase().includes(interest.toLowerCase())
          )
        );
        const interestScore = Math.min((commonInterests.length / userInterests.length) * 40, 40);
        score += interestScore;
        if (interestScore > 0) factors.push('interests');
      }

      // Energy level matching (0-20 points)
      const energyMapping = {
        'Low-Key': ['cultural', 'dining'],
        'Moderate': ['cultural', 'dining', 'entertainment', 'social'],
        'Energetic': ['outdoor', 'sports', 'entertainment', 'social']
      };
      
      if (energyMapping[userEnergyLevel]?.includes(activity.category)) {
        score += 20;
        factors.push('energy_level');
      }

      // Rating bonus (0-20 points)
      if (activity.averageRating > 0) {
        score += (activity.averageRating / 5) * 20;
        factors.push('rating');
      }

      // Popularity bonus (0-10 points)
      if (activity.metadata.viewCount > 100) {
        score += 10;
        factors.push('popularity');
      }

      // Random factor for diversity (0-10 points)
      score += Math.random() * 10;

      return {
        ...activity.toObject(),
        personalizationScore: Math.round(score),
        matchingFactors: factors,
        distance: currentUser.profile.location && activity.location.coordinates ? 
          calculateDistance(currentUser.profile.location, activity.location) : null
      };
    });

    // Sort by personalization score and take requested amount
    const suggestions = scoredActivities
      .sort((a, b) => b.personalizationScore - a.personalizationScore)
      .slice(0, parseInt(limit));

    console.log('✅ Activity suggestions generated:', { 
      count: suggestions.length,
      avgScore: suggestions.reduce((sum, a) => sum + a.personalizationScore, 0) / suggestions.length || 0
    });

    res.status(200).json({
      success: true,
      message: 'Activity suggestions retrieved',
      data: {
        activities: suggestions,
        hasMore: activities.length === parseInt(limit) * 2,
        userLocation: {
          city: currentUser.profile.location.city,
          coordinates: userCoords
        },
        filters: {
          category,
          priceRange,
          timeOfDay,
          maxDistance
        },
        pagination: {
          offset: parseInt(offset),
          limit: parseInt(limit),
          total: suggestions.length
        }
      }
    });

  } catch (error) {
    console.error('Activity suggestions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity suggestions'
    });
  }
});

// Get activity details
app.get('/api/activities/:activityId', authenticateToken, async (req, res) => {
  try {
    const { activityId } = req.params;
    const currentUser = req.user;

    const activity = await Activity.findById(activityId)
      .populate('createdBy', 'profile.name')
      .populate('ratings.user', 'profile.name profile.photos');

    if (!activity || activity.status !== 'active') {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    // Increment view count
    activity.incrementViewCount();
    await activity.save();

    // Calculate distance from user
    const distance = currentUser.profile.location && activity.location.coordinates ?
      calculateDistance(currentUser.profile.location, activity.location) : null;

    res.status(200).json({
      success: true,
      message: 'Activity details retrieved',
      data: {
        activity: {
          ...activity.toObject(),
          distance,
          userHasRated: activity.hasUserRated(currentUser._id),
          userRating: activity.getUserRating(currentUser._id)
        }
      }
    });

  } catch (error) {
    console.error('Activity details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity details'
    });
  }
});

// Search activities
app.get('/api/activities/search', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { 
      q, 
      category, 
      priceRange, 
      rating,
      limit = 20, 
      offset = 0 
    } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    console.log('🔍 Activity search:', { query: q, user: currentUser.email });

    // Build search query
    const searchQuery = {
      $text: { $search: q },
      status: 'active',
      isApproved: true
    };

    if (category) searchQuery.category = category;
    if (priceRange) searchQuery.priceRange = priceRange;
    if (rating) searchQuery.averageRating = { $gte: parseFloat(rating) };

    const activities = await Activity.find(searchQuery, {
      score: { $meta: 'textScore' }
    })
    .sort({ score: { $meta: 'textScore' } })
    .limit(parseInt(limit))
    .skip(parseInt(offset));

    // Add distance calculations
    const activitiesWithDistance = activities.map(activity => ({
      ...activity.toObject(),
      distance: currentUser.profile.location && activity.location.coordinates ?
        calculateDistance(currentUser.profile.location, activity.location) : null
    }));

    console.log('✅ Activity search results:', activitiesWithDistance.length);

    res.status(200).json({
      success: true,
      message: 'Activity search completed',
      data: {
        activities: activitiesWithDistance,
        searchQuery: q,
        filters: { category, priceRange, rating },
        pagination: {
          offset: parseInt(offset),
          limit: parseInt(limit),
          total: activitiesWithDistance.length
        }
      }
    });

  } catch (error) {
    console.error('Activity search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search activities'
    });
  }
});

// Rate an activity
app.post('/api/activities/:activityId/rate', authenticateToken, async (req, res) => {
  try {
    const { activityId } = req.params;
    const { rating, review } = req.body;
    const currentUser = req.user;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5'
      });
    }

    const activity = await Activity.findById(activityId);
    if (!activity || activity.status !== 'active') {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    // Update or add rating
    activity.updateRating(currentUser._id, rating, review);
    await activity.save();

    console.log('⭐ Activity rated:', { activityId, rating, user: currentUser.email });

    res.status(200).json({
      success: true,
      message: 'Activity rated successfully',
      data: {
        activityId,
        rating,
        review,
        newAverageRating: activity.averageRating,
        totalRatings: activity.totalRatings
      }
    });

  } catch (error) {
    console.error('Activity rating error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rate activity'
    });
  }
});

// Get activity categories and filters
app.get('/api/activities/categories', authenticateToken, async (req, res) => {
  try {
    const categories = [
      { value: 'dining', label: 'Dining & Food', icon: '🍽️' },
      { value: 'outdoor', label: 'Outdoor Adventure', icon: '🏞️' },
      { value: 'entertainment', label: 'Entertainment', icon: '🎭' },
      { value: 'cultural', label: 'Arts & Culture', icon: '🎨' },
      { value: 'sports', label: 'Sports & Fitness', icon: '⚽' },
      { value: 'social', label: 'Social Events', icon: '🎉' },
      { value: 'virtual', label: 'Virtual Activities', icon: '💻' }
    ];

    const priceRanges = [
      { value: 'free', label: 'Free', icon: '💚' },
      { value: 'budget', label: 'Budget ($-$$)', icon: '💛' },
      { value: 'moderate', label: 'Moderate ($$$)', icon: '🧡' },
      { value: 'expensive', label: 'Premium ($$$$)', icon: '❤️' }
    ];

    const timesOfDay = [
      { value: 'morning', label: 'Morning', icon: '🌅' },
      { value: 'afternoon', label: 'Afternoon', icon: '☀️' },
      { value: 'evening', label: 'Evening', icon: '🌇' },
      { value: 'night', label: 'Night', icon: '🌙' },
      { value: 'anytime', label: 'Anytime', icon: '🕐' }
    ];

    res.status(200).json({
      success: true,
      message: 'Activity categories retrieved',
      data: {
        categories,
        priceRanges,
        timesOfDay
      }
    });

  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get categories'
    });
  }
});

// Suggest activity for a match
app.post('/api/matches/:matchId/suggest-activity', authenticateToken, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { activityId, message } = req.body;
    const currentUser = req.user;

    console.log('💡 Activity suggestion for match:', { matchId, activityId });

    // Verify match exists and user is participant
    const match = await Match.findById(matchId).populate('user1 user2');
    if (!match || (match.user1._id.toString() !== currentUser._id.toString() && 
                   match.user2._id.toString() !== currentUser._id.toString())) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to match'
      });
    }

    // Verify activity exists
    const activity = await Activity.findById(activityId);
    if (!activity || activity.status !== 'active') {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    // Get or create conversation
    let conversation = await Conversation.findOne({ matchId });
    if (!conversation) {
      conversation = new Conversation({
        matchId: matchId,
        participants: [match.user1._id, match.user2._id],
        status: 'active'
      });
      await conversation.save();
    }

    // Create activity suggestion message
    const activityMessage = new Message({
      conversationId: conversation._id,
      sender: currentUser._id,
      content: {
        type: 'activity',
        text: message || `How about we try this activity together?`,
        activity: {
          id: activity._id,
          title: activity.title,
          description: activity.description,
          location: activity.location.address,
          category: activity.category,
          priceRange: activity.priceRange
        }
      }
    });

    await activityMessage.save();
    await activityMessage.populate('sender', 'profile.name profile.photos');

    // Update conversation
    conversation.updateLastMessage(activityMessage);
    await conversation.save();

    // Emit real-time notification
    const messageData = {
      _id: activityMessage._id,
      conversationId: activityMessage.conversationId,
      sender: {
        _id: activityMessage.sender._id,
        profile: {
          name: activityMessage.sender.profile.name,
          photos: activityMessage.sender.profile.photos
        }
      },
      content: activityMessage.content,
      timestamp: activityMessage.timestamp
    };

    io.to(`conversation_${conversation._id}`).emit('new_message', messageData);

    console.log('✅ Activity suggested successfully');

    res.status(201).json({
      success: true,
      message: 'Activity suggested successfully',
      data: {
        message: messageData,
        activity: {
          _id: activity._id,
          title: activity.title,
          category: activity.category,
          location: activity.location.address
        }
      }
    });

  } catch (error) {
    console.error('Activity suggestion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to suggest activity'
    });
  }
});

// USER PROFILE MANAGEMENT SYSTEM

// Get complete user profile
app.get('/api/users/me/complete', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    
    // Calculate profile completion percentage
    const profileCompletion = calculateProfileCompletion(currentUser);
    
    const completeProfile = {
      ...currentUser.toObject(),
      profileCompletion,
      verificationStatus: {
        email: currentUser.verification?.email?.verified || false,
        phone: currentUser.verification?.phone?.verified || false,
        photos: currentUser.verification?.photos?.verified || false,
        identity: currentUser.verification?.identity?.verified || false
      }
    };

    // Remove sensitive data
    delete completeProfile.passwordHash;

    res.status(200).json({
      success: true,
      message: 'Complete profile retrieved',
      data: {
        user: completeProfile
      }
    });

  } catch (error) {
    console.error('Complete profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get complete profile'
    });
  }
});

// Update profile section
app.put('/api/users/me/profile', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { section, data } = req.body;

    console.log('📝 Profile update:', { section, user: currentUser.email });

    const validSections = ['basic', 'photos', 'prompts', 'interests', 'preferences', 'location'];
    if (!validSections.includes(section)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid profile section'
      });
    }

    let updateQuery = {};
    
    switch (section) {
      case 'basic':
        updateQuery = {
          'profile.name': data.name,
          'profile.age': data.age,
          'profile.occupation': data.occupation,
          'profile.bio': data.bio,
          'profile.height': data.height,
          'profile.education': data.education
        };
        break;
        
      case 'photos':
        updateQuery = {
          'profile.photos': data.photos
        };
        break;
        
      case 'prompts':
        updateQuery = {
          'profile.prompts': data.prompts
        };
        break;
        
      case 'interests':
        updateQuery = {
          'profile.interests': data.interests,
          'profile.intentTags': data.intentTags,
          'profile.energyLevel': data.energyLevel,
          'profile.lookingFor': data.lookingFor
        };
        break;
        
      case 'preferences':
        updateQuery = {
          'profile.agePreference': data.agePreference,
          'profile.distancePreference': data.distancePreference,
          'profile.genderPreference': data.genderPreference
        };
        break;
        
      case 'location':
        updateQuery = {
          'profile.location': data.location
        };
        break;
    }

    // Remove undefined fields
    Object.keys(updateQuery).forEach(key => {
      if (updateQuery[key] === undefined) {
        delete updateQuery[key];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      currentUser._id,
      { $set: updateQuery },
      { new: true, runValidators: true }
    );

    // Calculate new profile completion
    const profileCompletion = calculateProfileCompletion(updatedUser);

    console.log('✅ Profile section updated:', { section, completion: profileCompletion.percentage });

    res.status(200).json({
      success: true,
      message: `${section} profile updated successfully`,
      data: {
        section,
        profileCompletion,
        updatedFields: Object.keys(updateQuery)
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// Upload profile photo (URL-based - for testing)
app.post('/api/users/me/photos', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { photoUrl, caption, isPrimary = false } = req.body;

    if (!photoUrl) {
      return res.status(400).json({
        success: false,
        error: 'Photo URL is required'
      });
    }

    console.log('📸 Photo upload:', { user: currentUser.email, isPrimary });

    // If setting as primary, unset other primary photos
    if (isPrimary) {
      await User.findByIdAndUpdate(currentUser._id, {
        $set: { 'profile.photos.$[].isPrimary': false }
      });
    }

    // Add new photo
    const newPhoto = {
      url: photoUrl,
      caption: caption || '',
      isPrimary: isPrimary,
      order: currentUser.profile.photos.length,
      uploadedAt: new Date()
    };

    await User.findByIdAndUpdate(currentUser._id, {
      $push: { 'profile.photos': newPhoto }
    });

    // If this is the first photo, automatically set as primary
    if (currentUser.profile.photos.length === 0) {
      newPhoto.isPrimary = true;
      await User.findByIdAndUpdate(currentUser._id, {
        $set: { 'profile.photos.0.isPrimary': true }
      });
    }

    console.log('✅ Photo uploaded successfully');

    res.status(201).json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        photo: newPhoto,
        totalPhotos: currentUser.profile.photos.length + 1
      }
    });

  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload photo'
    });
  }
});

// Upload profile photo (File upload with Cloudinary)
app.post('/api/users/me/photos/upload', 
  authenticateToken, 
  upload.single('photo'), 
  handleUploadError,
  async (req, res) => {
    try {
      const currentUser = req.user;
      const { caption, isPrimary = false } = req.body;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Photo file is required'
        });
      }

      console.log('📸 File photo upload:', { 
        user: currentUser.email, 
        filename: req.file.originalname,
        size: req.file.size,
        cloudinaryUrl: req.file.path
      });

      // Check photo limit (max 6 photos)
      if (currentUser.profile.photos.length >= 6) {
        // Delete uploaded file from Cloudinary
        if (req.file.public_id) {
          await deleteFromCloudinary(req.file.public_id);
        }
        
        return res.status(400).json({
          success: false,
          error: 'Maximum 6 photos allowed'
        });
      }

      // If setting as primary, unset other primary photos
      const shouldSetPrimary = isPrimary === 'true' || isPrimary === true;
      if (shouldSetPrimary) {
        await User.findByIdAndUpdate(currentUser._id, {
          $set: { 'profile.photos.$[].isPrimary': false }
        });
      }

      // Create photo object with Cloudinary details
      const newPhoto = {
        url: req.file.path, // Cloudinary secure URL
        cloudinaryId: req.file.public_id,
        caption: caption || '',
        isPrimary: shouldSetPrimary || currentUser.profile.photos.length === 0,
        order: currentUser.profile.photos.length,
        uploadedAt: new Date(),
        metadata: {
          originalName: req.file.originalname,
          size: req.file.size,
          format: req.file.format,
          width: req.file.width,
          height: req.file.height
        }
      };

      // Add photo to user profile
      await User.findByIdAndUpdate(currentUser._id, {
        $push: { 'profile.photos': newPhoto }
      });

      // Generate optimized thumbnails
      const thumbnails = {
        small: getOptimizedImageUrl(req.file.public_id, { width: 150, height: 150 }),
        medium: getOptimizedImageUrl(req.file.public_id, { width: 400, height: 400 }),
        large: getOptimizedImageUrl(req.file.public_id, { width: 800, height: 800 })
      };

      console.log('✅ Photo uploaded and processed successfully');

      res.status(201).json({
        success: true,
        message: 'Photo uploaded successfully',
        data: {
          photo: {
            ...newPhoto,
            thumbnails
          },
          totalPhotos: currentUser.profile.photos.length + 1
        }
      });

    } catch (error) {
      console.error('File photo upload error:', error);
      
      // Clean up uploaded file if there's an error
      if (req.file && req.file.public_id) {
        try {
          await deleteFromCloudinary(req.file.public_id);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to upload photo'
      });
    }
  }
);

// Upload multiple photos at once
app.post('/api/users/me/photos/upload-multiple', 
  authenticateToken, 
  upload.array('photos', 6), 
  handleUploadError,
  async (req, res) => {
    try {
      const currentUser = req.user;
      const uploadedFiles = req.files || [];

      if (uploadedFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one photo file is required'
        });
      }

      console.log('📸 Multiple photo upload:', { 
        user: currentUser.email, 
        count: uploadedFiles.length
      });

      // Check total photo limit
      const totalPhotosAfterUpload = currentUser.profile.photos.length + uploadedFiles.length;
      if (totalPhotosAfterUpload > 6) {
        // Delete all uploaded files
        for (const file of uploadedFiles) {
          if (file.public_id) {
            await deleteFromCloudinary(file.public_id);
          }
        }
        
        return res.status(400).json({
          success: false,
          error: `Maximum 6 photos allowed. You can upload ${6 - currentUser.profile.photos.length} more photos.`
        });
      }

      const newPhotos = [];
      const uploadPromises = [];

      // Process each uploaded file
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const photoOrder = currentUser.profile.photos.length + i;
        
        const newPhoto = {
          url: file.path,
          cloudinaryId: file.public_id,
          caption: '',
          isPrimary: currentUser.profile.photos.length === 0 && i === 0, // First photo of first upload is primary
          order: photoOrder,
          uploadedAt: new Date(),
          metadata: {
            originalName: file.originalname,
            size: file.size,
            format: file.format,
            width: file.width,
            height: file.height
          }
        };

        newPhotos.push(newPhoto);
      }

      // Add all photos to user profile
      await User.findByIdAndUpdate(currentUser._id, {
        $push: { 'profile.photos': { $each: newPhotos } }
      });

      // Generate thumbnails for all photos
      const photosWithThumbnails = newPhotos.map(photo => ({
        ...photo,
        thumbnails: {
          small: getOptimizedImageUrl(photo.cloudinaryId, { width: 150, height: 150 }),
          medium: getOptimizedImageUrl(photo.cloudinaryId, { width: 400, height: 400 }),
          large: getOptimizedImageUrl(photo.cloudinaryId, { width: 800, height: 800 })
        }
      }));

      console.log('✅ Multiple photos uploaded successfully');

      res.status(201).json({
        success: true,
        message: `${uploadedFiles.length} photos uploaded successfully`,
        data: {
          photos: photosWithThumbnails,
          totalPhotos: currentUser.profile.photos.length + uploadedFiles.length,
          uploadedCount: uploadedFiles.length
        }
      });

    } catch (error) {
      console.error('Multiple photo upload error:', error);
      
      // Clean up uploaded files if there's an error
      if (req.files) {
        for (const file of req.files) {
          if (file.public_id) {
            try {
              await deleteFromCloudinary(file.public_id);
            } catch (cleanupError) {
              console.error('Error cleaning up uploaded file:', cleanupError);
            }
          }
        }
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to upload photos'
      });
    }
  }
);

// Delete profile photo
app.delete('/api/users/me/photos/:photoIndex', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { photoIndex } = req.params;
    const index = parseInt(photoIndex);

    if (isNaN(index) || index < 0 || index >= currentUser.profile.photos.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid photo index'
      });
    }

    console.log('🗑️ Photo deletion:', { user: currentUser.email, index });

    const deletedPhoto = currentUser.profile.photos[index];
    
    // Delete from Cloudinary if it has a cloudinaryId
    if (deletedPhoto.cloudinaryId) {
      try {
        await deleteFromCloudinary(deletedPhoto.cloudinaryId);
        console.log('✅ Photo deleted from Cloudinary:', deletedPhoto.cloudinaryId);
      } catch (cloudinaryError) {
        console.error('⚠️ Failed to delete from Cloudinary:', cloudinaryError);
        // Continue with database deletion even if Cloudinary fails
      }
    }
    
    // Remove photo from database
    await User.findByIdAndUpdate(currentUser._id, {
      $pull: { 'profile.photos': { _id: deletedPhoto._id } }
    });

    // Get updated user to check remaining photos
    const updatedUser = await User.findById(currentUser._id);
    
    // If deleted photo was primary and there are remaining photos, set first as primary
    if (deletedPhoto.isPrimary && updatedUser.profile.photos.length > 0) {
      await User.findByIdAndUpdate(currentUser._id, {
        $set: { 'profile.photos.0.isPrimary': true }
      });
    }

    console.log('✅ Photo deleted successfully');

    res.status(200).json({
      success: true,
      message: 'Photo deleted successfully',
      data: {
        deletedPhotoId: deletedPhoto._id,
        remainingPhotos: updatedUser.profile.photos.length,
        wasCloudinaryPhoto: !!deletedPhoto.cloudinaryId
      }
    });

  } catch (error) {
    console.error('Photo deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete photo'
    });
  }
});

// Set photo as primary
app.put('/api/users/me/photos/:photoIndex/primary', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { photoIndex } = req.params;
    const index = parseInt(photoIndex);

    if (isNaN(index) || index < 0 || index >= currentUser.profile.photos.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid photo index'
      });
    }

    console.log('⭐ Setting photo as primary:', { user: currentUser.email, index });

    // Unset all photos as primary
    await User.findByIdAndUpdate(currentUser._id, {
      $set: { 'profile.photos.$[].isPrimary': false }
    });

    // Set selected photo as primary
    await User.findByIdAndUpdate(currentUser._id, {
      $set: { [`profile.photos.${index}.isPrimary`]: true }
    });

    console.log('✅ Primary photo updated successfully');

    res.status(200).json({
      success: true,
      message: 'Primary photo updated successfully',
      data: {
        primaryPhotoIndex: index
      }
    });

  } catch (error) {
    console.error('Primary photo update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update primary photo'
    });
  }
});

// Update photo caption
app.put('/api/users/me/photos/:photoIndex/caption', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { photoIndex } = req.params;
    const { caption } = req.body;
    const index = parseInt(photoIndex);

    if (isNaN(index) || index < 0 || index >= currentUser.profile.photos.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid photo index'
      });
    }

    if (typeof caption !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Caption must be a string'
      });
    }

    console.log('✏️ Updating photo caption:', { user: currentUser.email, index, caption: caption.substring(0, 50) });

    // Update photo caption
    await User.findByIdAndUpdate(currentUser._id, {
      $set: { [`profile.photos.${index}.caption`]: caption.trim() }
    });

    console.log('✅ Photo caption updated successfully');

    res.status(200).json({
      success: true,
      message: 'Photo caption updated successfully',
      data: {
        photoIndex: index,
        newCaption: caption.trim()
      }
    });

  } catch (error) {
    console.error('Photo caption update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update photo caption'
    });
  }
});

// Reorder profile photos
app.put('/api/users/me/photos/reorder', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { photoOrder } = req.body; // Array of photo IDs in desired order

    if (!Array.isArray(photoOrder)) {
      return res.status(400).json({
        success: false,
        error: 'Photo order must be an array'
      });
    }

    console.log('🔄 Photo reorder:', { user: currentUser.email, newOrder: photoOrder.length });

    // Update photo order
    const updatedPhotos = currentUser.profile.photos.map(photo => {
      const newOrder = photoOrder.indexOf(photo._id.toString());
      return {
        ...photo.toObject(),
        order: newOrder >= 0 ? newOrder : photo.order
      };
    }).sort((a, b) => a.order - b.order);

    await User.findByIdAndUpdate(currentUser._id, {
      $set: { 'profile.photos': updatedPhotos }
    });

    console.log('✅ Photos reordered successfully');

    res.status(200).json({
      success: true,
      message: 'Photos reordered successfully',
      data: {
        photos: updatedPhotos
      }
    });

  } catch (error) {
    console.error('Photo reorder error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reorder photos'
    });
  }
});

// Update profile prompts
app.put('/api/users/me/prompts', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { prompts } = req.body;

    if (!Array.isArray(prompts)) {
      return res.status(400).json({
        success: false,
        error: 'Prompts must be an array'
      });
    }

    // Validate prompts
    const validPrompts = prompts.filter(prompt => 
      prompt.question && prompt.answer && 
      prompt.question.trim().length > 0 && 
      prompt.answer.trim().length > 0
    );

    console.log('💭 Prompts update:', { user: currentUser.email, count: validPrompts.length });

    await User.findByIdAndUpdate(currentUser._id, {
      $set: { 'profile.prompts': validPrompts }
    });

    console.log('✅ Prompts updated successfully');

    res.status(200).json({
      success: true,
      message: 'Prompts updated successfully',
      data: {
        prompts: validPrompts,
        totalPrompts: validPrompts.length
      }
    });

  } catch (error) {
    console.error('Prompts update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update prompts'
    });
  }
});

// Get available prompt questions
app.get('/api/users/prompts/available', authenticateToken, async (req, res) => {
  try {
    const availablePrompts = [
      "What's your idea of a perfect Sunday?",
      "The most adventurous thing I've done is...",
      "I'm passionate about...",
      "My friends would describe me as...",
      "The best way to win me over is...",
      "I spend way too much time thinking about...",
      "My love language is...",
      "The song that describes my life is...",
      "I could eat this every day...",
      "My biggest fear is...",
      "If I could have dinner with anyone...",
      "The most important thing in a relationship is...",
      "My guilty pleasure is...",
      "I'm secretly really good at...",
      "My dream vacation would be...",
      "The way to my heart is...",
      "I never get tired of...",
      "My biggest pet peeve is...",
      "If I won the lottery, I would...",
      "I'm looking for someone who..."
    ];

    res.status(200).json({
      success: true,
      message: 'Available prompts retrieved',
      data: {
        prompts: availablePrompts
      }
    });

  } catch (error) {
    console.error('Available prompts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get available prompts'
    });
  }
});

// Request photo verification
app.post('/api/users/me/verification/photos', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;

    if (currentUser.profile.photos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one photo required for verification'
      });
    }

    console.log('🔍 Photo verification request:', { user: currentUser.email });

    // Update verification status to pending
    await User.findByIdAndUpdate(currentUser._id, {
      $set: {
        'verification.photos.verified': false,
        'verification.photos.requestedAt': new Date(),
        'verification.photos.status': 'pending'
      }
    });

    // In a real implementation, this would trigger admin review or AI verification

    console.log('✅ Photo verification requested');

    res.status(200).json({
      success: true,
      message: 'Photo verification requested successfully',
      data: {
        status: 'pending',
        message: 'Your photos will be reviewed within 24 hours'
      }
    });

  } catch (error) {
    console.error('Photo verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to request photo verification'
    });
  }
});

// Send email verification
app.post('/api/users/me/verification/email', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;

    if (currentUser.verification?.email?.verified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified'
      });
    }

    console.log('📧 Email verification request:', { user: currentUser.email });

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with verification code
    await User.findByIdAndUpdate(currentUser._id, {
      $set: {
        'verification.email.verificationCode': verificationCode,
        'verification.email.expiresAt': expiresAt,
        'verification.email.verified': false
      }
    });

    // In a real implementation, send email with verification code
    // For testing, we'll return the code
    console.log('📧 Email verification code generated:', verificationCode);

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your email',
      data: {
        message: 'Please check your email for the verification code',
        expiresAt,
        // For testing only - remove in production
        testCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined
      }
    });

  } catch (error) {
    console.error('Email verification request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send verification email'
    });
  }
});

// Verify email with code
app.post('/api/users/me/verification/email/verify', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Verification code is required'
      });
    }

    console.log('🔐 Email verification attempt:', { user: currentUser.email });

    const emailVerification = currentUser.verification?.email;

    if (!emailVerification || !emailVerification.verificationCode) {
      return res.status(400).json({
        success: false,
        error: 'No verification code found. Please request a new one.'
      });
    }

    if (emailVerification.verified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified'
      });
    }

    if (new Date() > emailVerification.expiresAt) {
      return res.status(400).json({
        success: false,
        error: 'Verification code has expired. Please request a new one.'
      });
    }

    if (emailVerification.verificationCode !== code.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    // Mark email as verified
    await User.findByIdAndUpdate(currentUser._id, {
      $set: {
        'verification.email.verified': true,
        'verification.email.verifiedAt': new Date()
      },
      $unset: {
        'verification.email.verificationCode': 1,
        'verification.email.expiresAt': 1
      }
    });

    console.log('✅ Email verified successfully');

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: {
        emailVerified: true,
        verifiedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify email'
    });
  }
});

// Request phone verification
app.post('/api/users/me/verification/phone', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    // Basic phone number validation
    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      });
    }

    console.log('📱 Phone verification request:', { user: currentUser.email, phone: phoneNumber.substring(0, 6) + '***' });

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with phone and verification code
    await User.findByIdAndUpdate(currentUser._id, {
      $set: {
        'verification.phone.number': phoneNumber,
        'verification.phone.verificationCode': verificationCode,
        'verification.phone.expiresAt': expiresAt,
        'verification.phone.verified': false
      }
    });

    // In a real implementation, send SMS with verification code
    console.log('📱 Phone verification code generated:', verificationCode);

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your phone',
      data: {
        message: `Verification code sent to ${phoneNumber.substring(0, 6)}***`,
        expiresAt,
        // For testing only - remove in production
        testCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined
      }
    });

  } catch (error) {
    console.error('Phone verification request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send verification SMS'
    });
  }
});

// Verify phone with code
app.post('/api/users/me/verification/phone/verify', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Verification code is required'
      });
    }

    console.log('🔐 Phone verification attempt:', { user: currentUser.email });

    const phoneVerification = currentUser.verification?.phone;

    if (!phoneVerification || !phoneVerification.verificationCode) {
      return res.status(400).json({
        success: false,
        error: 'No verification code found. Please request a new one.'
      });
    }

    if (phoneVerification.verified) {
      return res.status(400).json({
        success: false,
        error: 'Phone is already verified'
      });
    }

    if (new Date() > phoneVerification.expiresAt) {
      return res.status(400).json({
        success: false,
        error: 'Verification code has expired. Please request a new one.'
      });
    }

    if (phoneVerification.verificationCode !== code.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    // Mark phone as verified
    await User.findByIdAndUpdate(currentUser._id, {
      $set: {
        'verification.phone.verified': true,
        'verification.phone.verifiedAt': new Date()
      },
      $unset: {
        'verification.phone.verificationCode': 1,
        'verification.phone.expiresAt': 1
      }
    });

    console.log('✅ Phone verified successfully');

    res.status(200).json({
      success: true,
      message: 'Phone verified successfully',
      data: {
        phoneVerified: true,
        verifiedAt: new Date(),
        phoneNumber: phoneVerification.number
      }
    });

  } catch (error) {
    console.error('Phone verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify phone'
    });
  }
});

// Get verification status
app.get('/api/users/me/verification/status', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;

    const verificationStatus = {
      email: {
        verified: currentUser.verification?.email?.verified || false,
        verifiedAt: currentUser.verification?.email?.verifiedAt || null,
        hasPendingCode: !!(currentUser.verification?.email?.verificationCode && 
                          currentUser.verification?.email?.expiresAt && 
                          new Date() < currentUser.verification.email.expiresAt)
      },
      phone: {
        verified: currentUser.verification?.phone?.verified || false,
        verifiedAt: currentUser.verification?.phone?.verifiedAt || null,
        phoneNumber: currentUser.verification?.phone?.verified ? 
          currentUser.verification.phone.number : null,
        hasPendingCode: !!(currentUser.verification?.phone?.verificationCode && 
                          currentUser.verification?.phone?.expiresAt && 
                          new Date() < currentUser.verification.phone.expiresAt)
      },
      photos: {
        verified: currentUser.verification?.photos?.verified || false,
        verifiedAt: currentUser.verification?.photos?.verifiedAt || null,
        status: currentUser.verification?.photos?.status || 'not_requested',
        requestedAt: currentUser.verification?.photos?.requestedAt || null
      },
      identity: {
        verified: currentUser.verification?.identity?.verified || false,
        verifiedAt: currentUser.verification?.identity?.verifiedAt || null,
        documentType: currentUser.verification?.identity?.documentType || null
      }
    };

    const overallScore = Object.values(verificationStatus).reduce((score, category) => {
      return score + (category.verified ? 1 : 0);
    }, 0);

    res.status(200).json({
      success: true,
      message: 'Verification status retrieved',
      data: {
        verificationStatus,
        overallScore,
        maxScore: 4,
        completionPercentage: Math.round((overallScore / 4) * 100)
      }
    });

  } catch (error) {
    console.error('Verification status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get verification status'
    });
  }
});

// Update account settings
app.put('/api/users/me/settings', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { section, settings } = req.body;

    const validSections = ['notifications', 'privacy', 'discovery'];
    if (!validSections.includes(section)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid settings section'
      });
    }

    console.log('⚙️ Settings update:', { section, user: currentUser.email });

    const updateQuery = {};
    updateQuery[`settings.${section}`] = settings;

    await User.findByIdAndUpdate(currentUser._id, {
      $set: updateQuery
    });

    console.log('✅ Settings updated successfully');

    res.status(200).json({
      success: true,
      message: `${section} settings updated successfully`,
      data: {
        section,
        settings
      }
    });

  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings'
    });
  }
});

// Get profile analytics
app.get('/api/users/me/analytics', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;

    const analytics = {
      profileViews: currentUser.analytics.profileViews || 0,
      totalSwipes: currentUser.analytics.totalSwipes || 0,
      totalMatches: currentUser.analytics.totalMatches || 0,
      totalMessages: currentUser.analytics.totalMessages || 0,
      joinedAt: currentUser.analytics.joinedAt,
      lastActiveAt: currentUser.analytics.lastActiveAt,
      profileCompletion: calculateProfileCompletion(currentUser),
      verificationStatus: {
        email: currentUser.verification?.email?.verified || false,
        phone: currentUser.verification?.phone?.verified || false,
        photos: currentUser.verification?.photos?.verified || false,
        identity: currentUser.verification?.identity?.verified || false
      }
    };

    res.status(200).json({
      success: true,
      message: 'Profile analytics retrieved',
      data: {
        analytics
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics'
    });
  }
});

// Helper function to calculate profile completion
function calculateProfileCompletion(user) {
  const checks = {
    basicInfo: !!(user.profile.name && user.profile.age && user.profile.bio),
    photos: user.profile.photos && user.profile.photos.length >= 2,
    prompts: user.profile.prompts && user.profile.prompts.length >= 3,
    interests: user.profile.interests && user.profile.interests.length >= 3,
    preferences: !!(user.profile.agePreference && user.profile.genderPreference && user.profile.genderPreference.length > 0),
    location: !!(user.profile.location && user.profile.location.coordinates),
    verification: user.verification?.email?.verified || false
  };

  const completed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const percentage = Math.round((completed / total) * 100);

  return {
    percentage,
    completed,
    total,
    checks,
    recommendations: getProfileRecommendations(checks)
  };
}

// Helper function to get profile improvement recommendations
function getProfileRecommendations(checks) {
  const recommendations = [];

  if (!checks.basicInfo) {
    recommendations.push({
      type: 'basic',
      title: 'Complete Basic Information',
      description: 'Add your name, age, and write a compelling bio',
      priority: 'high'
    });
  }

  if (!checks.photos) {
    recommendations.push({
      type: 'photos',
      title: 'Add More Photos',
      description: 'Upload at least 2 photos to showcase your personality',
      priority: 'high'
    });
  }

  if (!checks.prompts) {
    recommendations.push({
      type: 'prompts',
      title: 'Answer Conversation Starters',
      description: 'Complete 3+ prompts to help others connect with you',
      priority: 'medium'
    });
  }

  if (!checks.interests) {
    recommendations.push({
      type: 'interests',
      title: 'Add Your Interests',
      description: 'List 3+ interests to improve your matches',
      priority: 'medium'
    });
  }

  if (!checks.preferences) {
    recommendations.push({
      type: 'preferences',
      title: 'Set Dating Preferences',
      description: 'Specify age range and gender preferences',
      priority: 'low'
    });
  }

  if (!checks.verification) {
    recommendations.push({
      type: 'verification',
      title: 'Verify Your Profile',
      description: 'Verify your email and photos for better matches',
      priority: 'low'
    });
  }

  return recommendations;
}

// ADMIN DASHBOARD AND MODERATION SYSTEM

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Admin access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'Invalid admin token'
      });
    }

    // Check if user is admin (in a real app, you'd have proper role management)
    if (user.email !== process.env.ADMIN_EMAIL && !user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    req.admin = user;
    next();
  } catch (error) {
    console.log('❌ Admin auth error:', error.message);
    res.status(401).json({
      success: false,
      error: 'Invalid admin token'
    });
  }
};

// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Admin login attempt:', email);

    if (email !== process.env.ADMIN_EMAIL) {
      return res.status(401).json({
        success: false,
        error: 'Invalid admin credentials'
      });
    }

    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        error: 'Invalid admin credentials'
      });
    }

    // Find or create admin user
    let adminUser = await User.findOne({ email: process.env.ADMIN_EMAIL });
    
    if (!adminUser) {
      adminUser = new User({
        email: process.env.ADMIN_EMAIL,
        passwordHash: process.env.ADMIN_PASSWORD,
        profile: {
          name: 'OneTime Admin',
          age: 30,
          gender: 'other',
          dateOfBirth: new Date('1993-01-01'),
          location: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749],
            city: 'San Francisco',
            state: 'CA',
            country: 'US'
          }
        },
        status: 'active',
        isAdmin: true
      });
      await adminUser.save();
    }

    const adminToken = generateToken(adminUser._id);

    console.log('✅ Admin logged in successfully');

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: {
        adminId: adminUser._id,
        email: adminUser.email,
        accessToken: adminToken,
        role: 'admin'
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      error: 'Admin login failed'
    });
  }
});

// Get admin dashboard overview
app.get('/api/admin/dashboard', authenticateAdmin, async (req, res) => {
  try {
    console.log('📊 Admin dashboard request');

    // Get user statistics
    const totalUsers = await User.countDocuments({});
    const activeUsers = await User.countDocuments({ status: 'active' });
    const verifiedUsers = await User.countDocuments({ 'verification.email.verified': true });
    const suspendedUsers = await User.countDocuments({ status: 'suspended' });

    // Get recent registrations (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentRegistrations = await User.countDocuments({ 
      createdAt: { $gte: weekAgo }
    });

    // Get matching statistics
    const totalMatches = await Match.countDocuments({});
    const activeMatches = await Match.countDocuments({ status: 'active' });
    
    // Get recent matches (last 24 hours)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentMatches = await Match.countDocuments({
      matchedAt: { $gte: dayAgo }
    });

    // Get message statistics
    const totalMessages = await Message.countDocuments({});
    const recentMessages = await Message.countDocuments({
      timestamp: { $gte: dayAgo }
    });

    // Get activity statistics
    const totalActivities = await Activity.countDocuments({});
    const approvedActivities = await Activity.countDocuments({ isApproved: true });
    const pendingActivities = await Activity.countDocuments({ isApproved: false });

    // Get user reports
    const totalReports = await User.aggregate([
      { $unwind: '$safety.reports' },
      { $count: 'total' }
    ]);

    const pendingReports = await User.aggregate([
      { $unwind: '$safety.reports' },
      { $match: { 'safety.reports.status': 'pending' } },
      { $count: 'total' }
    ]);

    // Get photo verification requests
    const pendingPhotoVerifications = await User.countDocuments({
      'verification.photos.status': 'pending'
    });

    const dashboardStats = {
      users: {
        total: totalUsers,
        active: activeUsers,
        verified: verifiedUsers,
        suspended: suspendedUsers,
        recentRegistrations
      },
      matches: {
        total: totalMatches,
        active: activeMatches,
        recent: recentMatches
      },
      messages: {
        total: totalMessages,
        recent: recentMessages
      },
      activities: {
        total: totalActivities,
        approved: approvedActivities,
        pending: pendingActivities
      },
      moderation: {
        totalReports: totalReports[0]?.total || 0,
        pendingReports: pendingReports[0]?.total || 0,
        pendingPhotoVerifications
      }
    };

    res.status(200).json({
      success: true,
      message: 'Dashboard overview retrieved',
      data: dashboardStats
    });

  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard overview'
    });
  }
});

// Get all users with pagination and filters
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      verified, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    console.log('👥 Admin users list request:', { page, limit, status, verified, search });

    // Build query filters
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (verified !== undefined) {
      query['verification.email.verified'] = verified === 'true';
    }
    
    if (search) {
      query.$or = [
        { 'profile.name': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get users
    const users = await User.find(query)
      .select('-passwordHash')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / parseInt(limit));

    const usersWithStats = users.map(user => ({
      _id: user._id,
      email: user.email,
      profile: {
        name: user.profile.name,
        age: user.profile.age,
        gender: user.profile.gender,
        location: user.profile.location
      },
      status: user.status,
      verification: {
        email: user.verification?.email?.verified || false,
        phone: user.verification?.phone?.verified || false,
        photos: user.verification?.photos?.verified || false
      },
      analytics: {
        totalSwipes: user.analytics?.totalSwipes || 0,
        totalMatches: user.analytics?.totalMatches || 0,
        totalMessages: user.analytics?.totalMessages || 0,
        lastActiveAt: user.analytics?.lastActiveAt
      },
      createdAt: user.createdAt,
      photoCount: user.profile.photos?.length || 0
    }));

    res.status(200).json({
      success: true,
      message: 'Users list retrieved',
      data: {
        users: usersWithStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalUsers,
          totalPages,
          hasMore: page < totalPages
        },
        filters: { status, verified, search, sortBy, sortOrder }
      }
    });

  } catch (error) {
    console.error('Admin users list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users list'
    });
  }
});

// Get detailed user profile for admin
app.get('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('🔍 Admin user detail request:', userId);

    const user = await User.findById(userId).select('-passwordHash');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user's matches
    const matches = await Match.find({
      $or: [{ user1: userId }, { user2: userId }]
    }).populate('user1 user2', 'profile.name email');

    // Get user's recent messages
    const recentMessages = await Message.find({
      sender: userId
    })
    .populate('conversationId')
    .sort({ timestamp: -1 })
    .limit(10);

    // Get user's swipe history
    const swipeHistory = await UserSwipe.find({
      swiperId: userId
    })
    .populate('targetId', 'profile.name email')
    .sort({ timestamp: -1 })
    .limit(20);

    const userDetail = {
      ...user.toObject(),
      matches: matches.map(match => ({
        _id: match._id,
        matchedAt: match.matchedAt,
        status: match.status,
        otherUser: match.user1._id.toString() === userId ? match.user2 : match.user1
      })),
      recentMessages: recentMessages.map(msg => ({
        _id: msg._id,
        content: msg.content,
        timestamp: msg.timestamp,
        conversationId: msg.conversationId
      })),
      swipeHistory: swipeHistory.map(swipe => ({
        _id: swipe._id,
        action: swipe.action,
        timestamp: swipe.timestamp,
        targetUser: swipe.targetId
      }))
    };

    res.status(200).json({
      success: true,
      message: 'User detail retrieved',
      data: {
        user: userDetail
      }
    });

  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user detail'
    });
  }
});

// Update user status (suspend, activate, delete)
app.put('/api/admin/users/:userId/status', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, reason } = req.body;

    const validStatuses = ['active', 'suspended', 'deleted'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be active, suspended, or deleted'
      });
    }

    console.log('⚖️ Admin user status update:', { userId, status, reason });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update user status
    await User.findByIdAndUpdate(userId, {
      $set: {
        status,
        'moderation.lastAction': {
          action: `status_changed_to_${status}`,
          reason: reason || 'No reason provided',
          performedBy: req.admin._id,
          performedAt: new Date()
        }
      }
    });

    console.log('✅ User status updated successfully');

    res.status(200).json({
      success: true,
      message: `User status updated to ${status}`,
      data: {
        userId,
        newStatus: status,
        reason,
        updatedBy: req.admin.email,
        updatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('User status update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user status'
    });
  }
});

// Verify user photos (approve/reject)
app.put('/api/admin/users/:userId/verify-photos', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, reason } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Action must be approve or reject'
      });
    }

    console.log('📸 Admin photo verification:', { userId, action, reason });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const updateData = {
      'verification.photos.verified': action === 'approve',
      'verification.photos.verifiedAt': new Date(),
      'verification.photos.verifiedBy': req.admin._id,
      'verification.photos.status': action === 'approve' ? 'approved' : 'rejected'
    };

    if (action === 'reject' && reason) {
      updateData['verification.photos.rejectionReason'] = reason;
    }

    await User.findByIdAndUpdate(userId, {
      $set: updateData
    });

    console.log('✅ Photo verification completed');

    res.status(200).json({
      success: true,
      message: `Photos ${action}d successfully`,
      data: {
        userId,
        action,
        reason,
        verifiedBy: req.admin.email,
        verifiedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Photo verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify photos'
    });
  }
});

// Get pending reports
app.get('/api/admin/reports', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'pending' } = req.query;

    console.log('📋 Admin reports request:', { page, limit, status });

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users with reports
    const usersWithReports = await User.find({
      'safety.reports': { $exists: true, $ne: [] },
      'safety.reports.status': status
    })
    .populate('safety.reports.reportedBy', 'profile.name email')
    .select('email profile.name safety.reports')
    .skip(skip)
    .limit(parseInt(limit));

    // Flatten reports with user context
    const reports = [];
    usersWithReports.forEach(user => {
      user.safety.reports
        .filter(report => report.status === status)
        .forEach(report => {
          reports.push({
            _id: report._id,
            reportedUser: {
              _id: user._id,
              name: user.profile.name,
              email: user.email
            },
            reportedBy: report.reportedBy,
            reason: report.reason,
            description: report.description,
            reportedAt: report.reportedAt,
            status: report.status
          });
        });
    });

    // Sort by report date
    reports.sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));

    const totalReports = await User.aggregate([
      { $unwind: '$safety.reports' },
      { $match: { 'safety.reports.status': status } },
      { $count: 'total' }
    ]);

    const total = totalReports[0]?.total || 0;
    const totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Reports retrieved',
      data: {
        reports,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasMore: page < totalPages
        }
      }
    });

  } catch (error) {
    console.error('Admin reports error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get reports'
    });
  }
});

// Handle report (resolve, dismiss)
app.put('/api/admin/reports/:reportId', authenticateAdmin, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action, resolution, userAction } = req.body; // action: 'resolve' or 'dismiss'

    console.log('⚖️ Admin report handling:', { reportId, action, userAction });

    // Find the user with this report
    const user = await User.findOne({
      'safety.reports._id': reportId
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // Update report status
    await User.findOneAndUpdate(
      { 'safety.reports._id': reportId },
      {
        $set: {
          'safety.reports.$.status': action === 'resolve' ? 'resolved' : 'dismissed',
          'safety.reports.$.resolvedBy': req.admin._id,
          'safety.reports.$.resolvedAt': new Date(),
          'safety.reports.$.resolution': resolution
        }
      }
    );

    // Take action on user if specified
    if (userAction && ['suspend', 'delete', 'warn'].includes(userAction)) {
      const statusMap = {
        'suspend': 'suspended',
        'delete': 'deleted',
        'warn': 'active' // Keep active but add warning
      };

      await User.findByIdAndUpdate(user._id, {
        $set: {
          status: statusMap[userAction],
          'moderation.lastAction': {
            action: userAction,
            reason: `Report resolution: ${resolution}`,
            performedBy: req.admin._id,
            performedAt: new Date()
          }
        }
      });
    }

    console.log('✅ Report handled successfully');

    res.status(200).json({
      success: true,
      message: `Report ${action}d successfully`,
      data: {
        reportId,
        action,
        userAction,
        resolution,
        handledBy: req.admin.email,
        handledAt: new Date()
      }
    });

  } catch (error) {
    console.error('Report handling error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to handle report'
    });
  }
});

// Manage activities (approve/reject)
app.get('/api/admin/activities', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'pending' } = req.query;

    console.log('🎯 Admin activities request:', { page, limit, status });

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const query = status === 'pending' ? { isApproved: false } : { isApproved: true };

    const activities = await Activity.find(query)
      .populate('createdBy', 'profile.name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalActivities = await Activity.countDocuments(query);
    const totalPages = Math.ceil(totalActivities / parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Activities retrieved',
      data: {
        activities,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalActivities,
          totalPages,
          hasMore: page < totalPages
        }
      }
    });

  } catch (error) {
    console.error('Admin activities error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activities'
    });
  }
});

app.put('/api/admin/activities/:activityId/approve', authenticateAdmin, async (req, res) => {
  try {
    const { activityId } = req.params;
    const { action, reason } = req.body; // action: 'approve' or 'reject'

    console.log('🎯 Admin activity approval:', { activityId, action, reason });

    const activity = await Activity.findById(activityId);
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    await Activity.findByIdAndUpdate(activityId, {
      $set: {
        isApproved: action === 'approve',
        status: action === 'approve' ? 'active' : 'inactive',
        approvedBy: req.admin._id,
        approvedAt: new Date(),
        rejectionReason: action === 'reject' ? reason : undefined
      }
    });

    console.log('✅ Activity approval completed');

    res.status(200).json({
      success: true,
      message: `Activity ${action}d successfully`,
      data: {
        activityId,
        action,
        reason,
        approvedBy: req.admin.email,
        approvedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Activity approval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve activity'
    });
  }
});

// System monitoring endpoints
app.get('/api/admin/system/stats', authenticateAdmin, async (req, res) => {
  try {
    console.log('📊 System stats request');

    // Database connection status
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Active WebSocket connections
    const activeConnections = activeConnections.size || 0;
    
    // Memory usage
    const memoryUsage = process.memoryUsage();
    
    // Server uptime
    const uptime = process.uptime();
    
    // Recent error logs (in a real app, you'd read from log files)
    const recentErrors = []; // Placeholder for actual error logging
    
    // Performance metrics
    const performanceMetrics = {
      avgResponseTime: 150, // Placeholder - implement actual metrics
      requestsPerMinute: 45, // Placeholder
      errorRate: 0.02 // Placeholder
    };

    const systemStats = {
      server: {
        status: 'healthy',
        uptime: Math.floor(uptime),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
      },
      database: {
        status: dbStatus,
        connectionPool: 'healthy' // Placeholder
      },
      realtime: {
        activeConnections,
        status: 'operational'
      },
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024)
      },
      performance: performanceMetrics,
      recentErrors: recentErrors.slice(0, 10)
    };

    res.status(200).json({
      success: true,
      message: 'System stats retrieved',
      data: systemStats
    });

  } catch (error) {
    console.error('System stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system stats'
    });
  }
});

// Export users data (for analytics/backup)
app.get('/api/admin/export/users', authenticateAdmin, async (req, res) => {
  try {
    const { format = 'json', status = 'active' } = req.query;

    console.log('📤 User export request:', { format, status });

    const query = status ? { status } : {};
    
    const users = await User.find(query)
      .select('-passwordHash -verification')
      .lean();

    const exportData = {
      exportedAt: new Date(),
      totalUsers: users.length,
      filters: { status },
      users: users.map(user => ({
        id: user._id,
        email: user.email,
        name: user.profile?.name,
        age: user.profile?.age,
        gender: user.profile?.gender,
        city: user.profile?.location?.city,
        joinedAt: user.createdAt,
        lastActive: user.analytics?.lastActiveAt,
        totalMatches: user.analytics?.totalMatches || 0,
        totalMessages: user.analytics?.totalMessages || 0,
        emailVerified: user.verification?.email?.verified || false
      }))
    };

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = 'id,email,name,age,gender,city,joinedAt,lastActive,totalMatches,totalMessages,emailVerified\n';
      const csvData = exportData.users.map(user => 
        `${user.id},${user.email},${user.name || ''},${user.age || ''},${user.gender || ''},${user.city || ''},${user.joinedAt},${user.lastActive || ''},${user.totalMatches},${user.totalMessages},${user.emailVerified}`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=users_export_${Date.now()}.csv`);
      res.send(csvHeaders + csvData);
    } else {
      res.status(200).json({
        success: true,
        message: 'User export completed',
        data: exportData
      });
    }

  } catch (error) {
    console.error('User export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export users'
    });
  }
});

// Send broadcast notification (in a real app, integrate with push notification service)
app.post('/api/admin/notifications/broadcast', authenticateAdmin, async (req, res) => {
  try {
    const { title, message, targetUsers = 'all', category = 'announcement' } = req.body;

    console.log('📢 Broadcast notification:', { title, targetUsers, category });

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Title and message are required'
      });
    }

    // Build user query based on target
    let userQuery = { status: 'active' };
    
    if (targetUsers === 'verified') {
      userQuery['verification.email.verified'] = true;
    } else if (targetUsers === 'premium') {
      userQuery['subscription.type'] = { $in: ['premium', 'premium_plus'] };
    }

    const targetUserList = await User.find(userQuery).select('_id email profile.name');

    // In a real implementation, you would:
    // 1. Save notifications to database
    // 2. Send push notifications via FCM/APNS
    // 3. Send emails if needed
    // 4. Emit real-time notifications via Socket.io

    // For now, just emit to active Socket connections
    targetUserList.forEach(user => {
      const userConnection = activeConnections.get(user._id.toString());
      if (userConnection) {
        userConnection.socket.emit('broadcast_notification', {
          title,
          message,
          category,
          sentAt: new Date()
        });
      }
    });

    console.log('✅ Broadcast notification sent');

    res.status(200).json({
      success: true,
      message: 'Broadcast notification sent',
      data: {
        title,
        message,
        targetUsers,
        recipientCount: targetUserList.length,
        activeRecipients: targetUserList.filter(user => 
          activeConnections.has(user._id.toString())
        ).length,
        sentAt: new Date()
      }
    });

  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send broadcast notification'
    });
  }
});

// Get system analytics
app.get('/api/admin/analytics', authenticateAdmin, async (req, res) => {
  try {
    const { period = '7d' } = req.query; // 1d, 7d, 30d, 90d

    console.log('📈 Admin analytics request:', { period });

    // Calculate date range
    const periodMap = {
      '1d': 1,
      '7d': 7,
      '30d': 30,
      '90d': 90
    };

    const days = periodMap[period] || 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // User registration trends
    const registrationTrend = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Match creation trends
    const matchTrend = await Match.aggregate([
      {
        $match: {
          matchedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$matchedAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Message volume trends
    const messageTrend = await Message.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$timestamp'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // User engagement metrics
    const engagementMetrics = {
      averageSessionTime: 45, // minutes - placeholder
      dailyActiveUsers: await User.countDocuments({
        'analytics.lastActiveAt': {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }),
      weeklyActiveUsers: await User.countDocuments({
        'analytics.lastActiveAt': {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }),
      monthlyActiveUsers: await User.countDocuments({
        'analytics.lastActiveAt': {
          $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      })
    };

    const analyticsData = {
      period,
      dateRange: {
        start: startDate,
        end: new Date()
      },
      trends: {
        registrations: registrationTrend,
        matches: matchTrend,
        messages: messageTrend
      },
      engagement: engagementMetrics
    };

    res.status(200).json({
      success: true,
      message: 'Analytics data retrieved',
      data: analyticsData
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics'
    });
  }
});

// REAL-TIME MESSAGING SYSTEM

// Get conversations for user
app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { limit = 20, offset = 0 } = req.query;

    console.log('💬 Conversations request for:', currentUser.email);

    let conversations = [];
    try {
      conversations = await Conversation.find({
        participants: currentUser._id,
        status: 'active'
      })
      .populate('participants', 'profile email')
      .populate('lastMessage')
      .sort({ 'lastMessage.timestamp': -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));
    } catch (error) {
      console.log('⚠️ Conversation collection issue, returning empty array');
    }

    const conversationData = conversations.map(conv => {
      const otherParticipant = conv.participants.find(p => 
        p._id.toString() !== currentUser._id.toString()
      );

      return {
        _id: conv._id,
        participants: conv.participants.map(p => ({
          _id: p._id,
          profile: {
            name: p.profile.name,
            photos: p.profile.photos
          }
        })),
        otherUser: otherParticipant ? {
          _id: otherParticipant._id,
          profile: {
            name: otherParticipant.profile.name,
            photos: otherParticipant.profile.photos
          }
        } : null,
        lastMessage: conv.lastMessage,
        unreadCount: conv.getUnreadCount ? conv.getUnreadCount(currentUser._id) : 0,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt
      };
    });

    console.log('✅ Conversations found:', conversationData.length);

    res.status(200).json({
      success: true,
      message: 'Conversations retrieved',
      data: {
        conversations: conversationData,
        hasMore: conversations.length === parseInt(limit),
        pagination: {
          offset: parseInt(offset),
          limit: parseInt(limit),
          total: conversationData.length
        }
      }
    });

  } catch (error) {
    console.error('Conversations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversations'
    });
  }
});

// Get messages for a conversation
app.get('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    console.log('📩 Messages request for conversation:', conversationId);

    // Verify user is participant in conversation
    let conversation;
    try {
      conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.includes(currentUser._id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to conversation'
        });
      }
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    // Get messages
    let messages = [];
    try {
      messages = await Message.find({
        conversationId: conversationId
      })
      .populate('sender', 'profile email')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));
    } catch (error) {
      console.log('⚠️ Message collection issue, returning empty array');
    }

    const messageData = messages.reverse().map(msg => ({
      _id: msg._id,
      conversationId: msg.conversationId,
      sender: {
        _id: msg.sender._id,
        profile: {
          name: msg.sender.profile.name,
          photos: msg.sender.profile.photos
        }
      },
      content: msg.content,
      timestamp: msg.timestamp,
      readBy: msg.readBy,
      reactions: msg.reactions || [],
      isFromCurrentUser: msg.sender._id.toString() === currentUser._id.toString()
    }));

    console.log('✅ Messages found:', messageData.length);

    res.status(200).json({
      success: true,
      message: 'Messages retrieved',
      data: {
        messages: messageData,
        hasMore: messages.length === parseInt(limit),
        pagination: {
          offset: parseInt(offset),
          limit: parseInt(limit),
          total: messageData.length
        }
      }
    });

  } catch (error) {
    console.error('Messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get messages'
    });
  }
});

// Send a message
app.post('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { conversationId } = req.params;
    const { content, type = 'text' } = req.body;

    console.log('📤 Send message to conversation:', conversationId);

    // Verify conversation exists and user is participant
    let conversation;
    try {
      conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.includes(currentUser._id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to conversation'
        });
      }
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    // Create message
    let message;
    try {
      message = new Message({
        conversationId: conversationId,
        sender: currentUser._id,
        content: {
          type: type,
          text: content
        },
        timestamp: new Date()
      });

      await message.save();
      await message.populate('sender', 'profile email');
    } catch (error) {
      console.log('⚠️ Could not save message:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to send message'
      });
    }

    // Update conversation with last message
    try {
      conversation.lastMessage = {
        content: message.content,
        timestamp: message.timestamp,
        sender: currentUser._id
      };
      conversation.updatedAt = new Date();
      await conversation.save();
    } catch (error) {
      console.log('⚠️ Could not update conversation:', error.message);
    }

    // Emit real-time message to other participants
    const messageData = {
      _id: message._id,
      conversationId: message.conversationId,
      sender: {
        _id: message.sender._id,
        profile: {
          name: message.sender.profile.name,
          photos: message.sender.profile.photos
        }
      },
      content: message.content,
      timestamp: message.timestamp,
      readBy: message.readBy,
      reactions: message.reactions || []
    };

    // Emit to all participants in the conversation room
    io.to(`conversation_${conversationId}`).emit('new_message', messageData);

    console.log('✅ Message sent and broadcasted');

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message: messageData
      }
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

// Create conversation from match
app.post('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { matchId } = req.body;

    console.log('💬 Create conversation from match:', matchId);

    // Verify match exists and user is participant
    let match;
    try {
      match = await Match.findById(matchId);
      if (!match || (match.user1.toString() !== currentUser._id.toString() && 
                     match.user2.toString() !== currentUser._id.toString())) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to match'
        });
      }
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    // Check if conversation already exists
    let existingConversation;
    try {
      existingConversation = await Conversation.findOne({
        matchId: matchId
      });

      if (existingConversation) {
        return res.status(200).json({
          success: true,
          message: 'Conversation already exists',
          data: {
            conversation: {
              _id: existingConversation._id,
              matchId: existingConversation.matchId,
              participants: existingConversation.participants
            }
          }
        });
      }
    } catch (error) {
      console.log('⚠️ Error checking existing conversation');
    }

    // Create new conversation
    let conversation;
    try {
      conversation = new Conversation({
        matchId: matchId,
        participants: [match.user1, match.user2],
        status: 'active',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdAt: new Date()
      });

      await conversation.save();
    } catch (error) {
      console.log('⚠️ Could not create conversation:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to create conversation'
      });
    }

    console.log('✅ Conversation created:', conversation._id);

    res.status(201).json({
      success: true,
      message: 'Conversation created successfully',
      data: {
        conversation: {
          _id: conversation._id,
          matchId: conversation.matchId,
          participants: conversation.participants,
          status: conversation.status,
          expiresAt: conversation.expiresAt,
          createdAt: conversation.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create conversation'
    });
  }
});

// Socket.io authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (!user || user.status !== 'active') {
      return next(new Error('Invalid user'));
    }

    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
};

// Socket.io connection handling
io.use(authenticateSocket);

io.on('connection', (socket) => {
  const userId = socket.userId;
  
  console.log('🔌 Socket connected:', { socketId: socket.id, userId });

  // Store active connection
  activeConnections.set(userId, {
    socketId: socket.id,
    socket: socket,
    connectedAt: new Date(),
    lastSeen: new Date()
  });

  // Join user to their personal room
  socket.join(`user_${userId}`);

  // Handle joining conversation rooms
  socket.on('join_conversation', async (data) => {
    try {
      const { conversationId } = data;
      
      // Verify user is participant in conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.includes(userId)) {
        socket.emit('error', { message: 'Access denied to conversation' });
        return;
      }

      socket.join(`conversation_${conversationId}`);
      console.log('👥 User joined conversation:', { userId, conversationId });
      
      socket.to(`conversation_${conversationId}`).emit('user_joined_conversation', {
        userId: userId,
        conversationId: conversationId
      });
    } catch (error) {
      console.error('Join conversation error:', error);
      socket.emit('error', { message: 'Failed to join conversation' });
    }
  });

  // Handle leaving conversation rooms
  socket.on('leave_conversation', (data) => {
    const { conversationId } = data;
    socket.leave(`conversation_${conversationId}`);
    console.log('👥 User left conversation:', { userId, conversationId });
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    const { conversationId } = data;
    socket.to(`conversation_${conversationId}`).emit('typing_start', {
      userId: userId,
      conversationId: conversationId
    });
  });

  socket.on('typing_stop', (data) => {
    const { conversationId } = data;
    socket.to(`conversation_${conversationId}`).emit('typing_stop', {
      userId: userId,
      conversationId: conversationId
    });
  });

  // Handle user activity updates
  socket.on('user_activity', () => {
    const connection = activeConnections.get(userId);
    if (connection) {
      connection.lastSeen = new Date();
      activeConnections.set(userId, connection);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', { socketId: socket.id, userId });
    activeConnections.delete(userId);
  });
});

// ===========================================
// INTEGRATE ALL ADVANCED FEATURES
// ===========================================

console.log('🚀 Integrating advanced features...');

// Import and integrate all advanced features
const { integrateAdvancedFeatures } = require('./integrate-advanced-features');
integrateAdvancedFeatures(app);

console.log('✅ Advanced features integration complete!');

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Connect to MongoDB
async function connectDB() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully!');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    // Continue without DB for now
  }
}

// Start server
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 OneTime Production Server running on http://localhost:${PORT}`);
    console.log(`📍 Health Check: http://localhost:${PORT}/health`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`💬 Real-time messaging enabled`);
    console.log(`🔐 Ready for testing!`);
  });
}).catch(error => {
  console.error('Server startup failed:', error);
  process.exit(1);
});

module.exports = app;