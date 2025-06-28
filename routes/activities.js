const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { auth, requireEmailVerification } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Get suggested activities
router.get('/suggestions', auth, requireEmailVerification, [
  query('category').optional().isIn(['dining', 'outdoor', 'entertainment', 'cultural', 'sports', 'social', 'virtual']).withMessage('Invalid category'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  query('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  query('radius').optional().isFloat({ min: 1, max: 100 }).withMessage('Radius must be between 1 and 100 km'),
  query('priceRange').optional().isIn(['free', 'budget', 'moderate', 'expensive']).withMessage('Invalid price range'),
  query('timeOfDay').optional().isIn(['morning', 'afternoon', 'evening', 'night']).withMessage('Invalid time of day')
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
      category,
      limit = 20,
      lat,
      lng,
      radius = 25,
      priceRange,
      timeOfDay
    } = req.query;

    const currentUser = req.user;

    // Build query based on filters
    const query = {
      status: 'active',
      isApproved: true
    };

    if (category) {
      query.category = category;
    }

    if (priceRange) {
      query.priceRange = priceRange;
    }

    if (timeOfDay) {
      query.bestTimeOfDay = { $in: [timeOfDay, 'anytime'] };
    }

    // Location-based filtering
    if (lat && lng) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseFloat(radius) * 1000 // Convert km to meters
        }
      };
    } else if (currentUser.profile.location && currentUser.profile.location.coordinates) {
      // Use user's location if no specific location provided
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: currentUser.profile.location.coordinates
          },
          $maxDistance: (currentUser.profile.distancePreference || 25) * 1000
        }
      };
    }

    // Get activities
    let activities = await Activity.find(query)
      .limit(parseInt(limit))
      .lean();

    // If not enough activities found, relax constraints
    if (activities.length < 10 && (category || priceRange || timeOfDay)) {
      const relaxedQuery = {
        status: 'active',
        isApproved: true
      };

      if (lat && lng) {
        relaxedQuery.location = query.location;
      } else if (currentUser.profile.location && currentUser.profile.location.coordinates) {
        relaxedQuery.location = query.location;
      }

      const additionalActivities = await Activity.find(relaxedQuery)
        .limit(parseInt(limit) - activities.length)
        .lean();

      activities = [...activities, ...additionalActivities];
    }

    // Personalize based on user preferences
    if (currentUser.profile.interests && currentUser.profile.interests.length > 0) {
      activities.forEach(activity => {
        const matchingInterests = activity.tags.filter(tag => 
          currentUser.profile.interests.includes(tag)
        );
        activity.relevanceScore = matchingInterests.length;
      });

      // Sort by relevance
      activities.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    }

    // Add distance calculation
    if (currentUser.profile.location && currentUser.profile.location.coordinates) {
      const userCoords = currentUser.profile.location.coordinates;
      
      activities = activities.map(activity => {
        if (activity.location && activity.location.coordinates) {
          const distance = calculateDistance(
            userCoords,
            activity.location.coordinates
          );
          return { ...activity, distance: Math.round(distance * 10) / 10 };
        }
        return activity;
      });
    }

    logger.info('Activity suggestions fetched', {
      userId: currentUser._id,
      filters: req.query,
      resultCount: activities.length
    });

    res.json({
      success: true,
      data: {
        activities: activities.slice(0, parseInt(limit)),
        filters: {
          category,
          priceRange,
          timeOfDay,
          location: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null
        }
      }
    });

  } catch (error) {
    logger.error('Get activity suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity suggestions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get activity categories
router.get('/categories', async (req, res) => {
  try {
    const categories = [
      {
        id: 'dining',
        name: 'Dining',
        description: 'Restaurants, cafes, and food experiences',
        icon: '🍽️'
      },
      {
        id: 'outdoor',
        name: 'Outdoor',
        description: 'Parks, hiking, and outdoor activities',
        icon: '🌳'
      },
      {
        id: 'entertainment',
        name: 'Entertainment',
        description: 'Movies, shows, and live entertainment',
        icon: '🎭'
      },
      {
        id: 'cultural',
        name: 'Cultural',
        description: 'Museums, galleries, and cultural sites',
        icon: '🏛️'
      },
      {
        id: 'sports',
        name: 'Sports',
        description: 'Sports activities and fitness',
        icon: '⚽'
      },
      {
        id: 'social',
        name: 'Social',
        description: 'Social gatherings and events',
        icon: '🎉'
      },
      {
        id: 'virtual',
        name: 'Virtual',
        description: 'Online and virtual activities',
        icon: '💻'
      }
    ];

    res.json({
      success: true,
      data: { categories }
    });

  } catch (error) {
    logger.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create a new activity suggestion
router.post('/', auth, requireEmailVerification, [
  body('title').isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
  body('description').isLength({ min: 10, max: 500 }).withMessage('Description must be 10-500 characters'),
  body('category').isIn(['dining', 'outdoor', 'entertainment', 'cultural', 'sports', 'social', 'virtual']).withMessage('Invalid category'),
  body('location.coordinates').isArray({ min: 2, max: 2 }).withMessage('Coordinates must be [longitude, latitude]'),
  body('location.address').isLength({ min: 5, max: 200 }).withMessage('Address must be 5-200 characters'),
  body('priceRange').isIn(['free', 'budget', 'moderate', 'expensive']).withMessage('Invalid price range'),
  body('duration').isInt({ min: 30, max: 480 }).withMessage('Duration must be 30-480 minutes'),
  body('bestTimeOfDay').isArray().withMessage('Best time of day must be an array'),
  body('tags').isArray().withMessage('Tags must be an array'),
  body('website').optional().isURL().withMessage('Invalid website URL'),
  body('phone').optional().isLength({ min: 10, max: 20 }).withMessage('Invalid phone number')
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

    const currentUser = req.user;
    const activityData = req.body;

    // Create new activity
    const activity = new Activity({
      ...activityData,
      createdBy: currentUser._id,
      status: 'active',
      isApproved: false, // Requires admin approval
      location: {
        type: 'Point',
        coordinates: activityData.location.coordinates,
        address: activityData.location.address
      }
    });

    await activity.save();

    logger.info('Activity suggestion created', {
      activityId: activity._id,
      createdBy: currentUser._id,
      title: activity.title
    });

    res.status(201).json({
      success: true,
      data: {
        activity: {
          _id: activity._id,
          title: activity.title,
          category: activity.category,
          status: activity.status,
          isApproved: activity.isApproved
        }
      },
      message: 'Activity suggestion submitted for review'
    });

  } catch (error) {
    logger.error('Create activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create activity suggestion',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get a specific activity
router.get('/:activityId', auth, requireEmailVerification, async (req, res) => {
  try {
    const { activityId } = req.params;
    const currentUser = req.user;

    const activity = await Activity.findById(activityId)
      .populate('createdBy', 'profile.name')
      .lean();

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    // Only show approved activities unless user is the creator
    if (!activity.isApproved && activity.createdBy._id.toString() !== currentUser._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    // Add distance if user has location
    if (currentUser.profile.location && currentUser.profile.location.coordinates && 
        activity.location && activity.location.coordinates) {
      const distance = calculateDistance(
        currentUser.profile.location.coordinates,
        activity.location.coordinates
      );
      activity.distance = Math.round(distance * 10) / 10;
    }

    res.json({
      success: true,
      data: { activity }
    });

  } catch (error) {
    logger.error('Get activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Rate an activity
router.post('/:activityId/rate', auth, requireEmailVerification, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('review').optional().isLength({ max: 500 }).withMessage('Review must be max 500 characters')
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

    const { activityId } = req.params;
    const { rating, review } = req.body;
    const currentUser = req.user;

    const activity = await Activity.findById(activityId);
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    // Check if user already rated this activity
    const existingRating = activity.ratings.find(r => 
      r.user.toString() === currentUser._id.toString()
    );

    if (existingRating) {
      // Update existing rating
      existingRating.rating = rating;
      existingRating.review = review;
      existingRating.ratedAt = new Date();
    } else {
      // Add new rating
      activity.ratings.push({
        user: currentUser._id,
        rating,
        review,
        ratedAt: new Date()
      });
    }

    // Recalculate average rating
    const totalRatings = activity.ratings.length;
    const sumRatings = activity.ratings.reduce((sum, r) => sum + r.rating, 0);
    activity.averageRating = Math.round((sumRatings / totalRatings) * 10) / 10;

    await activity.save();

    logger.info('Activity rated', {
      activityId: activity._id,
      userId: currentUser._id,
      rating,
      newAverage: activity.averageRating
    });

    res.json({
      success: true,
      data: {
        averageRating: activity.averageRating,
        totalRatings: totalRatings
      },
      message: 'Rating submitted successfully'
    });

  } catch (error) {
    logger.error('Rate activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate activity',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Report an activity
router.post('/:activityId/report', auth, requireEmailVerification, [
  body('reason').isIn(['inappropriate', 'inaccurate', 'spam', 'closed', 'other']).withMessage('Invalid report reason'),
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

    const { activityId } = req.params;
    const { reason, description } = req.body;
    const currentUser = req.user;

    const activity = await Activity.findById(activityId);
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    // Check if user already reported this activity
    const existingReport = activity.reports.find(r => 
      r.reportedBy.toString() === currentUser._id.toString()
    );

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this activity'
      });
    }

    // Add report
    activity.reports.push({
      reportedBy: currentUser._id,
      reason,
      description,
      reportedAt: new Date()
    });

    await activity.save();

    logger.info('Activity reported', {
      activityId: activity._id,
      reportedBy: currentUser._id,
      reason
    });

    res.json({
      success: true,
      message: 'Report submitted successfully'
    });

  } catch (error) {
    logger.error('Report activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to report activity',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get popular activities
router.get('/popular/trending', auth, requireEmailVerification, [
  query('category').optional().isIn(['dining', 'outdoor', 'entertainment', 'cultural', 'sports', 'social', 'virtual']).withMessage('Invalid category'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('timeframe').optional().isIn(['week', 'month', 'all']).withMessage('Invalid timeframe')
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
      category,
      limit = 20,
      timeframe = 'month'
    } = req.query;

    const currentUser = req.user;

    // Build query
    const query = {
      status: 'active',
      isApproved: true,
      averageRating: { $gte: 4.0 }
    };

    if (category) {
      query.category = category;
    }

    // Date filter for timeframe
    if (timeframe !== 'all') {
      const days = timeframe === 'week' ? 7 : 30;
      const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      query['ratings.ratedAt'] = { $gte: dateThreshold };
    }

    // Get popular activities based on ratings and recent activity
    const activities = await Activity.find(query)
      .sort({ 
        averageRating: -1, 
        'ratings.length': -1,
        createdAt: -1 
      })
      .limit(parseInt(limit))
      .lean();

    // Add distance if user has location
    if (currentUser.profile.location && currentUser.profile.location.coordinates) {
      const userCoords = currentUser.profile.location.coordinates;
      
      activities.forEach(activity => {
        if (activity.location && activity.location.coordinates) {
          const distance = calculateDistance(userCoords, activity.location.coordinates);
          activity.distance = Math.round(distance * 10) / 10;
        }
      });
    }

    res.json({
      success: true,
      data: {
        activities,
        timeframe,
        category: category || 'all'
      }
    });

  } catch (error) {
    logger.error('Get popular activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popular activities',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Helper function to calculate distance between two coordinates
function calculateDistance(coords1, coords2) {
  const [lng1, lat1] = coords1;
  const [lng2, lat2] = coords2;
  
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = router;