/**
 * Create Super Admin Script
 * Initialize the first super admin user for the system
 */

const mongoose = require('mongoose');
const AdminUser = require('../models/AdminUser');
const logger = require('../utils/logger');
require('dotenv').config();

async function createSuperAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/onetime_db', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Check if super admin already exists
    const existingSuperAdmin = await AdminUser.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      console.log('Super admin already exists:', existingSuperAdmin.email);
      process.exit(0);
    }

    // Get input from command line arguments or environment variables
    const email = process.argv[2] || process.env.SUPER_ADMIN_EMAIL || 'admin@onetime.app';
    const password = process.argv[3] || process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!';
    const firstName = process.argv[4] || process.env.SUPER_ADMIN_FIRST_NAME || 'Super';
    const lastName = process.argv[5] || process.env.SUPER_ADMIN_LAST_NAME || 'Admin';

    // Validate inputs
    if (!email || !password || password.length < 8) {
      console.error('Invalid email or password (minimum 8 characters required)');
      console.log('Usage: node scripts/createSuperAdmin.js <email> <password> [firstName] [lastName]');
      process.exit(1);
    }

    // Create super admin with all permissions
    const superAdmin = new AdminUser({
      email,
      password,
      profile: {
        firstName,
        lastName,
        department: 'executive',
        title: 'System Administrator'
      },
      role: 'super_admin',
      permissions: [
        { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'activities', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'subscriptions', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'analytics', actions: ['read', 'export'] },
        { resource: 'content_moderation', actions: ['read', 'approve', 'reject'] },
        { resource: 'financial_reports', actions: ['read', 'export'] },
        { resource: 'system_settings', actions: ['read', 'update'] },
        { resource: 'admin_management', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'ml_models', actions: ['read', 'update'] },
        { resource: 'notifications', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'reports', actions: ['read', 'export'] },
        { resource: 'security', actions: ['read', 'update'] },
        { resource: 'api_keys', actions: ['create', 'read', 'update', 'delete'] },
        { resource: 'webhooks', actions: ['create', 'read', 'update', 'delete'] }
      ],
      status: 'active',
      preferences: {
        timezone: 'UTC',
        language: 'en',
        notifications: {
          email: {
            securityAlerts: true,
            systemUpdates: true,
            userReports: true,
            weeklyDigest: true
          },
          dashboard: {
            realTimeAlerts: true,
            criticalIssues: true
          }
        },
        dashboardLayout: {
          widgets: ['overview', 'users', 'activities', 'revenue', 'alerts'],
          defaultView: 'overview'
        }
      }
    });

    await superAdmin.save();

    console.log('✅ Super Admin created successfully!');
    console.log('📧 Email:', email);
    console.log('👤 Name:', `${firstName} ${lastName}`);
    console.log('🔑 Role: Super Admin');
    console.log('📅 Created:', new Date().toISOString());
    console.log('🔒 Status: Active');
    
    console.log('\n📝 Login credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    
    console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
    console.log('1. Change the default password immediately after first login');
    console.log('2. Enable two-factor authentication for enhanced security');
    console.log('3. Store these credentials securely');
    console.log('4. Consider setting up IP whitelisting for admin access');

    // Log the creation
    logger.info('Super admin created', {
      adminId: superAdmin._id,
      email: superAdmin.email,
      role: superAdmin.role,
      createdAt: superAdmin.createdAt
    });

  } catch (error) {
    console.error('❌ Error creating super admin:', error.message);
    logger.error('Super admin creation failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the script
if (require.main === module) {
  console.log('🚀 Creating Super Admin...\n');
  createSuperAdmin();
}

module.exports = createSuperAdmin;