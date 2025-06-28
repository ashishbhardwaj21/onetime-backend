# OneTime Dating App - Complete Deployment Guide

## Overview
This guide provides step-by-step instructions for deploying the OneTime dating app with MongoDB backend, from development setup to production deployment.

## 📋 Prerequisites

### Development Environment
- Node.js 18+ 
- npm or yarn
- MongoDB Atlas account
- Git
- Xcode 15+ (for iOS app)

### Production Environment
- Cloud hosting provider (AWS, DigitalOcean, Heroku, etc.)
- Domain name
- SSL certificate
- CDN for file storage (Cloudinary, AWS S3)
- Email service (SendGrid, AWS SES)

## 🚀 Phase 1: Local Development Setup

### 1. Backend Setup

```bash
# Clone and setup backend
cd "OneTime Backend"
npm install

# Create environment file
cp .env.example .env

# Edit .env with your configurations
nano .env
```

**Required Environment Variables:**
```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/onetime-development

# JWT
JWT_SECRET=your-super-secure-jwt-secret-key-minimum-32-characters-long
JWT_EXPIRES_IN=7d

# Server
NODE_ENV=development
PORT=3000
```

### 2. MongoDB Atlas Setup

1. **Create MongoDB Atlas Account**
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create free M0 cluster
   - Note connection string

2. **Configure Database**
   ```bash
   # Run MongoDB setup script
   npm run setup:mongodb
   
   # Create indexes
   npm run indexes
   
   # Seed initial data
   npm run seed:dev
   ```

3. **Verify Setup**
   ```bash
   # Test database health
   npm run health
   ```

### 3. Start Development Server

```bash
# Start backend in development mode
npm run dev

# Test health endpoint
curl http://localhost:3000/health

# Test authentication flow
npm run test:auth
```

### 4. iOS App Configuration

1. **Update API Base URL**
   ```swift
   // In AppConfig.swift or Info.plist
   API_BASE_URL_DEV=http://localhost:3000
   ```

2. **Remove Remaining Azure Dependencies**
   - Remove MSAL package from Xcode project
   - Update import statements
   - Test compilation

## 🏗️ Phase 2: Staging Deployment

### 1. Staging Server Setup (DigitalOcean/AWS)

**DigitalOcean Droplet:**
```bash
# Create Ubuntu 22.04 droplet (2GB RAM minimum)
# SSH into server
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install PM2 for process management
npm install -g pm2

# Install Nginx
apt install nginx -y

# Install certbot for SSL
apt install certbot python3-certbot-nginx -y
```

### 2. Deploy Backend Code

```bash
# On server
cd /var/www
git clone https://github.com/your-username/onetime-backend.git
cd onetime-backend

# Install dependencies
npm ci --production

# Create production environment file
cp .env.example .env.production
nano .env.production
```

**Production Environment Variables:**
```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/onetime-staging

# JWT
JWT_SECRET=production-jwt-secret-very-secure-64-characters-minimum
JWT_EXPIRES_IN=7d

# Server
NODE_ENV=staging
PORT=3000
HOST=0.0.0.0

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
FROM_EMAIL=noreply@onetime.app

# File uploads
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 3. Configure Process Manager

```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'onetime-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOF

# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Configure Nginx Reverse Proxy

```bash
# Create Nginx config
cat > /etc/nginx/sites-available/onetime-api << EOF
server {
    listen 80;
    server_name api.onetime.app;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
        send_timeout 300;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/onetime-api /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 5. Setup SSL Certificate

```bash
# Get SSL certificate
certbot --nginx -d api.onetime.app

# Verify auto-renewal
certbot renew --dry-run
```

### 6. Test Staging Deployment

```bash
# Test health endpoint
curl https://api.onetime.app/health

# Test authentication
curl -X POST https://api.onetime.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "name": "Test User",
    "age": 25,
    "gender": "male",
    "dateOfBirth": "1998-01-01"
  }'
```

## 🌟 Phase 3: Production Deployment

### 1. Production Infrastructure

**Recommended Architecture:**
- **Load Balancer** (AWS ALB, Cloudflare)
- **Multiple App Servers** (2+ instances)
- **MongoDB Atlas** (M10+ dedicated cluster)
- **Redis Cache** (AWS ElastiCache)
- **CDN** (Cloudflare, AWS CloudFront)
- **Monitoring** (DataDog, New Relic)

### 2. Production Environment Setup

```bash
# Production environment variables
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://prod-user:password@prod-cluster.mongodb.net/onetime-production

