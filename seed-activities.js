#!/usr/bin/env node

/**
 * Activity Database Seeder
 * Seeds the database with sample activities for testing
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Activity = require('./models/Activity');
const User = require('./models/User');

class ActivitySeeder {
  constructor() {
    this.adminUserId = null;
  }

  async seedDatabase() {
    try {
      console.log('🌱 Starting Activity Database Seeding...\n');

      // Connect to MongoDB
      await this.connectDB();

      // Create admin user if doesn't exist
      await this.createAdminUser();

      // Clear existing activities
      await this.clearExistingActivities();

      // Seed sample activities
      await this.seedSampleActivities();

      console.log('\n✅ Activity database seeding completed successfully!');

    } catch (error) {
      console.error('\n❌ Seeding failed:', error);
      process.exit(1);
    } finally {
      await mongoose.disconnect();
      console.log('🔌 Database connection closed');
    }
  }

  async connectDB() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully!');
  }

  async createAdminUser() {
    console.log('👤 Creating admin user for activities...');

    let adminUser = await User.findOne({ email: 'admin@onetime.app' });
    
    if (!adminUser) {
      adminUser = new User({
        email: 'admin@onetime.app',
        passwordHash: 'AdminPassword123!',
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
        status: 'active'
      });

      await adminUser.save();
      console.log('✅ Admin user created');
    } else {
      console.log('✅ Admin user already exists');
    }

    this.adminUserId = adminUser._id;
  }

  async clearExistingActivities() {
    console.log('🗑️ Clearing existing activities...');
    const deleteResult = await Activity.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.deletedCount} existing activities`);
  }

  async seedSampleActivities() {
    console.log('🌱 Seeding sample activities...\n');

    const sampleActivities = [
      {
        title: 'Golden Gate Park Hike',
        description: 'Beautiful hiking trails through Golden Gate Park with scenic views and photo opportunities. Perfect for nature lovers and photography enthusiasts.',
        category: 'outdoor',
        location: {
          coordinates: [-122.4783, 37.7694],
          address: 'Golden Gate Park, San Francisco, CA',
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        },
        priceRange: 'free',
        estimatedCost: { min: 0, max: 0, currency: 'USD' },
        duration: 120,
        bestTimeOfDay: ['morning', 'afternoon'],
        bestDays: ['weekends', 'anytime'],
        seasonality: ['spring', 'summer', 'fall'],
        tags: ['hiking', 'nature', 'photography', 'exercise', 'outdoor', 'park'],
        images: [{
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4',
          caption: 'Beautiful trails in Golden Gate Park',
          isPrimary: true
        }],
        createdBy: this.adminUserId,
        status: 'active',
        isApproved: true,
        approvedBy: this.adminUserId,
        approvedAt: new Date()
      },
      {
        title: 'SFMOMA Art Exhibition',
        description: 'Explore contemporary and modern art at the San Francisco Museum of Modern Art. Features rotating exhibitions and permanent collections.',
        category: 'cultural',
        location: {
          coordinates: [-122.4016, 37.7857],
          address: '151 3rd St, San Francisco, CA 94103',
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        },
        priceRange: 'moderate',
        estimatedCost: { min: 25, max: 35, currency: 'USD' },
        duration: 180,
        bestTimeOfDay: ['afternoon', 'evening'],
        bestDays: ['anytime'],
        seasonality: ['year-round'],
        tags: ['art', 'museum', 'culture', 'contemporary', 'galleries', 'exhibitions'],
        images: [{
          url: 'https://images.unsplash.com/photo-1554907984-15263bfd63bd',
          caption: 'Modern art at SFMOMA',
          isPrimary: true
        }],
        contact: {
          website: 'https://www.sfmoma.org',
          phone: '(415) 357-4000'
        },
        createdBy: this.adminUserId,
        status: 'active',
        isApproved: true,
        approvedBy: this.adminUserId,
        approvedAt: new Date()
      },
      {
        title: 'Farm-to-Table Dining Experience',
        description: 'Exquisite farm-to-table dining featuring locally sourced ingredients and seasonal menus. Perfect for food enthusiasts.',
        category: 'dining',
        location: {
          coordinates: [-122.4089, 37.7749],
          address: 'Union Square, San Francisco, CA',
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        },
        priceRange: 'expensive',
        estimatedCost: { min: 80, max: 150, currency: 'USD' },
        duration: 150,
        bestTimeOfDay: ['evening'],
        bestDays: ['friday', 'saturday', 'weekends'],
        seasonality: ['year-round'],
        tags: ['fine dining', 'farm to table', 'wine', 'gourmet', 'romantic', 'local'],
        images: [{
          url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0',
          caption: 'Elegant farm-to-table dining atmosphere',
          isPrimary: true
        }],
        requirements: {
          reservationRequired: true,
          advanceBooking: '24 hours'
        },
        createdBy: this.adminUserId,
        status: 'active',
        isApproved: true,
        approvedBy: this.adminUserId,
        approvedAt: new Date()
      },
      {
        title: 'Alcatraz Island Historic Tour',
        description: 'Historic audio tour of the famous Alcatraz federal penitentiary with ferry ride included. Learn about the island\'s fascinating history.',
        category: 'cultural',
        location: {
          coordinates: [-122.4230, 37.8267],
          address: 'Alcatraz Island, San Francisco, CA',
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        },
        priceRange: 'moderate',
        estimatedCost: { min: 45, max: 55, currency: 'USD' },
        duration: 240,
        bestTimeOfDay: ['morning', 'afternoon'],
        bestDays: ['anytime'],
        seasonality: ['year-round'],
        tags: ['history', 'tour', 'island', 'ferry', 'educational', 'audio guide'],
        images: [{
          url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96',
          caption: 'Historic Alcatraz Island',
          isPrimary: true
        }],
        contact: {
          website: 'https://www.alcatrazcruises.com',
          phone: '(415) 981-7625'
        },
        requirements: {
          reservationRequired: true,
          advanceBooking: '1 week'
        },
        createdBy: this.adminUserId,
        status: 'active',
        isApproved: true,
        approvedBy: this.adminUserId,
        approvedAt: new Date()
      },
      {
        title: 'Giants Baseball Game',
        description: 'Exciting MLB game featuring the San Francisco Giants at Oracle Park. Experience America\'s pastime with stunning bay views.',
        category: 'sports',
        location: {
          coordinates: [-122.3894, 37.7786],
          address: 'Oracle Park, San Francisco, CA',
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        },
        priceRange: 'moderate',
        estimatedCost: { min: 35, max: 120, currency: 'USD' },
        duration: 180,
        bestTimeOfDay: ['afternoon', 'evening'],
        bestDays: ['weekdays', 'weekends'],
        seasonality: ['spring', 'summer', 'fall'],
        tags: ['baseball', 'sports', 'mlb', 'giants', 'entertainment', 'stadium'],
        images: [{
          url: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390',
          caption: 'Exciting Giants baseball action',
          isPrimary: true
        }],
        contact: {
          website: 'https://www.mlb.com/giants',
          phone: '(415) 972-2000'
        },
        createdBy: this.adminUserId,
        status: 'active',
        isApproved: true,
        approvedBy: this.adminUserId,
        approvedAt: new Date()
      },
      {
        title: 'Sunset Coffee Tasting',
        description: 'Guided coffee tasting experience featuring local roasters and artisanal brewing methods. Perfect for coffee enthusiasts.',
        category: 'social',
        location: {
          coordinates: [-122.4161, 37.7594],
          address: 'Mission District, San Francisco, CA',
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        },
        priceRange: 'budget',
        estimatedCost: { min: 15, max: 25, currency: 'USD' },
        duration: 90,
        bestTimeOfDay: ['afternoon', 'evening'],
        bestDays: ['anytime'],
        seasonality: ['year-round'],
        tags: ['coffee', 'tasting', 'local', 'artisanal', 'social', 'conversation'],
        images: [{
          url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085',
          caption: 'Artisanal coffee tasting experience',
          isPrimary: true
        }],
        createdBy: this.adminUserId,
        status: 'active',
        isApproved: true,
        approvedBy: this.adminUserId,
        approvedAt: new Date()
      },
      {
        title: 'Fisherman\'s Wharf Street Performance',
        description: 'Free entertainment from talented street performers at the iconic Fisherman\'s Wharf. Great for casual strolling and people watching.',
        category: 'entertainment',
        location: {
          coordinates: [-122.4177, 37.8080],
          address: 'Fisherman\'s Wharf, San Francisco, CA',
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        },
        priceRange: 'free',
        estimatedCost: { min: 0, max: 10, currency: 'USD' },
        duration: 60,
        bestTimeOfDay: ['afternoon', 'evening'],
        bestDays: ['weekends', 'anytime'],
        seasonality: ['year-round'],
        tags: ['street performance', 'entertainment', 'free', 'wharf', 'casual', 'walking'],
        images: [{
          url: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3',
          caption: 'Street performers at Fisherman\'s Wharf',
          isPrimary: true
        }],
        createdBy: this.adminUserId,
        status: 'active',
        isApproved: true,
        approvedBy: this.adminUserId,
        approvedAt: new Date()
      },
      {
        title: 'Cooking Class: Italian Cuisine',
        description: 'Hands-on cooking class learning to prepare authentic Italian dishes. Includes wine pairing and recipe booklet.',
        category: 'social',
        location: {
          coordinates: [-122.4094, 37.7749],
          address: 'North Beach, San Francisco, CA',
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        },
        priceRange: 'moderate',
        estimatedCost: { min: 65, max: 85, currency: 'USD' },
        duration: 180,
        bestTimeOfDay: ['evening'],
        bestDays: ['friday', 'saturday', 'sunday'],
        seasonality: ['year-round'],
        tags: ['cooking', 'italian', 'hands-on', 'wine', 'social', 'learning'],
        images: [{
          url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136',
          caption: 'Hands-on Italian cooking experience',
          isPrimary: true
        }],
        requirements: {
          reservationRequired: true,
          advanceBooking: '48 hours',
          groupSizeLimit: { min: 2, max: 12 }
        },
        createdBy: this.adminUserId,
        status: 'active',
        isApproved: true,
        approvedBy: this.adminUserId,
        approvedAt: new Date()
      }
    ];

    for (const activityData of sampleActivities) {
      const activity = new Activity(activityData);
      await activity.save();
      console.log(`✅ Created: ${activity.title} (${activity.category})`);
    }

    console.log(`\n✅ Successfully seeded ${sampleActivities.length} sample activities`);
  }
}

// Run seeding if this script is executed directly
if (require.main === module) {
  const seeder = new ActivitySeeder();
  seeder.seedDatabase();
}

module.exports = ActivitySeeder;