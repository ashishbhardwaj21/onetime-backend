/**
 * Admin Dashboard Service Unit Tests
 * Tests comprehensive admin dashboard functionality
 */

const AdminDashboardService = require('../../../services/AdminDashboardService');
const User = require('../../../models/User');
const Activity = require('../../../models/Activity');
const Subscription = require('../../../models/Subscription');
const Interaction = require('../../../models/Interaction');
const Match = require('../../../models/Match');

describe('AdminDashboardService', () => {
  let testUsers, testActivities, testSubscriptions;

  beforeEach(async () => {
    // Create test data
    testUsers = await Promise.all([
      global.testUtils.createTestUser({
        email: 'user1@test.com',
        profile: {
          name: 'User One',
          age: 25,
          location: { city: 'New York', coordinates: [-74.0059, 40.7128] }
        },
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      }),
      global.testUtils.createTestUser({
        email: 'user2@test.com',
        profile: {
          name: 'User Two',
          age: 30,
          location: { city: 'Los Angeles', coordinates: [-118.2437, 34.0522] }
        },
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      }),
      global.testUtils.createTestUser({
        email: 'user3@test.com',
        profile: {
          name: 'User Three',
          age: 28,
          location: { city: 'New York', coordinates: [-74.0100, 40.7150] }
        },
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
      })
    ]);

    testActivities = await Promise.all([
      global.testUtils.createTestActivity({
        organizer: testUsers[0]._id,
        title: 'Coffee Meetup',
        category: 'dining',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      }),
      global.testUtils.createTestActivity({
        organizer: testUsers[1]._id,
        title: 'Hiking Adventure',
        category: 'outdoor',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      })
    ]);

    // Mock subscriptions
    testSubscriptions = [
      {
        userId: testUsers[0]._id,
        tier: 'premium',
        status: 'active',
        pricing: { amount: 9.99, interval: 'month' },
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
      },
      {
        userId: testUsers[1]._id,
        tier: 'plus',
        status: 'active',
        pricing: { amount: 19.99, interval: 'month' },
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      }
    ];
  });

  describe('getOverviewStats', () => {
    test('should return comprehensive overview statistics', async () => {
      const overview = await AdminDashboardService.getOverviewStats('7d');

      expect(overview).toHaveProperty('timeframe', '7d');
      expect(overview).toHaveProperty('period');
      expect(overview.period).toHaveProperty('start');
      expect(overview.period).toHaveProperty('end');
      
      expect(overview).toHaveProperty('users');
      expect(overview.users).toHaveProperty('total');
      expect(overview.users).toHaveProperty('new');
      expect(overview.users).toHaveProperty('active');
      expect(overview.users).toHaveProperty('verified');
      expect(overview.users).toHaveProperty('growth');

      expect(overview).toHaveProperty('activities');
      expect(overview.activities).toHaveProperty('total');
      expect(overview.activities).toHaveProperty('new');
      expect(overview.activities).toHaveProperty('upcoming');
      expect(overview.activities).toHaveProperty('completed');

      expect(overview).toHaveProperty('subscriptions');
      expect(overview.subscriptions).toHaveProperty('total');
      expect(overview.subscriptions).toHaveProperty('new');
      expect(overview.subscriptions).toHaveProperty('active');
      expect(overview.subscriptions).toHaveProperty('conversionRate');

      expect(overview).toHaveProperty('engagement');
      expect(overview.engagement).toHaveProperty('totalInteractions');
      expect(overview.engagement).toHaveProperty('dailyActiveUsers');
      expect(overview.engagement).toHaveProperty('messagesSent');

      expect(overview).toHaveProperty('revenue');
      expect(overview.revenue).toHaveProperty('total');
      expect(overview.revenue).toHaveProperty('mrr');
      expect(overview.revenue).toHaveProperty('growth');

      expect(overview).toHaveProperty('moderation');
      expect(overview.moderation).toHaveProperty('totalReports');
      expect(overview.moderation).toHaveProperty('pendingReports');
      expect(overview.moderation).toHaveProperty('resolvedReports');

      expect(overview).toHaveProperty('alerts');
      expect(overview.alerts).toBeArray();

      expect(overview).toHaveProperty('lastUpdated');
      expect(new Date(overview.lastUpdated)).toBeValidDate();
    });

    test('should handle different timeframes', async () => {
      const timeframes = ['24h', '7d', '30d', '90d'];
      
      for (const timeframe of timeframes) {
        const overview = await AdminDashboardService.getOverviewStats(timeframe);
        expect(overview.timeframe).toBe(timeframe);
        expect(overview.period.start).toBeValidDate();
        expect(overview.period.end).toBeValidDate();
      }
    });

    test('should calculate growth percentages correctly', async () => {
      const overview = await AdminDashboardService.getOverviewStats('7d');
      
      expect(typeof overview.users.growth).toBe('number');
      expect(typeof overview.users.newUsersGrowth).toBe('number');
      expect(typeof overview.activities.growth).toBe('number');
      expect(typeof overview.revenue.growth).toBe('number');
    });
  });

  describe('getUserStats', () => {
    test('should return detailed user statistics', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const userStats = await AdminDashboardService.getUserStats(startDate, endDate);

      expect(userStats).toHaveProperty('total');
      expect(userStats).toHaveProperty('new');
      expect(userStats).toHaveProperty('active');
      expect(userStats).toHaveProperty('verified');
      expect(userStats).toHaveProperty('verificationRate');
      expect(userStats).toHaveProperty('dailySignups');
      expect(userStats).toHaveProperty('topLocations');
      expect(userStats).toHaveProperty('demographics');
      expect(userStats).toHaveProperty('retention');

      expect(userStats.demographics).toHaveProperty('age');
      expect(userStats.demographics).toHaveProperty('gender');
      expect(userStats.demographics.age).toBeArray();
      expect(userStats.demographics.gender).toBeArray();

      expect(userStats.dailySignups).toBeArray();
      expect(userStats.topLocations).toBeArray();

      expect(typeof userStats.total).toBe('number');
      expect(typeof userStats.new).toBe('number');
      expect(typeof userStats.active).toBe('number');
      expect(typeof userStats.verified).toBe('number');
      expect(typeof userStats.verificationRate).toBe('number');
    });

    test('should calculate verification rate correctly', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const userStats = await AdminDashboardService.getUserStats(startDate, endDate);
      
      if (userStats.total > 0) {
        expect(userStats.verificationRate).toBeWithin(0, 100);
        expect(userStats.verificationRate).toBe((userStats.verified / userStats.total) * 100);
      }
    });
  });

  describe('getActivityStats', () => {
    test('should return detailed activity statistics', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const activityStats = await AdminDashboardService.getActivityStats(startDate, endDate);

      expect(activityStats).toHaveProperty('total');
      expect(activityStats).toHaveProperty('new');
      expect(activityStats).toHaveProperty('upcoming');
      expect(activityStats).toHaveProperty('completed');
      expect(activityStats).toHaveProperty('totalParticipants');
      expect(activityStats).toHaveProperty('averageParticipants');
      expect(activityStats).toHaveProperty('dailyActivities');
      expect(activityStats).toHaveProperty('categoryDistribution');
      expect(activityStats).toHaveProperty('locationDistribution');
      expect(activityStats).toHaveProperty('popular');

      expect(typeof activityStats.total).toBe('number');
      expect(typeof activityStats.new).toBe('number');
      expect(typeof activityStats.upcoming).toBe('number');
      expect(typeof activityStats.completed).toBe('number');
      expect(typeof activityStats.totalParticipants).toBe('number');
      expect(typeof activityStats.averageParticipants).toBe('number');

      expect(activityStats.dailyActivities).toBeArray();
      expect(activityStats.categoryDistribution).toBeArray();
      expect(activityStats.locationDistribution).toBeArray();
      expect(activityStats.popular).toBeArray();
    });
  });

  describe('getSubscriptionStats', () => {
    test('should return detailed subscription statistics', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const subscriptionStats = await AdminDashboardService.getSubscriptionStats(startDate, endDate);

      expect(subscriptionStats).toHaveProperty('total');
      expect(subscriptionStats).toHaveProperty('new');
      expect(subscriptionStats).toHaveProperty('active');
      expect(subscriptionStats).toHaveProperty('canceled');
      expect(subscriptionStats).toHaveProperty('churnRate');
      expect(subscriptionStats).toHaveProperty('conversionRate');
      expect(subscriptionStats).toHaveProperty('dailySubscriptions');
      expect(subscriptionStats).toHaveProperty('tierDistribution');
      expect(subscriptionStats).toHaveProperty('customerLifetimeValue');

      expect(typeof subscriptionStats.total).toBe('number');
      expect(typeof subscriptionStats.new).toBe('number');
      expect(typeof subscriptionStats.active).toBe('number');
      expect(typeof subscriptionStats.canceled).toBe('number');
      expect(typeof subscriptionStats.churnRate).toBe('number');
      expect(typeof subscriptionStats.conversionRate).toBe('number');
      expect(typeof subscriptionStats.customerLifetimeValue).toBe('number');

      expect(subscriptionStats.dailySubscriptions).toBeArray();
      expect(subscriptionStats.tierDistribution).toBeArray();
    });
  });

  describe('getEngagementStats', () => {
    test('should return detailed engagement statistics', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const engagementStats = await AdminDashboardService.getEngagementStats(startDate, endDate);

      expect(engagementStats).toHaveProperty('totalInteractions');
      expect(engagementStats).toHaveProperty('dailyActiveUsers');
      expect(engagementStats).toHaveProperty('averageSessionDuration');
      expect(engagementStats).toHaveProperty('messagesSent');
      expect(engagementStats).toHaveProperty('matchesCreated');
      expect(engagementStats).toHaveProperty('profileViews');
      expect(engagementStats).toHaveProperty('featureUsage');
      expect(engagementStats).toHaveProperty('trends');
      expect(engagementStats).toHaveProperty('userDistribution');

      expect(typeof engagementStats.totalInteractions).toBe('number');
      expect(typeof engagementStats.dailyActiveUsers).toBe('number');
      expect(typeof engagementStats.averageSessionDuration).toBe('number');
      expect(typeof engagementStats.messagesSent).toBe('number');
      expect(typeof engagementStats.matchesCreated).toBe('number');
      expect(typeof engagementStats.profileViews).toBe('number');
    });
  });

  describe('getRevenueStats', () => {
    test('should return detailed revenue statistics', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const revenueStats = await AdminDashboardService.getRevenueStats(startDate, endDate);

      expect(revenueStats).toHaveProperty('total');
      expect(revenueStats).toHaveProperty('count');
      expect(revenueStats).toHaveProperty('average');
      expect(revenueStats).toHaveProperty('mrr');
      expect(revenueStats).toHaveProperty('arpu');
      expect(revenueStats).toHaveProperty('daily');
      expect(revenueStats).toHaveProperty('byTier');

      expect(typeof revenueStats.total).toBe('number');
      expect(typeof revenueStats.count).toBe('number');
      expect(typeof revenueStats.average).toBe('number');
      expect(typeof revenueStats.mrr).toBe('number');
      expect(typeof revenueStats.arpu).toBe('number');

      expect(revenueStats.daily).toBeArray();
      expect(revenueStats.byTier).toBeArray();
    });
  });

  describe('getUserManagement', () => {
    test('should return paginated user management data', async () => {
      const filters = {
        page: 1,
        limit: 10
      };

      const result = await AdminDashboardService.getUserManagement(filters);

      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('pagination');

      expect(result.users).toBeArray();
      expect(result.pagination).toHaveProperty('currentPage');
      expect(result.pagination).toHaveProperty('totalPages');
      expect(result.pagination).toHaveProperty('totalCount');
      expect(result.pagination).toHaveProperty('hasNext');
      expect(result.pagination).toHaveProperty('hasPrev');

      expect(result.pagination.currentPage).toBe(1);
      expect(typeof result.pagination.totalCount).toBe('number');
    });

    test('should filter users by search term', async () => {
      const filters = {
        search: 'User One',
        page: 1,
        limit: 10
      };

      const result = await AdminDashboardService.getUserManagement(filters);

      expect(result.users).toBeArray();
      // Should find users matching the search term
      if (result.users.length > 0) {
        const user = result.users[0];
        expect(user.profile?.name || user.email).toMatch(/User One/i);
      }
    });

    test('should filter users by status', async () => {
      const filters = {
        status: 'active',
        page: 1,
        limit: 10
      };

      const result = await AdminDashboardService.getUserManagement(filters);

      expect(result.users).toBeArray();
      result.users.forEach(user => {
        expect(user.status).toBe('active');
      });
    });

    test('should filter users by age range', async () => {
      const filters = {
        ageMin: 25,
        ageMax: 30,
        page: 1,
        limit: 10
      };

      const result = await AdminDashboardService.getUserManagement(filters);

      expect(result.users).toBeArray();
      result.users.forEach(user => {
        if (user.profile?.age) {
          expect(user.profile.age).toBeGreaterThanOrEqual(25);
          expect(user.profile.age).toBeLessThanOrEqual(30);
        }
      });
    });

    test('should sort users correctly', async () => {
      const filters = {
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: 1,
        limit: 10
      };

      const result = await AdminDashboardService.getUserManagement(filters);

      expect(result.users).toBeArray();
      if (result.users.length > 1) {
        for (let i = 1; i < result.users.length; i++) {
          const prevDate = new Date(result.users[i - 1].createdAt);
          const currDate = new Date(result.users[i].createdAt);
          expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
        }
      }
    });
  });

  describe('getActivityManagement', () => {
    test('should return paginated activity management data', async () => {
      const filters = {
        page: 1,
        limit: 10
      };

      const result = await AdminDashboardService.getActivityManagement(filters);

      expect(result).toHaveProperty('activities');
      expect(result).toHaveProperty('pagination');

      expect(result.activities).toBeArray();
      expect(result.pagination).toHaveProperty('currentPage');
      expect(result.pagination).toHaveProperty('totalPages');
      expect(result.pagination).toHaveProperty('totalCount');
      expect(result.pagination).toHaveProperty('hasNext');
      expect(result.pagination).toHaveProperty('hasPrev');

      expect(result.pagination.currentPage).toBe(1);
      expect(typeof result.pagination.totalCount).toBe('number');
    });

    test('should filter activities by category', async () => {
      const filters = {
        category: 'dining',
        page: 1,
        limit: 10
      };

      const result = await AdminDashboardService.getActivityManagement(filters);

      expect(result.activities).toBeArray();
      result.activities.forEach(activity => {
        expect(activity.category).toBe('dining');
      });
    });

    test('should filter activities by search term', async () => {
      const filters = {
        search: 'Coffee',
        page: 1,
        limit: 10
      };

      const result = await AdminDashboardService.getActivityManagement(filters);

      expect(result.activities).toBeArray();
      if (result.activities.length > 0) {
        const activity = result.activities[0];
        expect(activity.title || activity.description).toMatch(/Coffee/i);
      }
    });
  });

  describe('getSystemAlerts', () => {
    test('should return system alerts array', async () => {
      const alerts = await AdminDashboardService.getSystemAlerts();

      expect(alerts).toBeArray();
      alerts.forEach(alert => {
        expect(alert).toHaveProperty('type');
        expect(alert).toHaveProperty('title');
        expect(alert).toHaveProperty('message');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('timestamp');
        
        expect(['success', 'info', 'warning', 'error']).toContain(alert.type);
        expect(['low', 'medium', 'high', 'critical']).toContain(alert.severity);
        expect(new Date(alert.timestamp)).toBeValidDate();
      });
    });
  });

  describe('Helper Methods', () => {
    test('getDateRange should return correct date ranges', () => {
      const testCases = ['24h', '7d', '30d', '90d'];
      
      testCases.forEach(timeframe => {
        const { startDate, endDate } = AdminDashboardService.getDateRange(timeframe);
        
        expect(startDate).toBeValidDate();
        expect(endDate).toBeValidDate();
        expect(startDate.getTime()).toBeLessThan(endDate.getTime());
        
        const diffMs = endDate.getTime() - startDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        switch (timeframe) {
          case '24h':
            expect(diffDays).toBeCloseTo(1, 0);
            break;
          case '7d':
            expect(diffDays).toBeCloseTo(7, 0);
            break;
          case '30d':
            expect(diffDays).toBeCloseTo(30, 0);
            break;
          case '90d':
            expect(diffDays).toBeCloseTo(90, 0);
            break;
        }
      });
    });

    test('getPreviousPeriod should return correct previous period', () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-01-08');
      
      const { startDate: prevStart, endDate: prevEnd } = AdminDashboardService.getPreviousPeriod(startDate, endDate);
      
      expect(prevStart).toBeValidDate();
      expect(prevEnd).toBeValidDate();
      expect(prevEnd.getTime()).toBe(startDate.getTime());
      
      const duration = endDate.getTime() - startDate.getTime();
      const prevDuration = prevEnd.getTime() - prevStart.getTime();
      expect(prevDuration).toBe(duration);
    });

    test('calculateGrowth should calculate growth percentage correctly', () => {
      expect(AdminDashboardService.calculateGrowth(100, 80)).toBe(25);
      expect(AdminDashboardService.calculateGrowth(80, 100)).toBe(-20);
      expect(AdminDashboardService.calculateGrowth(100, 0)).toBe(100);
      expect(AdminDashboardService.calculateGrowth(0, 100)).toBe(-100);
      expect(AdminDashboardService.calculateGrowth(50, 0)).toBe(100);
      expect(AdminDashboardService.calculateGrowth(0, 0)).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Mock database error
      const originalFind = User.find;
      User.find = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      await expect(AdminDashboardService.getOverviewStats('7d')).rejects.toThrow('Database connection failed');

      // Restore original method
      User.find = originalFind;
    });

    test('should handle invalid timeframes', () => {
      const { startDate, endDate } = AdminDashboardService.getDateRange('invalid');
      
      // Should default to 7d
      expect(startDate).toBeValidDate();
      expect(endDate).toBeValidDate();
      
      const diffMs = endDate.getTime() - startDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(7, 0);
    });
  });

  describe('Performance', () => {
    test('should complete overview stats within reasonable time', async () => {
      const startTime = Date.now();
      
      await AdminDashboardService.getOverviewStats('7d');
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle concurrent requests efficiently', async () => {
      const promises = Array(5).fill().map(() =>
        AdminDashboardService.getOverviewStats('7d')
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toHaveProperty('timeframe');
        expect(result).toHaveProperty('users');
        expect(result).toHaveProperty('activities');
      });
    });
  });
});