# Security
JWT_SECRET=production-ultra-secure-jwt-secret-key-64-characters-minimum
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000

# External Services
CLOUDINARY_CLOUD_NAME=onetime-prod
SENDGRID_API_KEY=production-sendgrid-key
TWILIO_ACCOUNT_SID=production-twilio-sid

# Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
NEW_RELIC_LICENSE_KEY=your-newrelic-key
```

### 3. Docker Deployment (Recommended)

```bash
# Build production image
docker build -t onetime-backend:latest .

# Run with docker-compose
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Or deploy to Kubernetes
kubectl apply -f k8s/
```

### 4. CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Build Docker image
        run: docker build -t onetime-backend:${{ github.sha }} .
        
      - name: Deploy to production
        run: |
          # Your deployment script
          ./scripts/deploy.sh
```

## 📱 Phase 4: iOS App Deployment

### 1. Update App Configuration

```swift
// AppConfig.swift - Production settings
static var apiBaseURL: String {
    switch currentEnvironment {
    case .development:
        return "http://localhost:3000"
    case .staging:
        return "https://api-staging.onetime.app"
    case .production:
        return "https://api.onetime.app"
    }
}
```

### 2. App Store Preparation

1. **Update Info.plist**
   - Remove development URLs
   - Add production API endpoints
   - Update app version

2. **Code Signing**
   - Production certificates
   - App Store provisioning profiles

3. **Testing**
   - TestFlight beta testing
   - Full authentication flow testing

## 🔧 Phase 5: Monitoring & Maintenance

### 1. Monitoring Setup

```bash
# Install monitoring tools
npm install --save express-prometheus-middleware
npm install --save @sentry/node

# Setup health checks
curl -f https://api.onetime.app/health || exit 1
```

### 2. Backup Strategy

```bash
# MongoDB Atlas automated backups
# Schedule: Daily backups, 7-day retention

# Application logs backup
# Rotate logs daily, keep 30 days

# Database migration scripts
npm run backup:create
```

### 3. Performance Optimization

```bash
# Enable compression
# Setup Redis caching
# Optimize database queries
# Monitor response times

# Load testing
npm install -g artillery
artillery run load-test.yml
```

## 🛡️ Security Checklist

### Backend Security
- [ ] JWT secrets are secure (64+ characters)
- [ ] HTTPS enabled with valid certificates
- [ ] Rate limiting configured
- [ ] Input validation on all endpoints
- [ ] CORS properly configured
- [ ] Security headers enabled (Helmet.js)
- [ ] Environment variables secured
- [ ] Database access restricted

### Infrastructure Security
- [ ] Firewall configured (only ports 80, 443, 22)
- [ ] SSH key authentication only
- [ ] Regular security updates
- [ ] Database network access restricted
- [ ] Secrets management system
- [ ] Log monitoring for security events

### iOS App Security
- [ ] API keys not hardcoded
- [ ] Certificate pinning (optional)
- [ ] Keychain storage for tokens
- [ ] Obfuscation (if needed)

## 📊 Success Metrics

### Technical Metrics
- **Uptime**: >99.9%
- **Response Time**: <200ms average
- **Error Rate**: <0.1%
- **Database Performance**: <50ms query time

### Business Metrics
- **User Registration**: Track conversion rates
- **Authentication Success**: >99%
- **App Store Ratings**: >4.5 stars
- **User Retention**: Track weekly/monthly active users

## 🆘 Troubleshooting

### Common Issues

1. **Database Connection Failures**
   ```bash
   # Check connection string
   # Verify IP whitelist
   # Test with mongo shell
   ```

2. **Authentication Issues**
   ```bash
   # Verify JWT secret
   # Check token expiration
   # Test with Postman
   ```

3. **Performance Issues**
   ```bash
   # Check server resources
   # Monitor database queries
   # Review logs for errors
   ```

### Support Contacts
- **Development Team**: dev@onetime.app
- **DevOps Team**: devops@onetime.app
- **Emergency**: +1-XXX-XXX-XXXX

## 📚 Additional Resources

- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [iOS App Store Guidelines](https://developer.apple.com/app-store/guidelines/)
- [Security Best Practices](https://owasp.org/www-project-top-ten/)

---

**Next Steps**: Once deployment is complete, monitor the system closely for the first 48 hours and be prepared to rollback if issues arise.