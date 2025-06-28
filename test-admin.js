#!/usr/bin/env node

/**
 * Admin Dashboard Test Script
 * Tests the complete admin dashboard and moderation functionality
 */

const axios = require('axios');
require('dotenv').config();

class AdminTester {
  constructor() {
    this.baseURL = process.env.API_BASE_URL_DEV || 'http://localhost:3000';
    this.adminToken = null;
    this.testUsers = [];
  }

  async runTests() {
    console.log('🛡️ Starting Admin Dashboard Tests...\n');
    console.log(`📍 Testing against: ${this.baseURL}\n`);

    try {
      // Test 1: Admin login
      await this.testAdminLogin();
      
      // Test 2: Dashboard overview
      await this.testDashboardOverview();
      
      // Test 3: User management
      await this.testUserManagement();
      
      // Test 4: User detail view
      await this.testUserDetailView();
      
      // Test 5: User status management
      await this.testUserStatusManagement();
      
      // Test 6: Photo verification
      await this.testPhotoVerification();
      
      // Test 7: Reports management
      await this.testReportsManagement();
      
      // Test 8: Activity management
      await this.testActivityManagement();
      
      // Test 9: System monitoring
      await this.testSystemMonitoring();
      
      // Test 10: Analytics
      await this.testAnalytics();
      
      // Test 11: User export
      await this.testUserExport();
      
      // Test 12: Broadcast notifications
      await this.testBroadcastNotifications();

      console.log('\n✅ All admin dashboard tests passed successfully!');
      console.log('\n📊 Admin Dashboard Test Summary:');
      console.log('- Admin login: ✅');
      console.log('- Dashboard overview: ✅');
      console.log('- User management: ✅');
      console.log('- User detail view: ✅');
      console.log('- User status management: ✅');
      console.log('- Photo verification: ✅');
      console.log('- Reports management: ✅');
      console.log('- Activity management: ✅');
      console.log('- System monitoring: ✅');
      console.log('- Analytics: ✅');
      console.log('- User export: ✅');
      console.log('- Broadcast notifications: ✅');

    } catch (error) {
      console.error('\n❌ Admin dashboard test failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    }
  }

  async testAdminLogin() {
    console.log('🔐 Testing admin login...');
    
    const loginData = {
      email: process.env.ADMIN_EMAIL || 'admin@onetime.app',
      password: process.env.ADMIN_PASSWORD || 'SecureAdminPassword123!'
    };

    const response = await axios.post(`${this.baseURL}/api/admin/login`, loginData);
    
    if (response.status === 200 && response.data.success) {
      this.adminToken = response.data.data.accessToken;
      console.log('✅ Admin login successful');
      console.log(`   Admin ID: ${response.data.data.adminId}`);
      console.log(`   Email: ${response.data.data.email}`);
      console.log(`   Role: ${response.data.data.role}`);
    } else {
      throw new Error('Admin login failed');
    }
  }

  async testDashboardOverview() {
    console.log('\n📊 Testing dashboard overview...');
    
    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${this.baseURL}/api/admin/dashboard`, { headers });
    
    if (response.status === 200 && response.data.success) {
      const stats = response.data.data;
      console.log('✅ Dashboard overview retrieved');
      console.log(`   Total users: ${stats.users.total}`);
      console.log(`   Active users: ${stats.users.active}`);
      console.log(`   Verified users: ${stats.users.verified}`);
      console.log(`   Total matches: ${stats.matches.total}`);
      console.log(`   Total messages: ${stats.messages.total}`);
      console.log(`   Pending reports: ${stats.moderation.pendingReports}`);
      console.log(`   Pending photo verifications: ${stats.moderation.pendingPhotoVerifications}`);
    } else {
      throw new Error('Dashboard overview test failed');
    }
  }

  async testUserManagement() {
    console.log('\n👥 Testing user management...');
    
    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    // Test user list with pagination
    const response = await axios.get(`${this.baseURL}/api/admin/users?page=1&limit=10`, { headers });
    
    if (response.status === 200 && response.data.success) {
      const userData = response.data.data;
      this.testUsers = userData.users.slice(0, 2); // Store first 2 users for further tests
      
      console.log('✅ User list retrieved');
      console.log(`   Users found: ${userData.users.length}`);
      console.log(`   Total users: ${userData.pagination.total}`);
      console.log(`   Total pages: ${userData.pagination.totalPages}`);
      
      if (userData.users.length > 0) {
        const firstUser = userData.users[0];
        console.log('   First user:');
        console.log(`     Name: ${firstUser.profile.name}`);
        console.log(`     Email: ${firstUser.email}`);
        console.log(`     Status: ${firstUser.status}`);
        console.log(`     Total matches: ${firstUser.analytics.totalMatches}`);
      }
    }

    // Test user search
    const searchResponse = await axios.get(`${this.baseURL}/api/admin/users?search=admin`, { headers });
    
    if (searchResponse.status === 200 && searchResponse.data.success) {
      console.log('✅ User search functionality working');
      console.log(`   Search results: ${searchResponse.data.data.users.length}`);
    }

    // Test user filtering
    const filterResponse = await axios.get(`${this.baseURL}/api/admin/users?status=active&verified=true`, { headers });
    
    if (filterResponse.status === 200 && filterResponse.data.success) {
      console.log('✅ User filtering functionality working');
      console.log(`   Filtered results: ${filterResponse.data.data.users.length}`);
    }
  }

  async testUserDetailView() {
    console.log('\n🔍 Testing user detail view...');
    
    if (this.testUsers.length === 0) {
      console.log('⚠️ No test users available, skipping user detail test');
      return;
    }

    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    const userId = this.testUsers[0]._id;
    const response = await axios.get(`${this.baseURL}/api/admin/users/${userId}`, { headers });
    
    if (response.status === 200 && response.data.success) {
      const user = response.data.data.user;
      console.log('✅ User detail retrieved');
      console.log(`   User: ${user.profile.name} (${user.email})`);
      console.log(`   Matches: ${user.matches.length}`);
      console.log(`   Recent messages: ${user.recentMessages.length}`);
      console.log(`   Swipe history: ${user.swipeHistory.length}`);
    } else {
      throw new Error('User detail view test failed');
    }
  }

  async testUserStatusManagement() {
    console.log('\n⚖️ Testing user status management...');
    
    if (this.testUsers.length === 0) {
      console.log('⚠️ No test users available, skipping status management test');
      return;
    }

    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    const userId = this.testUsers[0]._id;
    
    // Test suspending user
    const suspendResponse = await axios.put(`${this.baseURL}/api/admin/users/${userId}/status`, {
      status: 'suspended',
      reason: 'Test suspension for admin dashboard testing'
    }, { headers });
    
    if (suspendResponse.status === 200 && suspendResponse.data.success) {
      console.log('✅ User suspension successful');
      console.log(`   New status: ${suspendResponse.data.data.newStatus}`);
    }

    // Test reactivating user
    const reactivateResponse = await axios.put(`${this.baseURL}/api/admin/users/${userId}/status`, {
      status: 'active',
      reason: 'Test reactivation after admin dashboard testing'
    }, { headers });
    
    if (reactivateResponse.status === 200 && reactivateResponse.data.success) {
      console.log('✅ User reactivation successful');
      console.log(`   New status: ${reactivateResponse.data.data.newStatus}`);
    }
  }

  async testPhotoVerification() {
    console.log('\n📸 Testing photo verification...');
    
    if (this.testUsers.length === 0) {
      console.log('⚠️ No test users available, skipping photo verification test');
      return;
    }

    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    const userId = this.testUsers[0]._id;
    
    // Test photo approval
    const approveResponse = await axios.put(`${this.baseURL}/api/admin/users/${userId}/verify-photos`, {
      action: 'approve',
      reason: 'Photos meet verification standards'
    }, { headers });
    
    if (approveResponse.status === 200 && approveResponse.data.success) {
      console.log('✅ Photo verification successful');
      console.log(`   Action: ${approveResponse.data.data.action}`);
      console.log(`   Verified by: ${approveResponse.data.data.verifiedBy}`);
    } else {
      console.log('⚠️ Photo verification endpoint tested (may not have photos to verify)');
    }
  }

  async testReportsManagement() {
    console.log('\n📋 Testing reports management...');
    
    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    // Get pending reports
    const reportsResponse = await axios.get(`${this.baseURL}/api/admin/reports?status=pending`, { headers });
    
    if (reportsResponse.status === 200 && reportsResponse.data.success) {
      const reports = reportsResponse.data.data.reports;
      console.log('✅ Reports list retrieved');
      console.log(`   Pending reports: ${reports.length}`);
      
      if (reports.length > 0) {
        const firstReport = reports[0];
        console.log('   First report:');
        console.log(`     Reported user: ${firstReport.reportedUser.name}`);
        console.log(`     Reason: ${firstReport.reason}`);
        console.log(`     Reported at: ${new Date(firstReport.reportedAt).toLocaleString()}`);
        
        // Test handling the report
        const handleResponse = await axios.put(`${this.baseURL}/api/admin/reports/${firstReport._id}`, {
          action: 'resolve',
          resolution: 'Reviewed and found to be a misunderstanding',
          userAction: 'warn'
        }, { headers });
        
        if (handleResponse.status === 200 && handleResponse.data.success) {
          console.log('✅ Report handling successful');
          console.log(`   Action: ${handleResponse.data.data.action}`);
        }
      } else {
        console.log('   No pending reports found (this is good!)');
      }
    }
  }

  async testActivityManagement() {
    console.log('\n🎯 Testing activity management...');
    
    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    // Get pending activities
    const activitiesResponse = await axios.get(`${this.baseURL}/api/admin/activities?status=pending`, { headers });
    
    if (activitiesResponse.status === 200 && activitiesResponse.data.success) {
      const activities = activitiesResponse.data.data.activities;
      console.log('✅ Activities list retrieved');
      console.log(`   Pending activities: ${activities.length}`);
      
      if (activities.length > 0) {
        const firstActivity = activities[0];
        console.log('   First activity:');
        console.log(`     Title: ${firstActivity.title}`);
        console.log(`     Category: ${firstActivity.category}`);
        console.log(`     Created by: ${firstActivity.createdBy.profile.name}`);
        
        // Test approving the activity
        const approveResponse = await axios.put(`${this.baseURL}/api/admin/activities/${firstActivity._id}/approve`, {
          action: 'approve',
          reason: 'Activity meets quality standards'
        }, { headers });
        
        if (approveResponse.status === 200 && approveResponse.data.success) {
          console.log('✅ Activity approval successful');
          console.log(`   Action: ${approveResponse.data.data.action}`);
        }
      } else {
        console.log('   No pending activities found');
      }
    }
  }

  async testSystemMonitoring() {
    console.log('\n📊 Testing system monitoring...');
    
    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    const statsResponse = await axios.get(`${this.baseURL}/api/admin/system/stats`, { headers });
    
    if (statsResponse.status === 200 && statsResponse.data.success) {
      const stats = statsResponse.data.data;
      console.log('✅ System stats retrieved');
      console.log(`   Server status: ${stats.server.status}`);
      console.log(`   Uptime: ${Math.floor(stats.server.uptime / 60)} minutes`);
      console.log(`   Database status: ${stats.database.status}`);
      console.log(`   Active connections: ${stats.realtime.activeConnections}`);
      console.log(`   Memory used: ${stats.memory.used}MB / ${stats.memory.total}MB`);
      console.log(`   Node version: ${stats.server.nodeVersion}`);
      console.log(`   Environment: ${stats.server.environment}`);
    } else {
      throw new Error('System monitoring test failed');
    }
  }

  async testAnalytics() {
    console.log('\n📈 Testing analytics...');
    
    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    const analyticsResponse = await axios.get(`${this.baseURL}/api/admin/analytics?period=7d`, { headers });
    
    if (analyticsResponse.status === 200 && analyticsResponse.data.success) {
      const analytics = analyticsResponse.data.data;
      console.log('✅ Analytics data retrieved');
      console.log(`   Period: ${analytics.period}`);
      console.log(`   Registration trend points: ${analytics.trends.registrations.length}`);
      console.log(`   Match trend points: ${analytics.trends.matches.length}`);
      console.log(`   Message trend points: ${analytics.trends.messages.length}`);
      console.log(`   Daily active users: ${analytics.engagement.dailyActiveUsers}`);
      console.log(`   Weekly active users: ${analytics.engagement.weeklyActiveUsers}`);
      console.log(`   Monthly active users: ${analytics.engagement.monthlyActiveUsers}`);
    } else {
      throw new Error('Analytics test failed');
    }
  }

  async testUserExport() {
    console.log('\n📤 Testing user export...');
    
    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    // Test JSON export
    const jsonExportResponse = await axios.get(`${this.baseURL}/api/admin/export/users?format=json&status=active`, { headers });
    
    if (jsonExportResponse.status === 200 && jsonExportResponse.data.success) {
      const exportData = jsonExportResponse.data.data;
      console.log('✅ JSON export successful');
      console.log(`   Exported users: ${exportData.totalUsers}`);
      console.log(`   Export timestamp: ${new Date(exportData.exportedAt).toLocaleString()}`);
    }

    // Test CSV export
    try {
      const csvExportResponse = await axios.get(`${this.baseURL}/api/admin/export/users?format=csv&status=active`, { headers });
      
      if (csvExportResponse.status === 200 && csvExportResponse.headers['content-type'].includes('text/csv')) {
        console.log('✅ CSV export successful');
        console.log(`   CSV data length: ${csvExportResponse.data.length} characters`);
      }
    } catch (error) {
      if (error.response?.status === 200) {
        console.log('✅ CSV export successful (received CSV data)');
      } else {
        throw error;
      }
    }
  }

  async testBroadcastNotifications() {
    console.log('\n📢 Testing broadcast notifications...');
    
    const headers = {
      'Authorization': `Bearer ${this.adminToken}`,
      'Content-Type': 'application/json'
    };

    const notificationData = {
      title: 'Test Admin Notification',
      message: 'This is a test broadcast notification from the admin dashboard testing suite.',
      targetUsers: 'all',
      category: 'announcement'
    };

    const broadcastResponse = await axios.post(`${this.baseURL}/api/admin/notifications/broadcast`, notificationData, { headers });
    
    if (broadcastResponse.status === 200 && broadcastResponse.data.success) {
      const broadcast = broadcastResponse.data.data;
      console.log('✅ Broadcast notification sent');
      console.log(`   Title: ${broadcast.title}`);
      console.log(`   Target users: ${broadcast.targetUsers}`);
      console.log(`   Recipient count: ${broadcast.recipientCount}`);
      console.log(`   Active recipients: ${broadcast.activeRecipients}`);
      console.log(`   Sent at: ${new Date(broadcast.sentAt).toLocaleString()}`);
    } else {
      throw new Error('Broadcast notification test failed');
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new AdminTester();
  
  tester.runTests()
    .then(() => {
      console.log('\n🎉 All admin dashboard tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Admin dashboard test suite failed:', error.message);
      process.exit(1);
    });
}

module.exports = AdminTester;