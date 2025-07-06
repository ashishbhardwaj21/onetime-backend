/**
 * Admin API Integration Tests
 * Tests comprehensive admin dashboard and management endpoints
 */

const request = require('supertest');
const AdminUser = require('../../../models/AdminUser');
const User = require('../../../models/User');
const Activity = require('../../../models/Activity');

describe('Admin API', () => {
  let app;
  let adminUser;
  let adminToken;
  let regularUser;
  let regularToken;
  let testUsers;
  let testActivities;

  beforeAll(async () => {
    app = global.testUtils.createTestServer();
    
    // Mount admin routes
    const adminRoutes = require('../../../routes/admin');
    const authenticateToken = require('../../../middleware/auth').authenticateToken;
    
    app.use('/api/admin', adminRoutes);
  });

  beforeEach(async () => {
    // Create admin user
    adminUser = new AdminUser({
      email: 'admin@test.com',
      password: 'adminpass123',
      profile: {
        firstName: 'Admin',
        lastName: 'User',
        department: 'engineering'
      },
      role: 'super_admin',
      permissions: [
        { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'activities', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'analytics', actions: ['read', 'export'] },
        { resource: 'admin_management', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'system_settings', actions: ['read', 'update'] },
        { resource: 'financial_reports', actions: ['read', 'export'] }
      ],
      status: 'active'
    });
    await adminUser.save();

    // Create regular user with admin role (for legacy compatibility)
    regularUser = await global.testUtils.createTestUser({
      email: 'legacy-admin@test.com',
      role: 'admin',
      profile: {
        name: 'Legacy Admin',
        age: 30
      }
    });

    // Generate tokens
    const jwt = require('jsonwebtoken');
    adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    regularToken = global.testUtils.generateTestToken(regularUser._id);

    // Create test data
    testUsers = await Promise.all([
      global.testUtils.createTestUser({
        email: 'test1@example.com',
        profile: { name: 'Test User 1', age: 25 },
        status: 'active'
      }),
      global.testUtils.createTestUser({
        email: 'test2@example.com',
        profile: { name: 'Test User 2', age: 30 },
        status: 'active'
      }),
      global.testUtils.createTestUser({
        email: 'test3@example.com',
        profile: { name: 'Test User 3', age: 28 },
        status: 'banned'
      })
    ]);

    testActivities = await Promise.all([
      global.testUtils.createTestActivity({
        organizer: testUsers[0]._id,
        title: 'Coffee Meeting',
        category: 'dining',
        status: 'active'
      }),
      global.testUtils.createTestActivity({
        organizer: testUsers[1]._id,
        title: 'Hiking Trip',
        category: 'outdoor',
        status: 'active'
      })
    ]);
  });

  describe('Authentication and Authorization', () => {
    test('should require authentication for admin endpoints', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard/overview')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('token required');
    });

    test('should accept valid admin token', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('timeframe');
    });

    test('should accept legacy admin user token', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('analytics');
    });

    test('should reject non-admin user', async () => {
      const nonAdminUser = await global.testUtils.createTestUser({
        email: 'user@test.com',
        role: 'user'
      });
      const nonAdminToken = global.testUtils.generateTestToken(nonAdminUser._id);

      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Admin access required');
    });

    test('should enforce permission-based access', async () => {
      // Create admin with limited permissions
      const limitedAdmin = new AdminUser({
        email: 'limited@test.com',
        password: 'password123',
        profile: { firstName: 'Limited', lastName: 'Admin' },
        role: 'analyst',
        permissions: [
          { resource: 'analytics', actions: ['read'] }
        ],
        status: 'active'
      });
      await limitedAdmin.save();

      const jwt = require('jsonwebtoken');
      const limitedToken = jwt.sign({ id: limitedAdmin._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

      // Should have access to analytics
      const analyticsResponse = await request(app)
        .get('/api/admin/analytics/users')
        .set('Authorization', `Bearer ${limitedToken}`)
        .expect(200);

      expect(analyticsResponse.body.success).toBe(true);

      // Should not have access to admin management
      const adminResponse = await request(app)
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${limitedToken}`)
        .expect(403);

      expect(adminResponse.body.success).toBe(false);
      expect(adminResponse.body.error).toContain('Permission denied');
    });
  });

  describe('Dashboard Overview', () => {
    test('should get comprehensive dashboard overview', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('timeframe', '7d');
      expect(response.body.data).toHaveProperty('period');
      expect(response.body.data).toHaveProperty('users');
      expect(response.body.data).toHaveProperty('activities');
      expect(response.body.data).toHaveProperty('subscriptions');
      expect(response.body.data).toHaveProperty('engagement');
      expect(response.body.data).toHaveProperty('revenue');
      expect(response.body.data).toHaveProperty('moderation');
      expect(response.body.data).toHaveProperty('alerts');
      expect(response.body.data).toHaveProperty('lastUpdated');

      // Validate user stats
      expect(response.body.data.users).toHaveProperty('total');
      expect(response.body.data.users).toHaveProperty('new');
      expect(response.body.data.users).toHaveProperty('active');
      expect(response.body.data.users).toHaveProperty('growth');

      // Validate activity stats
      expect(response.body.data.activities).toHaveProperty('total');
      expect(response.body.data.activities).toHaveProperty('new');
      expect(response.body.data.activities).toHaveProperty('upcoming');

      // Validate engagement stats
      expect(response.body.data.engagement).toHaveProperty('totalInteractions');
      expect(response.body.data.engagement).toHaveProperty('dailyActiveUsers');
    });

    test('should handle different timeframes', async () => {
      const timeframes = ['24h', '7d', '30d', '90d'];

      for (const timeframe of timeframes) {
        const response = await request(app)
          .get('/api/admin/dashboard/overview')
          .query({ timeframe })
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.timeframe).toBe(timeframe);
        expect(response.body.data.period.start).toBeDefined();
        expect(response.body.data.period.end).toBeDefined();
      }
    });

    test('should validate timeframe parameter', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard/overview')
        .query({ timeframe: 'invalid' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('should get legacy dashboard for backwards compatibility', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('analytics');
      expect(response.body.data.analytics).toHaveProperty('users');
      expect(response.body.data.analytics).toHaveProperty('engagement');
      expect(response.body.data.analytics).toHaveProperty('content');
      expect(response.body.data.analytics).toHaveProperty('moderation');
    });
  });

  describe('User Management', () => {
    test('should get enhanced user management data', async () => {
      const response = await request(app)
        .get('/api/admin/users/enhanced')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('users');
      expect(response.body.data).toHaveProperty('pagination');

      expect(response.body.data.users).toBeArray();
      expect(response.body.data.pagination).toHaveProperty('currentPage');
      expect(response.body.data.pagination).toHaveProperty('totalCount');
      expect(response.body.data.pagination).toHaveProperty('totalPages');
    });

    test('should filter users by search term', async () => {
      const response = await request(app)
        .get('/api/admin/users/enhanced')
        .query({ search: 'Test User 1' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toBeArray();
    });

    test('should filter users by status', async () => {
      const response = await request(app)
        .get('/api/admin/users/enhanced')
        .query({ status: 'active' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toBeArray();

      response.body.data.users.forEach(user => {
        expect(user.status).toBe('active');
      });
    });

    test('should filter users by age range', async () => {
      const response = await request(app)
        .get('/api/admin/users/enhanced')
        .query({ ageMin: 25, ageMax: 30 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toBeArray();

      response.body.data.users.forEach(user => {
        if (user.profile?.age) {
          expect(user.profile.age).toBeGreaterThanOrEqual(25);
          expect(user.profile.age).toBeLessThanOrEqual(30);
        }
      });
    });

    test('should paginate user results', async () => {
      const response = await request(app)
        .get('/api/admin/users/enhanced')
        .query({ page: 1, limit: 2 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.currentPage).toBe(1);
    });

    test('should get specific user details (legacy endpoint)', async () => {
      const userId = testUsers[0]._id;
      const response = await request(app)
        .get(`/api/admin/users/${userId}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user._id.toString()).toBe(userId.toString());
      expect(response.body.data.user).toHaveProperty('statistics');
    });

    test('should update user status (legacy endpoint)', async () => {
      const userId = testUsers[0]._id;
      const response = await request(app)
        .put(`/api/admin/users/${userId}/status`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({
          status: 'suspended',
          reason: 'Testing admin functionality'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('suspended');

      // Verify user was updated
      const updatedUser = await User.findById(userId);
      expect(updatedUser.status).toBe('suspended');
    });

    test('should validate status update parameters', async () => {
      const userId = testUsers[0]._id;
      const response = await request(app)
        .put(`/api/admin/users/${userId}/status`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({
          status: 'invalid_status'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation errors');
    });

    test('should handle non-existent user', async () => {
      const fakeUserId = global.testUtils.generateTestData.objectId();
      const response = await request(app)
        .get(`/api/admin/users/${fakeUserId}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User not found');
    });

    test('should get legacy user list with filtering', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .query({ status: 'active', limit: 10 })
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('users');
      expect(response.body.data).toHaveProperty('pagination');
    });
  });

  describe('Activity Management', () => {
    test('should get enhanced activity management data', async () => {
      const response = await request(app)
        .get('/api/admin/activities/enhanced')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('activities');
      expect(response.body.data).toHaveProperty('pagination');

      expect(response.body.data.activities).toBeArray();
      expect(response.body.data.pagination).toHaveProperty('currentPage');
      expect(response.body.data.pagination).toHaveProperty('totalCount');
    });

    test('should filter activities by category', async () => {
      const response = await request(app)
        .get('/api/admin/activities/enhanced')
        .query({ category: 'dining' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.activities).toBeArray();

      response.body.data.activities.forEach(activity => {
        expect(activity.category).toBe('dining');
      });
    });

    test('should filter activities by search term', async () => {
      const response = await request(app)
        .get('/api/admin/activities/enhanced')
        .query({ search: 'Coffee' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.activities).toBeArray();
    });

    test('should get pending activities (legacy endpoint)', async () => {
      const response = await request(app)
        .get('/api/admin/activities/pending')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('activities');
      expect(response.body.data).toHaveProperty('pagination');
    });

    test('should approve/reject activity (legacy endpoint)', async () => {
      const activityId = testActivities[0]._id;
      const response = await request(app)
        .put(`/api/admin/activities/${activityId}/review`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({
          action: 'approve',
          reason: 'Looks good'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('approved');
    });

    test('should validate activity review parameters', async () => {
      const activityId = testActivities[0]._id;
      const response = await request(app)
        .put(`/api/admin/activities/${activityId}/review`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({
          action: 'invalid_action'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation errors');
    });
  });

  describe('Analytics', () => {
    test('should get user analytics', async () => {
      const response = await request(app)
        .get('/api/admin/analytics/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('timeframe');
      expect(response.body.data).toHaveProperty('period');
      expect(response.body.data).toHaveProperty('stats');

      expect(response.body.data.stats).toHaveProperty('total');
      expect(response.body.data.stats).toHaveProperty('new');
      expect(response.body.data.stats).toHaveProperty('active');
      expect(response.body.data.stats).toHaveProperty('demographics');
    });

    test('should get activity analytics', async () => {
      const response = await request(app)
        .get('/api/admin/analytics/activities')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('stats');
      expect(response.body.data.stats).toHaveProperty('total');
      expect(response.body.data.stats).toHaveProperty('categoryDistribution');
    });

    test('should get revenue analytics', async () => {
      const response = await request(app)
        .get('/api/admin/analytics/revenue')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('stats');
      expect(response.body.data.stats).toHaveProperty('total');
      expect(response.body.data.stats).toHaveProperty('mrr');
      expect(response.body.data.stats).toHaveProperty('byTier');
    });

    test('should handle different timeframes for analytics', async () => {
      const response = await request(app)
        .get('/api/admin/analytics/users')
        .query({ timeframe: '30d' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.timeframe).toBe('30d');
    });

    test('should get platform statistics (legacy endpoint)', async () => {
      const response = await request(app)
        .get('/api/admin/statistics')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('users');
      expect(response.body.data).toHaveProperty('activities');
      expect(response.body.data).toHaveProperty('engagement');
      expect(response.body.data).toHaveProperty('geography');
    });
  });

  describe('Admin Management', () => {
    test('should get list of admins', async () => {
      const response = await request(app)
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('admins');
      expect(response.body.data.admins).toBeArray();
    });

    test('should create new admin', async () => {
      const newAdminData = {
        email: 'newadmin@test.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'Admin',
        role: 'moderator',
        department: 'support'
      };

      const response = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newAdminData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('admin');
      expect(response.body.data.admin.email).toBe(newAdminData.email);
      expect(response.body.data.admin.role).toBe(newAdminData.role);

      // Verify admin was created in database
      const createdAdmin = await AdminUser.findOne({ email: newAdminData.email });
      expect(createdAdmin).toBeTruthy();
      expect(createdAdmin.role).toBe(newAdminData.role);
    });

    test('should validate admin creation parameters', async () => {
      const invalidAdminData = {
        email: 'invalid-email',
        password: '123', // Too short
        firstName: '',
        lastName: 'Admin',
        role: 'invalid_role'
      };

      const response = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidAdminData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeArray();
    });

    test('should prevent duplicate admin emails', async () => {
      const duplicateAdminData = {
        email: adminUser.email, // Same as existing admin
        password: 'password123',
        firstName: 'Duplicate',
        lastName: 'Admin',
        role: 'moderator'
      };

      const response = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(duplicateAdminData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('System Settings', () => {
    test('should get system settings', async () => {
      const response = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('settings');
      expect(response.body.data.settings).toHaveProperty('app');
      expect(response.body.data.settings).toHaveProperty('security');
      expect(response.body.data.settings).toHaveProperty('notifications');
      expect(response.body.data.settings).toHaveProperty('features');

      expect(response.body.data.settings.app).toHaveProperty('maintenanceMode');
      expect(response.body.data.settings.app).toHaveProperty('registrationEnabled');
      expect(response.body.data.settings.security).toHaveProperty('maxLoginAttempts');
      expect(response.body.data.settings.features).toHaveProperty('mlRecommendationsEnabled');
    });
  });

  describe('Admin Activity Tracking', () => {
    test('should get recent admin activity', async () => {
      const response = await request(app)
        .get('/api/admin/activity')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('timeframe');
      expect(response.body.data).toHaveProperty('activity');
      expect(response.body.data.activity).toBeArray();
    });

    test('should filter admin activity by hours', async () => {
      const response = await request(app)
        .get('/api/admin/activity')
        .query({ hours: 48 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.timeframe).toBe('48h');
    });
  });

  describe('Reports and Moderation', () => {
    test('should get reports (legacy endpoint)', async () => {
      const response = await request(app)
        .get('/api/admin/reports')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('reports');
      expect(response.body.data.reports).toBeArray();
    });

    test('should filter reports by type', async () => {
      const response = await request(app)
        .get('/api/admin/reports')
        .query({ type: 'users' })
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('reports');
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits on admin endpoints', async () => {
      // Make many requests quickly
      const requests = Array(250).fill().map(() =>
        request(app)
          .get('/api/admin/dashboard/overview')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const responses = await Promise.allSettled(requests);
      
      // Some requests should be rate limited
      const rateLimited = responses.filter(
        result => result.value?.status === 429
      );
      
      expect(rateLimited.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Mock database error
      const originalFind = User.find;
      User.find = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/admin/users/enhanced')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get user data');

      // Restore original method
      User.find = originalFind;
    });

    test('should handle invalid MongoDB ObjectIds', async () => {
      const response = await request(app)
        .get('/api/admin/users/invalid-id')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Performance', () => {
    test('should respond to dashboard requests within reasonable time', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000); // Should respond within 5 seconds
      expect(response.body.success).toBe(true);
    });

    test('should handle concurrent admin requests efficiently', async () => {
      const requests = Array(10).fill().map(() =>
        request(app)
          .get('/api/admin/dashboard/overview')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(10000); // All requests within 10 seconds
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Backwards Compatibility', () => {
    test('should maintain compatibility with legacy dashboard endpoint', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('analytics');
      
      // Should have legacy structure
      expect(response.body.data.analytics).toHaveProperty('users');
      expect(response.body.data.analytics).toHaveProperty('engagement');
      expect(response.body.data.analytics).toHaveProperty('content');
      expect(response.body.data.analytics).toHaveProperty('moderation');
    });

    test('should support legacy user management endpoints', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('users');
      expect(response.body.data).toHaveProperty('pagination');
    });

    test('should support legacy activity management endpoints', async () => {
      const response = await request(app)
        .get('/api/admin/activities/pending')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('activities');
    });
  });
});