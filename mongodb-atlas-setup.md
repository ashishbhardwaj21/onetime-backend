# MongoDB Atlas Production Setup Guide

## 🗄️ Setting Up MongoDB Atlas for OneTime Dating App

### Step 1: Create MongoDB Atlas Account

1. **Visit MongoDB Atlas**: Go to [https://cloud.mongodb.com](https://cloud.mongodb.com)
2. **Sign Up**: Create a free account or sign in to existing account
3. **Verify Email**: Complete email verification if required

### Step 2: Create a New Project

1. **Create Project**: Click "New Project"
2. **Project Name**: Enter "OneTime Dating App"
3. **Add Members**: Add team members if needed
4. **Create Project**: Click "Create Project"

### Step 3: Create Production Cluster

1. **Build Database**: Click "Build a Database"
2. **Choose Plan**:
   - **Free Tier (M0)**: For testing/development
   - **Dedicated (M10+)**: For production (recommended)
   - **Shared (M2/M5)**: For small production workloads

#### Recommended Production Configuration:
- **Cloud Provider**: AWS (most reliable)
- **Region**: Choose closest to your users
- **Cluster Tier**: M10 or higher for production
- **Cluster Name**: `onetime-production`

3. **Additional Settings**:
   - **MongoDB Version**: Use latest stable (6.0+)
   - **Backup**: Enable automated backups
   - **Encryption**: Enable encryption at rest

### Step 4: Configure Database Security

#### Create Database User
1. **Database Access**: Go to "Database Access" in sidebar
2. **Add New Database User**:
   - **Username**: `onetime-app-user`
   - **Password**: Generate secure password (save it!)
   - **Database User Privileges**: 
     - Built-in Role: `readWrite`
     - Database: `onetime-production`
3. **Add User**: Click "Add User"

#### Configure Network Access
1. **Network Access**: Go to "Network Access" in sidebar
2. **Add IP Address**:
   - **For Development**: Add your current IP
   - **For Production**: Add your server's IP address
   - **Temporary**: You can use `0.0.0.0/0` (allow all) for testing, but restrict in production

### Step 5: Get Connection String

1. **Connect**: Go to cluster and click "Connect"
2. **Connect Your Application**: Choose this option
3. **Driver**: Select "Node.js" and latest version
4. **Connection String**: Copy the connection string

Example connection string:
```
mongodb+srv://onetime-app-user:<password>@onetime-production.abc123.mongodb.net/onetime-production?retryWrites=true&w=majority
```

### Step 6: Production Security Hardening

#### Database Security Checklist:
- ✅ **Strong Password**: Use 20+ character password with symbols
- ✅ **Restricted IP Access**: Only allow your production server IPs
- ✅ **Database User Permissions**: Use least privilege (readWrite only)
- ✅ **Connection Encryption**: Use SSL/TLS (enabled by default)
- ✅ **Audit Logs**: Enable audit logs in Atlas (M10+)
- ✅ **Backup**: Configure automated backups

#### Atlas Security Features to Enable:
1. **Two-Factor Authentication**: Enable on your Atlas account
2. **API Keys**: Use API keys instead of passwords where possible
3. **Private Endpoints**: For enhanced security (M10+)
4. **Encryption at Rest**: Enable if not already enabled
5. **LDAP/SSO Integration**: For team access control

### Step 7: Configure Collections and Indexes

#### Required Collections:
- `users` - User profiles and authentication
- `userphotos` - User photo metadata
- `userswipes` - Swipe history
- `matches` - User matches
- `conversations` - Chat conversations
- `messages` - Chat messages
- `activities` - Activity suggestions
- `reports` - User reports and moderation

#### Essential Indexes for Performance:

```javascript
// Users collection indexes
db.users.createIndex({ "email": 1 }, { unique: true })
db.users.createIndex({ "location": "2dsphere" })
db.users.createIndex({ "profile.age": 1 })
db.users.createIndex({ "profile.interests": 1 })
db.users.createIndex({ "status": 1 })
db.users.createIndex({ "lastActive": 1 })

// Matches collection indexes
db.matches.createIndex({ "user1": 1, "user2": 1 }, { unique: true })
db.matches.createIndex({ "user1": 1, "matchedAt": -1 })
db.matches.createIndex({ "user2": 1, "matchedAt": -1 })

// Messages collection indexes
db.messages.createIndex({ "conversation": 1, "timestamp": -1 })
db.messages.createIndex({ "sender": 1, "timestamp": -1 })

// UserSwipes collection indexes
db.userswipes.createIndex({ "swiper": 1, "swiped": 1 }, { unique: true })
db.userswipes.createIndex({ "swiper": 1, "swipedAt": -1 })
db.userswipes.createIndex({ "swiped": 1, "swipedAt": -1 })

// Activities collection indexes
db.activities.createIndex({ "location": "2dsphere" })
db.activities.createIndex({ "category": 1 })
db.activities.createIndex({ "averageRating": -1 })
```

### Step 8: Environment Configuration

Add to your `.env.production` file:
```bash
MONGODB_URI=mongodb+srv://onetime-app-user:<password>@onetime-production.abc123.mongodb.net/onetime-production?retryWrites=true&w=majority
```

### Step 9: Connection Testing

Create a test script to verify connection:

```javascript
const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Atlas connection successful');
    
    // Test basic operations
    const testCollection = mongoose.connection.db.collection('test');
    await testCollection.insertOne({ test: 'connection', timestamp: new Date() });
    console.log('✅ Write operation successful');
    
    const result = await testCollection.findOne({ test: 'connection' });
    console.log('✅ Read operation successful');
    
    await testCollection.deleteOne({ test: 'connection' });
    console.log('✅ Delete operation successful');
    
    console.log('🎉 All database operations working correctly');
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testConnection();
```

### Step 10: Monitoring and Alerts

#### Atlas Monitoring Features:
1. **Real-time Performance Panel**: Monitor operations, connections, memory
2. **Custom Alerts**: Set up alerts for:
   - High connection count
   - High operation latency
   - Storage usage
   - CPU usage
   - Memory usage

#### Recommended Alert Thresholds:
- **Connections**: > 80% of limit
- **CPU**: > 80%
- **Memory**: > 85%
- **Storage**: > 80%
- **Operations/sec**: Based on your baseline

### Step 11: Backup Strategy

#### Atlas Backup Features:
1. **Continuous Backup**: Available for M10+ clusters
2. **Point-in-Time Recovery**: Restore to any point in the last 24 hours
3. **Backup Scheduling**: Configure automatic snapshots
4. **Cross-Region Backups**: For disaster recovery

#### Backup Configuration:
1. Go to cluster → Backup tab
2. Enable "Continuous Backups" (M10+)
3. Configure snapshot schedule
4. Set retention policies
5. Test restore procedures

### Step 12: Staging Environment

Create a separate cluster for staging:
1. **Cluster Name**: `onetime-staging`
2. **Configuration**: Can use smaller tier (M2/M5)
3. **Separate Database User**: `onetime-staging-user`
4. **Same Security Settings**: Apply same security measures

### Production Deployment Checklist:

- [ ] **Atlas Account**: Created and verified
- [ ] **Production Cluster**: M10+ cluster configured
- [ ] **Database User**: Created with readWrite permissions
- [ ] **Network Security**: IP whitelist configured
- [ ] **Connection String**: Obtained and tested
- [ ] **Indexes**: Performance indexes created
- [ ] **Backups**: Automated backups enabled
- [ ] **Monitoring**: Alerts configured
- [ ] **Staging Environment**: Separate staging cluster
- [ ] **Security**: 2FA enabled, strong passwords used
- [ ] **Documentation**: Connection details documented securely

### 🚨 Security Reminders:

1. **Never commit credentials** to version control
2. **Use environment variables** for all sensitive data
3. **Rotate passwords regularly** (quarterly)
4. **Monitor access logs** for suspicious activity
5. **Keep Atlas dashboard access restricted** to authorized personnel
6. **Use VPN or private endpoints** for additional security
7. **Regular security audits** of database access and permissions

### 📞 Support and Resources:

- **Atlas Documentation**: https://docs.atlas.mongodb.com/
- **MongoDB University**: Free courses on database optimization
- **Community Forums**: https://developer.mongodb.com/community/forums/
- **Atlas Support**: Available 24/7 for paid clusters

### Next Steps:

1. ✅ Complete MongoDB Atlas setup
2. 🔄 Test connection with your application
3. 📊 Set up monitoring and alerts
4. 🔒 Configure Cloudinary for image storage
5. 📧 Set up email service integration
6. 🚀 Deploy application to production server