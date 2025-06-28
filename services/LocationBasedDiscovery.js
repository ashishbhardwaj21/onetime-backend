/**
 * Real-time Location-Based Discovery System
 * 
 * Features:
 * - Live location tracking with privacy controls
 * - Geofencing for location-based notifications
 * - Event-based matching (concerts, cafes, etc.)
 * - "Nearby now" real-time discovery
 * - Location-based activity suggestions
 */

const User = require('../models/User');
const Activity = require('../models/Activity');
const UserSwipe = require('../models/UserSwipe');

class LocationBasedDiscovery {
  constructor() {
    this.activeUsers = new Map(); // Store users with live location
    this.geofences = new Map();   // Store location-based events
    this.proximityThreshold = 500; // meters for "nearby now"
    
    // Start cleanup interval for stale locations
    setInterval(() => this.cleanupStaleLocations(), 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Update user's real-time location
   * @param {string} userId - User ID
   * @param {Object} location - Location data with coordinates, accuracy, timestamp
   * @param {Object} preferences - Privacy preferences
   */
  async updateUserLocation(userId, location, preferences = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate location data
      if (!this.isValidLocation(location)) {
        throw new Error('Invalid location data');
      }

      // Check privacy settings
      if (!user.privacy?.shareLocation) {
        console.log(`🔒 Location sharing disabled for user: ${userId}`);
        return { success: false, reason: 'Location sharing disabled' };
      }

      // Update live location cache
      this.activeUsers.set(userId, {
        userId,
        location: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude],
          accuracy: location.accuracy,
          timestamp: new Date()
        },
        preferences: {
          visibleRange: preferences.visibleRange || 5000, // meters
          shareWithMatches: preferences.shareWithMatches !== false,
          nearbyNotifications: preferences.nearbyNotifications !== false
        },
        lastUpdate: new Date()
      });

      // Update user's stored location (less frequently)
      const timeSinceLastDbUpdate = Date.now() - (user.profile.location?.lastUpdated || 0);
      if (timeSinceLastDbUpdate > 10 * 60 * 1000) { // Update DB every 10 minutes
        await User.findByIdAndUpdate(userId, {
          'profile.location': {
            type: 'Point',
            coordinates: [location.longitude, location.latitude],
            accuracy: location.accuracy,
            lastUpdated: new Date()
          }
        });
      }

      // Check for nearby users and events
      const nearbyData = await this.findNearbyUsersAndEvents(userId);
      
      console.log(`📍 Location updated for user: ${userId}`);
      return {
        success: true,
        nearbyUsers: nearbyData.users,
        nearbyEvents: nearbyData.events,
        suggestions: nearbyData.suggestions
      };

    } catch (error) {
      console.error('Location update error:', error);
      throw error;
    }
  }

  /**
   * Find users and events near a specific user
   * @param {string} userId - User ID to find nearby content for
   * @returns {Object} Nearby users, events, and suggestions
   */
  async findNearbyUsersAndEvents(userId) {
    try {
      const userLocationData = this.activeUsers.get(userId);
      if (!userLocationData) {
        return { users: [], events: [], suggestions: [] };
      }

      const userLocation = userLocationData.location;
      const visibleRange = userLocationData.preferences.visibleRange;

      // Find nearby active users
      const nearbyUsers = await this.findNearbyUsers(userId, userLocation, visibleRange);
      
      // Find nearby events and activities
      const nearbyEvents = await this.findNearbyEvents(userLocation, visibleRange);
      
      // Generate location-based suggestions
      const suggestions = await this.generateLocationSuggestions(userLocation, nearbyUsers, nearbyEvents);

      return {
        users: nearbyUsers,
        events: nearbyEvents,
        suggestions
      };

    } catch (error) {
      console.error('Nearby search error:', error);
      return { users: [], events: [], suggestions: [] };
    }
  }

  /**
   * Find users currently nearby with live locations
   * @param {string} currentUserId - Current user ID
   * @param {Object} currentLocation - Current user's location
   * @param {number} range - Search range in meters
   * @returns {Array} Nearby users with compatibility scores
   */
  async findNearbyUsers(currentUserId, currentLocation, range) {
    try {
      const nearbyUsers = [];
      const currentUser = await User.findById(currentUserId);
      
      // Get users that this user hasn't swiped on
      const swipedUserIds = await UserSwipe.find({ user: currentUserId })
        .distinct('targetUser');

      // Check all active users for proximity
      for (const [userId, userData] of this.activeUsers.entries()) {
        if (userId === currentUserId || swipedUserIds.includes(userId)) {
          continue;
        }

        const distance = this.calculateDistance(
          currentLocation.coordinates,
          userData.location.coordinates
        );

        if (distance <= range) {
          // Get full user data
          const user = await User.findById(userId).select('profile email lastActive');
          if (user && user.status === 'active') {
            
            // Check age and gender preferences
            if (this.matchesPreferences(currentUser, user)) {
              nearbyUsers.push({
                user: {
                  _id: user._id,
                  profile: {
                    name: user.profile.name,
                    age: user.profile.age,
                    photos: user.profile.photos || [],
                    bio: user.profile.bio
                  }
                },
                distance: Math.round(distance),
                lastSeen: userData.lastUpdate,
                isOnlineNow: this.isRecentlyActive(userData.lastUpdate),
                estimatedTimeNearby: this.estimateTimeNearby(userData)
              });
            }
          }
        }
      }

      // Sort by distance
      nearbyUsers.sort((a, b) => a.distance - b.distance);
      
      return nearbyUsers.slice(0, 10); // Limit to 10 nearby users

    } catch (error) {
      console.error('Nearby users search error:', error);
      return [];
    }
  }

  /**
   * Find nearby events and activities
   * @param {Object} location - User's location
   * @param {number} range - Search range in meters
   * @returns {Array} Nearby events
   */
  async findNearbyEvents(location, range) {
    try {
      const nearbyEvents = await Activity.find({
        'location.coordinates': {
          $near: {
            $geometry: location,
            $maxDistance: range
          }
        },
        status: 'active',
        startDate: { $gte: new Date() }, // Future events
        endDate: { $gte: new Date() }    // Not expired
      }).limit(5);

      return nearbyEvents.map(event => ({
        _id: event._id,
        title: event.title,
        description: event.description,
        category: event.category,
        location: {
          name: event.location.name,
          address: event.location.address
        },
        startDate: event.startDate,
        endDate: event.endDate,
        distance: this.calculateDistance(
          location.coordinates,
          event.location.coordinates
        ),
        participantCount: event.participants?.length || 0,
        maxParticipants: event.maxParticipants
      }));

    } catch (error) {
      console.error('Nearby events search error:', error);
      return [];
    }
  }

  /**
   * Generate location-based activity suggestions
   * @param {Object} userLocation - User's current location
   * @param {Array} nearbyUsers - Nearby users
   * @param {Array} nearbyEvents - Nearby events
   * @returns {Array} Activity suggestions
   */
  async generateLocationSuggestions(userLocation, nearbyUsers, nearbyEvents) {
    const suggestions = [];

    // Coffee meetup suggestions if multiple users nearby
    if (nearbyUsers.length >= 2) {
      suggestions.push({
        type: 'meetup',
        title: 'Coffee Meetup Nearby',
        description: `${nearbyUsers.length} potential matches are nearby. Perfect time for a coffee!`,
        action: 'suggest_coffee_meetup',
        priority: 'high'
      });
    }

    // Event-based suggestions
    if (nearbyEvents.length > 0) {
      const upcomingEvent = nearbyEvents[0];
      suggestions.push({
        type: 'event',
        title: 'Join a Local Event',
        description: `"${upcomingEvent.title}" is happening nearby`,
        eventId: upcomingEvent._id,
        action: 'suggest_event_attendance',
        priority: 'medium'
      });
    }

    // Location-specific suggestions based on POI data
    const locationSuggestions = await this.generateLocationSpecificSuggestions(userLocation);
    suggestions.push(...locationSuggestions);

    return suggestions;
  }

  /**
   * Generate suggestions based on location type (mall, park, etc.)
   */
  async generateLocationSpecificSuggestions(location) {
    // This would integrate with a places API (Google Places, Foursquare, etc.)
    // For now, return generic suggestions
    return [
      {
        type: 'activity',
        title: 'Explore Local Area',
        description: 'Discover interesting places around you',
        action: 'explore_nearby',
        priority: 'low'
      }
    ];
  }

  /**
   * Set up geofence for location-based notifications
   * @param {string} userId - User ID
   * @param {Object} geofence - Geofence parameters
   */
  async createGeofence(userId, geofence) {
    try {
      const geofenceId = `${userId}_${Date.now()}`;
      
      this.geofences.set(geofenceId, {
        userId,
        center: geofence.center,
        radius: geofence.radius,
        type: geofence.type, // 'enter', 'exit', 'dwell'
        callback: geofence.callback,
        expires: new Date(Date.now() + (geofence.duration || 24 * 60 * 60 * 1000)) // 24h default
      });

      console.log(`🔔 Geofence created: ${geofenceId}`);
      return geofenceId;

    } catch (error) {
      console.error('Geofence creation error:', error);
      throw error;
    }
  }

  /**
   * Check if user enters/exits any geofences
   * @param {string} userId - User ID
   * @param {Object} newLocation - New location
   * @param {Object} oldLocation - Previous location
   */
  checkGeofences(userId, newLocation, oldLocation) {
    for (const [geofenceId, geofence] of this.geofences.entries()) {
      if (geofence.userId !== userId) continue;

      const wasInside = oldLocation ? 
        this.isInsideGeofence(oldLocation.coordinates, geofence) : false;
      const isInside = this.isInsideGeofence(newLocation.coordinates, geofence);

      if (!wasInside && isInside && geofence.type === 'enter') {
        this.triggerGeofenceEvent(geofenceId, 'enter', userId);
      } else if (wasInside && !isInside && geofence.type === 'exit') {
        this.triggerGeofenceEvent(geofenceId, 'exit', userId);
      }
    }
  }

  /**
   * Get live nearby users count for a location
   * @param {Array} coordinates - [longitude, latitude]
   * @param {number} radius - Search radius in meters
   * @returns {number} Count of nearby active users
   */
  getNearbyUserCount(coordinates, radius = 1000) {
    let count = 0;
    
    for (const [userId, userData] of this.activeUsers.entries()) {
      const distance = this.calculateDistance(coordinates, userData.location.coordinates);
      if (distance <= radius && this.isRecentlyActive(userData.lastUpdate)) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Get location analytics for admin dashboard
   */
  getLocationAnalytics() {
    const analytics = {
      totalActiveUsers: this.activeUsers.size,
      usersByCity: {},
      averageAccuracy: 0,
      recentActivityHotspots: []
    };

    let totalAccuracy = 0;
    
    for (const [userId, userData] of this.activeUsers.entries()) {
      totalAccuracy += userData.location.accuracy || 0;
      
      // Group by approximate city (simplified)
      const cityKey = `${Math.round(userData.location.coordinates[1] * 100)}_${Math.round(userData.location.coordinates[0] * 100)}`;
      analytics.usersByCity[cityKey] = (analytics.usersByCity[cityKey] || 0) + 1;
    }

    analytics.averageAccuracy = this.activeUsers.size > 0 ? 
      Math.round(totalAccuracy / this.activeUsers.size) : 0;

    return analytics;
  }

  // Helper methods

  isValidLocation(location) {
    return location &&
           typeof location.latitude === 'number' &&
           typeof location.longitude === 'number' &&
           location.latitude >= -90 && location.latitude <= 90 &&
           location.longitude >= -180 && location.longitude <= 180;
  }

  calculateDistance(coords1, coords2) {
    const [lon1, lat1] = coords1;
    const [lon2, lat2] = coords2;

    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
  }

  matchesPreferences(currentUser, targetUser) {
    // Basic preference matching
    const currentProfile = currentUser.profile;
    const targetProfile = targetUser.profile;

    // Age preference check
    if (currentProfile.agePreference) {
      const targetAge = targetProfile.age;
      if (targetAge < currentProfile.agePreference.min || 
          targetAge > currentProfile.agePreference.max) {
        return false;
      }
    }

    // Gender preference check
    if (currentProfile.genderPreference && 
        currentProfile.genderPreference !== 'all' &&
        currentProfile.genderPreference !== targetProfile.gender) {
      return false;
    }

    return true;
  }

  isRecentlyActive(lastUpdate) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastUpdate) > fiveMinutesAgo;
  }

  estimateTimeNearby(userData) {
    // Simple heuristic based on location update frequency
    const updateAge = Date.now() - userData.lastUpdate.getTime();
    return updateAge < 60000 ? 'Just arrived' : 
           updateAge < 300000 ? 'Recently arrived' : 'Been here a while';
  }

  isInsideGeofence(coordinates, geofence) {
    const distance = this.calculateDistance(coordinates, geofence.center);
    return distance <= geofence.radius;
  }

  triggerGeofenceEvent(geofenceId, eventType, userId) {
    console.log(`🔔 Geofence ${eventType}: ${geofenceId} for user: ${userId}`);
    // Here you would trigger notifications, webhooks, etc.
  }

  cleanupStaleLocations() {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes
    
    for (const [userId, userData] of this.activeUsers.entries()) {
      if (userData.lastUpdate < staleThreshold) {
        this.activeUsers.delete(userId);
        console.log(`🧹 Cleaned up stale location for user: ${userId}`);
      }
    }

    // Cleanup expired geofences
    for (const [geofenceId, geofence] of this.geofences.entries()) {
      if (geofence.expires < new Date()) {
        this.geofences.delete(geofenceId);
        console.log(`🧹 Cleaned up expired geofence: ${geofenceId}`);
      }
    }
  }
}

module.exports = LocationBasedDiscovery;