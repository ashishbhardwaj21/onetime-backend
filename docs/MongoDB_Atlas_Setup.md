# MongoDB Atlas Setup Guide for OneTime Dating App

## Overview
This guide walks through setting up MongoDB Atlas for the OneTime dating app backend, including cluster configuration, security settings, database structure, and production deployment considerations.

## 1. MongoDB Atlas Account Setup

### Create Account
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for a free account or log in
3. Create a new organization: "OneTime Dating App"
4. Create a new project: "OneTime Production"

### Choose Deployment Option
- **Recommended**: M0 Sandbox (Free tier for development)
- **Production**: M10+ (Dedicated clusters for production)

## 2. Cluster Configuration

### Basic Configuration
```yaml
Cluster Name: OneTime-Cluster
Cloud Provider: AWS (recommended for global reach)
Region: us-east-1 (Virginia) - closest to major user base
Cluster Tier: M0 Sandbox (development) / M10 (production)
MongoDB Version: 7.0 (latest stable)
```

### Advanced Configuration
```yaml
Backup: Enabled (continuous cloud backup)
Monitoring: Enabled (performance advisor)
Additional Settings:
  - Enable connection IP access list
  - Enable database access users
  - Configure network security
```

## 3. Security Configuration

### Database Users
Create application-specific users with minimal required permissions:

```javascript
// Admin user (for setup only)
{
  username: "onetime-admin",
  password: "generate-strong-password",
  roles: ["atlasAdmin"]
}

// Application user (for backend)
{
  username: "onetime-app",
  password: "generate-strong-password", 
  roles: [
    {
      role: "readWrite",
      db: "onetime-production"
    },
    {
      role: "readWrite", 
      db: "onetime-development"
    }
  ]
}

// Read-only user (for analytics)
{
  username: "onetime-analytics",
  password: "generate-strong-password",
  roles: [
    {
      role: "read",
      db: "onetime-production"
    }
  ]
}
```

### Network Access
Configure IP whitelist:
```yaml
Development:
  - 0.0.0.0/0 (allow from anywhere - development only)
  
Production:
  - Your server IP addresses
  - Load balancer IP ranges
  - Office IP addresses (for admin access)
```

## 4. Database Structure

### Database Names
```yaml
Development: onetime-development
Staging: onetime-staging  
Production: onetime-production
```

### Collections Schema
Based on our Mongoose models, the following collections will be created:

```javascript
// Core Collections
users              // User profiles and authentication
matches             // User matching and swipe data
conversations       // Chat conversations between matches
messages            // Individual messages in conversations
activities          // Date activity suggestions
userswipes          // Swipe tracking and analytics
notifications       // Push notifications and in-app alerts

// Analytics Collections (optional)
user_analytics      // User behavior tracking
match_analytics     // Matching algorithm performance
message_analytics   // Communication patterns
```

## 5. Connection String Configuration

### Environment-Specific Connection Strings
```bash
# Development
MONGODB_URI_DEV="mongodb+srv://onetime-app:<password>@onetime-cluster.xxxxx.mongodb.net/onetime-development?retryWrites=true&w=majority"

# Staging  
MONGODB_URI_STAGING="mongodb+srv://onetime-app:<password>@onetime-cluster.xxxxx.mongodb.net/onetime-staging?retryWrites=true&w=majority"

# Production
MONGODB_URI_PROD="mongodb+srv://onetime-app:<password>@onetime-cluster.xxxxx.mongodb.net/onetime-production?retryWrites=true&w=majority"
```

### Connection Options
```javascript
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,           // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000,    // Close sockets after 45 seconds of inactivity
  bufferCommands: false,     // Disable mongoose buffering
  bufferMaxEntries: 0        // Disable mongoose buffering
};
```

## 6. Indexes for Performance

### Essential Indexes
```javascript
// Users collection
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ "profile.location": "2dsphere" })
db.users.createIndex({ status: 1, "verification.emailVerified": 1 })
db.users.createIndex({ createdAt: -1 })

// Matches collection  
db.matches.createIndex({ user1: 1, user2: 1 }, { unique: true })
db.matches.createIndex({ user1: 1, mutual: 1 })
db.matches.createIndex({ user2: 1, mutual: 1 })
db.matches.createIndex({ matchedAt: -1 })

// Messages collection
db.messages.createIndex({ conversationId: 1, timestamp: -1 })
db.messages.createIndex({ sender: 1, timestamp: -1 })

// Conversations collection
db.conversations.createIndex({ participants: 1 })
db.conversations.createIndex({ "lastMessage.timestamp": -1 })

// Activities collection
db.activities.createIndex({ location: "2dsphere" })
db.activities.createIndex({ category: 1, priceRange: 1 })
db.activities.createIndex({ averageRating: -1 })

// Text search indexes
db.activities.createIndex({ 
  title: "text", 
  description: "text", 
  tags: "text" 
})
```

## 7. Environment Variables Setup

