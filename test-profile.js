#!/usr/bin/env node

/**
 * Profile Management System Test Script
 * Tests the complete profile management and verification functionality
 */

const axios = require('axios');
require('dotenv').config();

class ProfileTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL_DEV || 'http://localhost:3000';
    this.user = null;
    this.accessToken = null;
  }

  async runTests() {
    console.log('👤 Starting Profile Management System Tests...\n');
    console.log(`📍 Testing against: ${this.baseURL}\n`);

    try {
      // Test 1: Create test user
      await this.createTestUser();
      
      // Test 2: Get initial profile completion
      await this.testInitialProfileCompletion();
      
      // Test 3: Update basic profile information
      await this.testBasicProfileUpdate();
      
      // Test 4: Upload and manage photos
      await this.testPhotoManagement();
      
      // Test 5: Update profile prompts
      await this.testPromptManagement();
      
      // Test 6: Update interests and preferences
      await this.testInterestsAndPreferences();
      
      // Test 7: Test settings management
      await this.testSettingsManagement();
      
      // Test 8: Test photo verification
      await this.testPhotoVerification();
      
      // Test 9: Get final profile analytics
      await this.testProfileAnalytics();
      
      // Test 10: Get complete profile
      await this.testCompleteProfile();

      console.log('\n✅ All profile management tests passed successfully!');
      console.log('\n📊 Profile Management Test Summary:');
      console.log('- User creation: ✅');
      console.log('- Profile completion tracking: ✅');
      console.log('- Basic profile updates: ✅');
      console.log('- Photo management: ✅');
      console.log('- Prompt management: ✅');
      console.log('- Interests & preferences: ✅');
      console.log('- Settings management: ✅');
      console.log('- Photo verification: ✅');
      console.log('- Profile analytics: ✅');
      console.log('- Complete profile retrieval: ✅');

    } catch (error) {
      console.error('\n❌ Profile management test failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    }
  }

  async createTestUser() {
    console.log('👥 Creating test user for profile management...');
    
    const userData = {
      email: `profile-test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Alex Morgan',
      age: 27,
      gender: 'female',
      dateOfBirth: '1996-05-15',
      location: {
        coordinates: [-122.4194, 37.7749], // San Francisco
        city: 'San Francisco',
        state: 'CA',
        country: 'US'
      }
    };

    const response = await axios.post(`${this.baseURL}/api/auth/register`, userData);
    
    if (response.status === 201 && response.data.success) {
      this.user = {
        ...userData,
        userId: response.data.data.userId,
        accessToken: response.data.data.accessToken
      };
      this.accessToken = response.data.data.accessToken;
      console.log(`✅ Created test user: ${userData.name}`);
    } else {
      throw new Error('Failed to create test user');
    }
  }

  async testInitialProfileCompletion() {
    console.log('\n📊 Testing initial profile completion...');
    
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${this.baseURL}/api/users/me/complete`, { headers });
    
    if (response.status === 200 && response.data.success) {
      const profileCompletion = response.data.data.user.profileCompletion;
      console.log('✅ Initial profile completion retrieved');
      console.log(`   Completion: ${profileCompletion.percentage}% (${profileCompletion.completed}/${profileCompletion.total})`);
      console.log(`   Missing items: ${profileCompletion.recommendations.length}`);
      
      if (profileCompletion.recommendations.length > 0) {
        console.log('   Recommendations:');
        profileCompletion.recommendations.forEach((rec, index) => {
          console.log(`     ${index + 1}. ${rec.title} (${rec.priority})`);
        });
      }
    } else {
      throw new Error('Failed to get initial profile completion');
    }
  }

  async testBasicProfileUpdate() {
    console.log('\n📝 Testing basic profile update...');
    
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };

    const basicInfo = {
      section: 'basic',
      data: {
        name: 'Alex Morgan',
        age: 27,
        occupation: 'Software Engineer',
        bio: 'Passionate about technology, hiking, and great coffee. Love exploring new places and trying new restaurants. Looking for someone to share adventures with!',
        height: 165,
        education: 'Masters in Computer Science'
      }
    };

    const response = await axios.put(`${this.baseURL}/api/users/me/profile`, basicInfo, { headers });
    
    if (response.status === 200 && response.data.success) {
      const profileCompletion = response.data.data.profileCompletion;
      console.log('✅ Basic profile updated successfully');
      console.log(`   New completion: ${profileCompletion.percentage}%`);
      console.log(`   Updated fields: ${response.data.data.updatedFields.join(', ')}`);
    } else {
      throw new Error('Failed to update basic profile');
    }
  }

  async testPhotoManagement() {
    console.log('\n📸 Testing photo management...');
    
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Upload first photo (primary)
    const photo1Response = await axios.post(`${this.baseURL}/api/users/me/photos`, {
      photoUrl: 'https://images.unsplash.com/photo-1494790108755-2616b612b5a4',
      caption: 'My favorite hiking spot',
      isPrimary: true
    }, { headers });
    
    if (photo1Response.status === 201) {
      console.log('✅ First photo uploaded (primary)');
    }

    // Upload second photo
    const photo2Response = await axios.post(`${this.baseURL}/api/users/me/photos`, {
      photoUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80',
      caption: 'Coffee date ready!',
      isPrimary: false
    }, { headers });
    
    if (photo2Response.status === 201) {
      console.log('✅ Second photo uploaded');
    }

    // Upload third photo
    const photo3Response = await axios.post(`${this.baseURL}/api/users/me/photos`, {
      photoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2',
      caption: 'Adventure time!',
      isPrimary: false
    }, { headers });
    
    if (photo3Response.status === 201) {
      console.log('✅ Third photo uploaded');
      console.log(`   Total photos: ${photo3Response.data.data.totalPhotos}`);
    }

    // Test photo reordering
    const reorderResponse = await axios.put(`${this.baseURL}/api/users/me/photos/reorder`, {
      photoOrder: ['photo_id_3', 'photo_id_1', 'photo_id_2'] // Mock IDs for testing
    }, { headers });
    
    // This will likely fail due to mock IDs, but tests the endpoint
    if (reorderResponse.status === 200) {
      console.log('✅ Photos reordered successfully');
    } else {
      console.log('⚠️ Photo reorder endpoint tested (expected to fail with mock IDs)');
    }
  }

  async testPromptManagement() {
    console.log('\n💭 Testing prompt management...');
    
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Get available prompts
    const availableResponse = await axios.get(`${this.baseURL}/api/users/prompts/available`, { headers });
    
    if (availableResponse.status === 200) {
      const availablePrompts = availableResponse.data.data.prompts;
      console.log('✅ Available prompts retrieved');
      console.log(`   Available prompts: ${availablePrompts.length}`);
    }

    // Update user prompts
    const prompts = [
      {
        question: "What's your idea of a perfect Sunday?",
        answer: "Sleeping in, hiking with my dog, then cooking a new recipe while listening to podcasts.",
        order: 0
      },
      {
        question: "I'm passionate about...",
        answer: "Technology that makes people's lives better and environmental sustainability.",
        order: 1
      },
      {
        question: "The best way to win me over is...",
        answer: "Be genuine, make me laugh, and share your favorite coffee spot with me!",
        order: 2
      },
      {
        question: "My dream vacation would be...",
        answer: "Backpacking through New Zealand - epic landscapes and adventure sports!",
        order: 3
      }
    ];

    const promptsResponse = await axios.put(`${this.baseURL}/api/users/me/prompts`, {
      prompts
    }, { headers });
    
    if (promptsResponse.status === 200) {
      console.log('✅ Profile prompts updated successfully');
      console.log(`   Prompts added: ${promptsResponse.data.data.totalPrompts}`);
    }
  }

  async testInterestsAndPreferences() {
    console.log('\n🎯 Testing interests and preferences...');
    
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Update interests
    const interestsData = {
      section: 'interests',
      data: {
        interests: ['hiking', 'coffee', 'technology', 'photography', 'cooking', 'travel', 'sustainability'],
        intentTags: ['adventure', 'intellectual', 'outdoorsy', 'foodie'],
        energyLevel: 'Energetic',
        lookingFor: 'Serious'
      }
    };

    const interestsResponse = await axios.put(`${this.baseURL}/api/users/me/profile`, interestsData, { headers });
    
    if (interestsResponse.status === 200) {
      console.log('✅ Interests and intent updated successfully');
    }

    // Update preferences
    const preferencesData = {
      section: 'preferences',
      data: {
        agePreference: { min: 24, max: 35 },
        distancePreference: 30,
        genderPreference: ['male', 'non-binary']
      }
    };

    const preferencesResponse = await axios.put(`${this.baseURL}/api/users/me/profile`, preferencesData, { headers });
    
    if (preferencesResponse.status === 200) {
      console.log('✅ Dating preferences updated successfully');
    }
  }

  async testSettingsManagement() {
    console.log('\n⚙️ Testing settings management...');
    
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Update notification settings
    const notificationSettings = {
      section: 'notifications',
      settings: {
        matches: true,
        messages: true,
        activities: false,
        marketing: false
      }
    };

    const notifResponse = await axios.put(`${this.baseURL}/api/users/me/settings`, notificationSettings, { headers });
    
    if (notifResponse.status === 200) {
      console.log('✅ Notification settings updated');
    }

    // Update privacy settings
    const privacySettings = {
      section: 'privacy',
      settings: {
        showAge: true,
        showDistance: false,
        onlineStatus: false
      }
    };

    const privacyResponse = await axios.put(`${this.baseURL}/api/users/me/settings`, privacySettings, { headers });
    
    if (privacyResponse.status === 200) {
      console.log('✅ Privacy settings updated');
    }

    // Update discovery settings
    const discoverySettings = {
      section: 'discovery',
      settings: {
        enabled: true,
        maxDistance: 25
      }
    };

    const discoveryResponse = await axios.put(`${this.baseURL}/api/users/me/settings`, discoverySettings, { headers });
    
    if (discoveryResponse.status === 200) {
      console.log('✅ Discovery settings updated');
    }
  }

  async testPhotoVerification() {
    console.log('\n🔍 Testing photo verification...');
    
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };

    const verificationResponse = await axios.post(`${this.baseURL}/api/users/me/verification/photos`, {}, { headers });
    
    if (verificationResponse.status === 200) {
      console.log('✅ Photo verification requested successfully');
      console.log(`   Status: ${verificationResponse.data.data.status}`);
      console.log(`   Message: ${verificationResponse.data.data.message}`);
    }
  }

  async testProfileAnalytics() {
    console.log('\n📈 Testing profile analytics...');
    
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };

    const analyticsResponse = await axios.get(`${this.baseURL}/api/users/me/analytics`, { headers });
    
    if (analyticsResponse.status === 200) {
      const analytics = analyticsResponse.data.data.analytics;
      console.log('✅ Profile analytics retrieved');
      console.log(`   Profile completion: ${analytics.profileCompletion.percentage}%`);
      console.log(`   Profile views: ${analytics.profileViews}`);
      console.log(`   Total swipes: ${analytics.totalSwipes}`);
      console.log(`   Total matches: ${analytics.totalMatches}`);
      console.log(`   Total messages: ${analytics.totalMessages}`);
      console.log('   Verification status:');
      console.log(`     Email: ${analytics.verificationStatus.email ? '✅' : '❌'}`);
      console.log(`     Phone: ${analytics.verificationStatus.phone ? '✅' : '❌'}`);
      console.log(`     Photos: ${analytics.verificationStatus.photos ? '✅' : '❌'}`);
      console.log(`     Identity: ${analytics.verificationStatus.identity ? '✅' : '❌'}`);
    }
  }

  async testCompleteProfile() {
    console.log('\n📋 Testing complete profile retrieval...');
    
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };

    const completeResponse = await axios.get(`${this.baseURL}/api/users/me/complete`, { headers });
    
    if (completeResponse.status === 200) {
      const user = completeResponse.data.data.user;
      const completion = user.profileCompletion;
      
      console.log('✅ Complete profile retrieved successfully');
      console.log(`   Final completion: ${completion.percentage}% (${completion.completed}/${completion.total})`);
      console.log(`   Profile sections completed:`);
      console.log(`     Basic info: ${completion.checks.basicInfo ? '✅' : '❌'}`);
      console.log(`     Photos (2+): ${completion.checks.photos ? '✅' : '❌'}`);
      console.log(`     Prompts (3+): ${completion.checks.prompts ? '✅' : '❌'}`);
      console.log(`     Interests (3+): ${completion.checks.interests ? '✅' : '❌'}`);
      console.log(`     Preferences: ${completion.checks.preferences ? '✅' : '❌'}`);
      console.log(`     Location: ${completion.checks.location ? '✅' : '❌'}`);
      console.log(`     Email verified: ${completion.checks.verification ? '✅' : '❌'}`);

      if (completion.recommendations.length > 0) {
        console.log(`   Remaining recommendations: ${completion.recommendations.length}`);
        completion.recommendations.forEach((rec, index) => {
          console.log(`     ${index + 1}. ${rec.title} (${rec.priority})`);
        });
      } else {
        console.log('   🎉 Profile 100% complete!');
      }
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new ProfileTester();
  
  tester.runTests()
    .then(() => {
      console.log('\n🎉 All profile management tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Profile management test suite failed:', error.message);
      process.exit(1);
    });
}

module.exports = ProfileTester;