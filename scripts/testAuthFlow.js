#!/usr/bin/env node

/**
 * Authentication Flow Test Script
 * 
 * This script tests the complete authentication flow for the OneTime dating app
 * including registration, login, email verification, and user profile management.
 */

const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

class AuthFlowTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL_DEV || 'http://localhost:3000';
    this.testUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Test User',
      age: 25,
      gender: 'male',
      dateOfBirth: '1998-01-01'
    };
    this.tokens = {};
    this.userId = null;
  }

  async runTests() {
    console.log('🧪 Starting Authentication Flow Tests...\n');
    console.log(`📍 Testing against: ${this.baseURL}\n`);

    try {
      // Test 1: Health Check
      await this.testHealthCheck();
      
      // Test 2: User Registration  
      await this.testUserRegistration();
      
      // Test 3: User Login
      await this.testUserLogin();
      
      // Test 4: Protected Route Access
      await this.testProtectedRoute();
      
      // Test 5: Token Refresh
      await this.testTokenRefresh();
      
      // Test 6: User Profile Update
      await this.testProfileUpdate();
      
      // Test 7: Password Change
      await this.testPasswordChange();
      
      // Test 8: User Logout
      await this.testUserLogout();
      
      // Test 9: Invalid Authentication
      await this.testInvalidAuthentication();

      console.log('\n✅ All authentication tests passed successfully!');
      console.log('\n📊 Test Summary:');
      console.log('- User registration: ✅');
      console.log('- User login: ✅');
      console.log('- Protected routes: ✅');
      console.log('- Token refresh: ✅');
      console.log('- Profile updates: ✅');
      console.log('- Password change: ✅');
      console.log('- User logout: ✅');
      console.log('- Security validation: ✅');

    } catch (error) {
      console.error('\n❌ Authentication test failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    }
  }

  async testHealthCheck() {
    console.log('🏥 Testing health check endpoint...');
    
    try {
      const response = await axios.get(`${this.baseURL}/health`);
      
      if (response.status === 200) {
        console.log('✅ Health check passed');
        console.log(`   Status: ${response.data.status}`);
        console.log(`   Database: ${response.data.database?.status}`);
        console.log(`   Environment: ${response.data.environment}`);
      } else {
        throw new Error(`Health check failed with status ${response.status}`);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to server. Make sure the backend is running.');
      }
      throw error;
    }
  }

  async testUserRegistration() {
    console.log('\n👤 Testing user registration...');
    
    const registrationData = {
      email: this.testUser.email,
      password: this.testUser.password,
      name: this.testUser.name,
      age: this.testUser.age,
      gender: this.testUser.gender,
      dateOfBirth: this.testUser.dateOfBirth,
      location: {
        coordinates: [-74.0059, 40.7128], // New York
        city: 'New York',
        state: 'NY',
        country: 'US'
      }
    };

    const response = await axios.post(`${this.baseURL}/api/auth/register`, registrationData);
    
    if (response.status === 201 && response.data.success) {
      this.tokens.accessToken = response.data.data.accessToken;
      this.tokens.refreshToken = response.data.data.refreshToken;
      this.userId = response.data.data.userId;
      
      console.log('✅ User registration successful');
      console.log(`   User ID: ${this.userId}`);
      console.log(`   Email verified: ${response.data.data.isEmailVerified}`);
    } else {
      throw new Error('Registration failed');
    }
  }

  async testUserLogin() {
    console.log('\n🔐 Testing user login...');
    
    const loginData = {
      email: this.testUser.email,
      password: this.testUser.password
    };

    const response = await axios.post(`${this.baseURL}/api/auth/login`, loginData);
    
    if (response.status === 200 && response.data.success) {
      this.tokens.accessToken = response.data.data.accessToken;
      this.tokens.refreshToken = response.data.data.refreshToken;
      
      console.log('✅ User login successful');
      console.log(`   Access token received: ${this.tokens.accessToken ? 'Yes' : 'No'}`);
      console.log(`   Refresh token received: ${this.tokens.refreshToken ? 'Yes' : 'No'}`);
    } else {
      throw new Error('Login failed');
    }
  }

  async testProtectedRoute() {
    console.log('\n🛡️ Testing protected route access...');
    
    const headers = {
      'Authorization': `Bearer ${this.tokens.accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${this.baseURL}/api/users/me`, { headers });
    
    if (response.status === 200 && response.data.success) {
      const user = response.data.data.user;
      console.log('✅ Protected route access successful');
      console.log(`   User email: ${user.email}`);
      console.log(`   User name: ${user.profile?.name}`);
      console.log(`   Account status: ${user.status}`);
    } else {
      throw new Error('Protected route access failed');
    }
  }

  async testTokenRefresh() {
    console.log('\n🔄 Testing token refresh...');
    
    const refreshData = {
      refreshToken: this.tokens.refreshToken
    };

    const response = await axios.post(`${this.baseURL}/api/auth/refresh`, refreshData);
    
    if (response.status === 200 && response.data.success) {
      const newAccessToken = response.data.data.accessToken;
      console.log('✅ Token refresh successful');
      console.log(`   New access token received: ${newAccessToken ? 'Yes' : 'No'}`);
      
      // Update token for subsequent tests
      this.tokens.accessToken = newAccessToken;
    } else {
      throw new Error('Token refresh failed');
    }
  }

  async testProfileUpdate() {
    console.log('\n✏️ Testing profile update...');
    
    const headers = {
      'Authorization': `Bearer ${this.tokens.accessToken}`,
      'Content-Type': 'application/json'
    };

    const updateData = {
      profile: {
        bio: 'Updated bio for testing',
        interests: ['technology', 'travel', 'music'],
        occupation: 'Software Developer'
      }
    };

    const response = await axios.put(`${this.baseURL}/api/users/me`, updateData, { headers });
    
    if (response.status === 200 && response.data.success) {
      const user = response.data.data.user;
      console.log('✅ Profile update successful');
      console.log(`   Bio updated: ${user.profile?.bio}`);
      console.log(`   Interests count: ${user.profile?.interests?.length || 0}`);
    } else {
      throw new Error('Profile update failed');
    }
  }

  async testPasswordChange() {
    console.log('\n🔑 Testing password change...');
    
    const headers = {
      'Authorization': `Bearer ${this.tokens.accessToken}`,
      'Content-Type': 'application/json'
    };

    const newPassword = 'NewTestPassword123!';
    const passwordData = {
      currentPassword: this.testUser.password,
      newPassword: newPassword,
      confirmPassword: newPassword
    };

    const response = await axios.put(`${this.baseURL}/api/users/me/password`, passwordData, { headers });
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Password change successful');
      
      // Update password for logout test
      this.testUser.password = newPassword;
    } else {
      throw new Error('Password change failed');
    }
  }

  async testUserLogout() {
    console.log('\n👋 Testing user logout...');
    
    const headers = {
      'Authorization': `Bearer ${this.tokens.accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(`${this.baseURL}/api/auth/logout`, {}, { headers });
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ User logout successful');
      
      // Clear tokens
      this.tokens = {};
    } else {
      throw new Error('Logout failed');
    }
  }

  async testInvalidAuthentication() {
    console.log('\n🚫 Testing invalid authentication...');
    
    // Test with invalid token
    try {
      const headers = {
        'Authorization': 'Bearer invalid-token',
        'Content-Type': 'application/json'
      };

      await axios.get(`${this.baseURL}/api/users/me`, { headers });
      throw new Error('Invalid token should have been rejected');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ Invalid token correctly rejected');
      } else {
        throw error;
      }
    }

    // Test login with wrong password
    try {
      const loginData = {
        email: this.testUser.email,
        password: 'WrongPassword123!'
      };

      await axios.post(`${this.baseURL}/api/auth/login`, loginData);
      throw new Error('Wrong password should have been rejected');
    } catch (error) {
      if (error.response && (error.response.status === 401 || error.response.status === 400)) {
        console.log('✅ Wrong password correctly rejected');
      } else {
        throw error;
      }
    }

    // Test registration with existing email
    try {
      const registrationData = {
        email: this.testUser.email,
        password: 'AnotherPassword123!',
        name: 'Another User',
        age: 30,
        gender: 'female',
        dateOfBirth: '1993-01-01'
      };

      await axios.post(`${this.baseURL}/api/auth/register`, registrationData);
      throw new Error('Duplicate email should have been rejected');
    } catch (error) {
      if (error.response && (error.response.status === 400 || error.response.status === 409)) {
        console.log('✅ Duplicate email correctly rejected');
      } else {
        throw error;
      }
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');
    
    try {
      // If we still have a valid token, delete the test user
      if (this.tokens.accessToken && this.userId) {
        const headers = {
          'Authorization': `Bearer ${this.tokens.accessToken}`,
          'Content-Type': 'application/json'
        };

        await axios.delete(`${this.baseURL}/api/users/me`, {
          headers,
          data: { password: this.testUser.password }
        });
        
        console.log('✅ Test user deleted');
      }
    } catch (error) {
      console.warn('⚠️ Could not clean up test user:', error.message);
    }
  }
}

// Helper function to generate random test data
function generateTestData() {
  const timestamp = Date.now();
  return {
    email: `test-${timestamp}@example.com`,
    name: `Test User ${timestamp}`,
    timestamp
  };
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new AuthFlowTester();
  
  tester.runTests()
    .then(() => {
      console.log('\n🎉 All tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test suite failed:', error.message);
      process.exit(1);
    })
    .finally(() => {
      // Always try to cleanup
      tester.cleanup().catch(() => {});
    });
}

module.exports = AuthFlowTester;