### Backend .env Configuration
```bash
# Database
MONGODB_URI=mongodb+srv://onetime-app:<password>@onetime-cluster.xxxxx.mongodb.net/onetime-production?retryWrites=true&w=majority

# JWT Authentication
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Server Configuration  
NODE_ENV=production
PORT=3000

# Email Service (for verification)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
FROM_EMAIL=noreply@onetime.app
FROM_NAME=OneTime Dating App

# File Upload (if using cloud storage)
CLOUDINARY_CLOUD_NAME=your-cloudinary-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# CORS
FRONTEND_URL=https://onetime.app
ALLOWED_ORIGINS=https://onetime.app,https://www.onetime.app

# Monitoring (optional)
SENTRY_DSN=your-sentry-dsn
```

## 8. Data Migration Strategy

### Migration Script
```javascript
// migration/migrateToMongoDB.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Match = require('../models/Match');

async function migrateFromAzure() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    
    // 1. Migrate user data from Azure SQL/CosmosDB
    console.log('Migrating users...');
    // Implementation depends on current Azure data structure
    
    // 2. Migrate match data
    console.log('Migrating matches...');
    
    // 3. Migrate conversation data  
    console.log('Migrating conversations...');
    
    // 4. Create initial indexes
    console.log('Creating indexes...');
    await createIndexes();
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

async function createIndexes() {
  // Create all necessary indexes for performance
  const collections = [
    { collection: 'users', indexes: userIndexes },
    { collection: 'matches', indexes: matchIndexes },
    // ... other collections
  ];
  
  for (const { collection, indexes } of collections) {
    for (const index of indexes) {
      await mongoose.connection.db.collection(collection).createIndex(index.keys, index.options);
    }
  }
}
```

## 9. Monitoring and Analytics

### MongoDB Atlas Monitoring
- Enable Performance Advisor
- Set up alerts for:
  - High CPU usage (>80%)
  - High memory usage (>90%)
  - Slow queries (>100ms)
  - Connection count (>80% of limit)

### Custom Monitoring
```javascript
// monitoring/mongoMetrics.js
const mongoose = require('mongoose');

class MongoMetrics {
  static async getConnectionStats() {
    const stats = await mongoose.connection.db.stats();
    return {
      collections: stats.collections,
      dataSize: stats.dataSize,
      indexSize: stats.indexSize,
      storageSize: stats.storageSize
    };
  }
  
  static async getSlowQueries() {
    // Query the profiler collection for slow operations
    const db = mongoose.connection.db;
    return await db.collection('system.profile')
      .find({ ts: { $gte: new Date(Date.now() - 3600000) } }) // Last hour
      .sort({ ts: -1 })
      .limit(10)
      .toArray();
  }
}

module.exports = MongoMetrics;
```

## 10. Production Deployment Checklist

### Security Checklist
- [ ] Database users have minimal required permissions
- [ ] IP whitelist configured for production servers only
- [ ] Strong passwords generated and stored securely
- [ ] SSL/TLS enabled for all connections
- [ ] Network peering configured (if applicable)

### Performance Checklist  
- [ ] Appropriate cluster tier selected for expected load
- [ ] All necessary indexes created
- [ ] Connection pooling configured
- [ ] Query performance tested
- [ ] Backup strategy implemented

### Monitoring Checklist
- [ ] Atlas monitoring enabled
- [ ] Custom application metrics implemented
- [ ] Alert thresholds configured
- [ ] Log aggregation setup
- [ ] Performance dashboard created

## 11. Cost Optimization

### Development/Testing
- Use M0 Sandbox (free tier)
- Single region deployment
- Minimal backup retention

### Production Scaling
```yaml
Start: M10 ($57/month)
  - 2GB RAM, 10GB storage
  - Good for up to 1,000 concurrent users

Scale to: M20 ($114/month)  
  - 4GB RAM, 20GB storage
  - Good for up to 5,000 concurrent users

Scale to: M30 ($228/month)
  - 8GB RAM, 40GB storage  
  - Good for up to 10,000 concurrent users
```

### Cost Monitoring
- Set up billing alerts
- Monitor data transfer costs
- Optimize index usage
- Archive old data regularly

## 12. Backup and Disaster Recovery

### Backup Strategy
```yaml
Continuous Backup: Enabled
Retention Period: 7 days (development), 30 days (production)
Point-in-Time Recovery: Enabled
Cross-Region Backup: Enabled for production
```

### Disaster Recovery Plan
1. **RTO (Recovery Time Objective)**: 1 hour
2. **RPO (Recovery Point Objective)**: 15 minutes  
3. **Backup verification**: Weekly automated tests
4. **Failover procedures**: Documented and tested monthly

## Next Steps

1. **Create MongoDB Atlas Account**
2. **Set up development cluster** 
3. **Configure security settings**
4. **Test connection from backend**
5. **Run migration script**
6. **Deploy to staging environment**
7. **Performance testing**
8. **Production deployment**

This comprehensive setup ensures a robust, scalable, and secure MongoDB foundation for the OneTime dating app.