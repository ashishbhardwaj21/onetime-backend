#!/usr/bin/env node

/**
 * Production Deployment Configuration Script
 * Sets up production environment and deployment configurations
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

class ProductionDeployer {
  constructor() {
    this.projectRoot = process.cwd();
    this.deploymentConfig = {};
  }

  async setupProduction() {
    console.log('🚀 Setting up production deployment configuration...\n');

    try {
      // 1. Create production environment files
      await this.createProductionEnvFiles();
      
      // 2. Generate Docker configuration
      await this.generateDockerConfiguration();
      
      // 3. Create nginx configuration
      await this.createNginxConfiguration();
      
      // 4. Generate PM2 configuration
      await this.generatePM2Configuration();
      
      // 5. Create health check scripts
      await this.createHealthCheckScripts();
      
      // 6. Generate security configurations
      await this.generateSecurityConfigurations();
      
      // 7. Create monitoring setup
      await this.createMonitoringSetup();
      
      // 8. Generate deployment scripts
      await this.generateDeploymentScripts();

      console.log('\n✅ Production deployment configuration completed!');
      this.printDeploymentInstructions();

    } catch (error) {
      console.error('\n❌ Production setup failed:', error.message);
      process.exit(1);
    }
  }

  async createProductionEnvFiles() {
    console.log('📝 Creating production environment files...');

    // Production environment template
    const prodEnvTemplate = `# OneTime Dating App - Production Environment Configuration
# DO NOT commit this file to version control - add to .gitignore

# Server Configuration
NODE_ENV=production
PORT=3000
API_BASE_URL=https://api.onetime.app

# Database Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/onetime-prod?retryWrites=true&w=majority

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-min-32-characters-long
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-min-32-characters
JWT_REFRESH_EXPIRES_IN=30d

# Cloudinary Configuration (Photo Storage)
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Email Configuration (for verification emails)
EMAIL_SERVICE=sendgrid
EMAIL_API_KEY=your-sendgrid-api-key
EMAIL_FROM=noreply@onetime.app
EMAIL_FROM_NAME=OneTime Dating App

# SMS Configuration (for phone verification)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Admin Configuration
ADMIN_EMAIL=admin@onetime.app
ADMIN_PASSWORD=SecureAdminPassword123!

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX_REQUESTS=5

# File Upload Configuration
MAX_FILE_SIZE=10485760
MAX_FILES_PER_USER=6

# Session Configuration
SESSION_SECRET=your-super-secure-session-secret-min-32-characters

# Redis Configuration (for session storage and caching)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password

# Monitoring Configuration
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info

# SSL Configuration
SSL_CERT_PATH=/etc/ssl/certs/onetime.crt
SSL_KEY_PATH=/etc/ssl/private/onetime.key

# CORS Configuration
CORS_ORIGIN=https://onetime.app,https://www.onetime.app
CORS_CREDENTIALS=true

# Feature Flags
ENABLE_EMAIL_VERIFICATION=true
ENABLE_PHONE_VERIFICATION=true
ENABLE_PHOTO_VERIFICATION=true
ENABLE_ADMIN_DASHBOARD=true
ENABLE_ANALYTICS=true
`;

    // Staging environment template
    const stagingEnvTemplate = prodEnvTemplate
      .replace('NODE_ENV=production', 'NODE_ENV=staging')
      .replace('onetime-prod', 'onetime-staging')
      .replace('https://api.onetime.app', 'https://staging-api.onetime.app')
      .replace('https://onetime.app,https://www.onetime.app', 'https://staging.onetime.app');

    // Development environment template (for reference)
    const devEnvTemplate = prodEnvTemplate
      .replace('NODE_ENV=production', 'NODE_ENV=development')
      .replace('onetime-prod', 'onetime-dev')
      .replace('https://api.onetime.app', 'http://localhost:3000')
      .replace('BCRYPT_ROUNDS=12', 'BCRYPT_ROUNDS=8')
      .replace('LOG_LEVEL=info', 'LOG_LEVEL=debug');

    // Write environment files
    fs.writeFileSync(path.join(this.projectRoot, '.env.production.template'), prodEnvTemplate);
    fs.writeFileSync(path.join(this.projectRoot, '.env.staging.template'), stagingEnvTemplate);
    fs.writeFileSync(path.join(this.projectRoot, '.env.development.template'), devEnvTemplate);

    console.log('   ✅ Environment templates created');
    console.log('   📝 .env.production.template');
    console.log('   📝 .env.staging.template');
    console.log('   📝 .env.development.template');
  }

  async generateDockerConfiguration() {
    console.log('\n🐳 Generating Docker configuration...');

    // Dockerfile
    const dockerfile = `# OneTime Dating App Production Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \\
    python3 \\
    make \\
    g++ \\
    cairo-dev \\
    jpeg-dev \\
    pango-dev \\
    musl-dev \\
    giflib-dev \\
    pixman-dev \\
    pangomm-dev \\
    libjpeg-turbo-dev \\
    freetype-dev

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD node healthcheck.js

# Start application
CMD ["npm", "start"]
`;

    // Docker Compose for production
    const dockerCompose = `version: '3.8'

services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - mongodb
      - redis
    networks:
      - onetime-network
    volumes:
      - ./logs:/app/logs
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - app
    networks:
      - onetime-network

  mongodb:
    image: mongo:6.0
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: \${MONGO_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: \${MONGO_ROOT_PASSWORD}
      MONGO_INITDB_DATABASE: onetime
    volumes:
      - mongodb_data:/data/db
      - ./mongodb/init:/docker-entrypoint-initdb.d
    networks:
      - onetime-network
    ports:
      - "27017:27017"

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass \${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - onetime-network
    ports:
      - "6379:6379"

volumes:
  mongodb_data:
  redis_data:

networks:
  onetime-network:
    driver: bridge
`;

    // Docker Compose for development
    const dockerComposeDev = `version: '3.8'

services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    env_file:
      - .env.development
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      - mongodb-dev
      - redis-dev
    networks:
      - onetime-dev-network

  mongodb-dev:
    image: mongo:6.0
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongodb_dev_data:/data/db
    networks:
      - onetime-dev-network

  redis-dev:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data
    networks:
      - onetime-dev-network

volumes:
  mongodb_dev_data:
  redis_dev_data:

networks:
  onetime-dev-network:
    driver: bridge
`;

    // Write Docker files
    fs.writeFileSync(path.join(this.projectRoot, 'Dockerfile'), dockerfile);
    fs.writeFileSync(path.join(this.projectRoot, 'docker-compose.prod.yml'), dockerCompose);
    fs.writeFileSync(path.join(this.projectRoot, 'docker-compose.dev.yml'), dockerComposeDev);

    // Create .dockerignore
    const dockerignore = `node_modules
npm-debug.log
Dockerfile
.dockerignore
.git
.gitignore
README.md
.env
.env.*
.nyc_output
coverage
.nyc_output
logs
*.log
`;

    fs.writeFileSync(path.join(this.projectRoot, '.dockerignore'), dockerignore);

    console.log('   ✅ Docker configuration generated');
    console.log('   🐳 Dockerfile');
    console.log('   🐳 docker-compose.prod.yml');
    console.log('   🐳 docker-compose.dev.yml');
    console.log('   🐳 .dockerignore');
  }

  async createNginxConfiguration() {
    console.log('\n🌐 Creating Nginx configuration...');

    // Create nginx directory
    const nginxDir = path.join(this.projectRoot, 'nginx');
    if (!fs.existsSync(nginxDir)) {
      fs.mkdirSync(nginxDir, { recursive: true });
    }

    const nginxConfig = `user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    # Performance settings
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        application/json
        application/javascript
        application/xml
        application/rss+xml
        application/atom+xml
        image/svg+xml
        text/css
        text/javascript
        text/plain
        text/xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Upstream backend
    upstream app_backend {
        server app:3000;
        keepalive 32;
    }

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name api.onetime.app;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name api.onetime.app;

        ssl_certificate /etc/nginx/ssl/onetime.crt;
        ssl_certificate_key /etc/nginx/ssl/onetime.key;

        # API routes
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://app_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }

        # Auth routes with stricter rate limiting
        location /api/auth/ {
            limit_req zone=auth burst=3 nodelay;
            
            proxy_pass http://app_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # WebSocket support for real-time messaging
        location /socket.io/ {
            proxy_pass http://app_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Health check
        location /health {
            proxy_pass http://app_backend;
            access_log off;
        }

        # Static files (if any)
        location /static/ {
            alias /var/www/static/;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # Block common attack patterns
        location ~ /\\. {
            deny all;
            access_log off;
            log_not_found off;
        }

        location ~* \\.(php|aspx|asp|jsp)$ {
            deny all;
            access_log off;
            log_not_found off;
        }
    }
}
`;

    fs.writeFileSync(path.join(nginxDir, 'nginx.conf'), nginxConfig);

    console.log('   ✅ Nginx configuration created');
    console.log('   🌐 nginx/nginx.conf');
  }

  async generatePM2Configuration() {
    console.log('\n⚙️ Generating PM2 configuration...');

    const pm2Config = {
      apps: [
        {
          name: 'onetime-api',
          script: 'server-prod-simple.js',
          instances: 'max',
          exec_mode: 'cluster',
          env: {
            NODE_ENV: 'production',
            PORT: 3000
          },
          env_production: {
            NODE_ENV: 'production',
            PORT: 3000
          },
          env_staging: {
            NODE_ENV: 'staging',
            PORT: 3000
          },
          log_file: './logs/pm2.log',
          out_file: './logs/pm2-out.log',
          error_file: './logs/pm2-error.log',
          log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
          merge_logs: true,
          max_memory_restart: '1G',
          restart_delay: 4000,
          max_restarts: 10,
          min_uptime: '10s',
          kill_timeout: 5000,
          wait_ready: true,
          listen_timeout: 8000,
          shutdown_with_message: true,
          pmx: true,
          watch: false,
          ignore_watch: ['node_modules', 'logs', 'uploads'],
          watch_options: {
            followSymlinks: false
          }
        }
      ]
    };

    fs.writeFileSync(path.join(this.projectRoot, 'ecosystem.config.js'), 
      `module.exports = ${JSON.stringify(pm2Config, null, 2)};`);

    console.log('   ✅ PM2 configuration generated');
    console.log('   ⚙️ ecosystem.config.js');
  }

  async createHealthCheckScripts() {
    console.log('\n🏥 Creating health check scripts...');

    // Health check script for Docker
    const healthCheck = `#!/usr/bin/env node

const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  method: 'GET',
  timeout: 3000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    console.log('Health check passed');
    process.exit(0);
  } else {
    console.log('Health check failed:', res.statusCode);
    process.exit(1);
  }
});

req.on('timeout', () => {
  console.log('Health check timeout');
  req.destroy();
  process.exit(1);
});

req.on('error', (err) => {
  console.log('Health check error:', err.message);
  process.exit(1);
});

req.end();
`;

    // Monitoring script
    const monitoringScript = `#!/usr/bin/env node

/**
 * Basic monitoring script for production
 */

const axios = require('axios');
const fs = require('fs');

class SystemMonitor {
  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'http://localhost:3000';
    this.alertEmail = process.env.ALERT_EMAIL || 'admin@onetime.app';
  }

  async checkHealth() {
    try {
      const response = await axios.get(\`\${this.baseURL}/health\`, { timeout: 5000 });
      
      if (response.status === 200) {
        console.log('✅ Health check passed');
        return true;
      } else {
        console.log('❌ Health check failed:', response.status);
        return false;
      }
    } catch (error) {
      console.log('❌ Health check error:', error.message);
      return false;
    }
  }

  async checkDatabase() {
    try {
      const response = await axios.get(\`\${this.baseURL}/api/users/me\`, {
        headers: { 'Authorization': 'Bearer test' },
        timeout: 5000
      });
      
      // We expect 401 for invalid token, which means DB is responding
      if (response.status === 401 || response.data.error === 'Access token is required') {
        console.log('✅ Database check passed');
        return true;
      }
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ Database check passed');
        return true;
      }
      console.log('❌ Database check failed:', error.message);
      return false;
    }
  }

  async runMonitoring() {
    console.log('🔍 Running system monitoring checks...');
    
    const healthOk = await this.checkHealth();
    const dbOk = await this.checkDatabase();
    
    const timestamp = new Date().toISOString();
    const status = {
      timestamp,
      health: healthOk,
      database: dbOk,
      overall: healthOk && dbOk
    };

    // Log status
    fs.appendFileSync('./logs/monitoring.log', JSON.stringify(status) + '\\n');

    if (!status.overall) {
      console.log('🚨 System issues detected - alerts should be sent');
      // In production, integrate with your alerting system here
    }

    return status;
  }
}

if (require.main === module) {
  const monitor = new SystemMonitor();
  monitor.runMonitoring();
}

module.exports = SystemMonitor;
`;

    fs.writeFileSync(path.join(this.projectRoot, 'healthcheck.js'), healthCheck);
    fs.writeFileSync(path.join(this.projectRoot, 'monitoring.js'), monitoringScript);

    // Make health check executable
    fs.chmodSync(path.join(this.projectRoot, 'healthcheck.js'), '755');

    console.log('   ✅ Health check scripts created');
    console.log('   🏥 healthcheck.js');
    console.log('   🔍 monitoring.js');
  }

  async generateSecurityConfigurations() {
    console.log('\n🔒 Generating security configurations...');

    // Security middleware configuration
    const securityConfig = `/**
 * Security Configuration for Production
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

// Rate limiting configurations
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message,
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limit
const apiLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests from this IP, please try again later.'
);

// Strict rate limit for auth endpoints
const authLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // limit each IP to 5 requests per windowMs
  'Too many authentication attempts, please try again later.'
);

// File upload rate limit
const uploadLimiter = createRateLimit(
  60 * 60 * 1000, // 1 hour
  10, // limit each IP to 10 uploads per hour
  'Too many file uploads, please try again later.'
);

// Security middleware setup
const setupSecurity = (app) => {
  // Helmet for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false
  }));

  // Data sanitization against NoSQL injection
  app.use(mongoSanitize());

  // Data sanitization against XSS
  app.use(xss());

  // Prevent parameter pollution
  app.use(hpp({
    whitelist: ['sort', 'limit', 'page', 'category', 'interests']
  }));

  // Apply rate limiting
  app.use('/api/', apiLimiter);
  app.use('/api/auth/', authLimiter);
  app.use('/api/users/*/photos/', uploadLimiter);

  return {
    apiLimiter,
    authLimiter,
    uploadLimiter
  };
};

module.exports = {
  setupSecurity,
  apiLimiter,
  authLimiter,
  uploadLimiter
};
`;

    // SSL/TLS configuration
    const sslConfig = `/**
 * SSL/TLS Configuration
 */

const fs = require('fs');
const https = require('https');

const createHTTPSServer = (app) => {
  if (process.env.NODE_ENV === 'production') {
    const options = {
      key: fs.readFileSync(process.env.SSL_KEY_PATH),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH),
      // Additional security options
      secureProtocol: 'TLSv1_2_method',
      ciphers: [
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA',
        'ECDHE-RSA-AES128-SHA',
        'DHE-RSA-AES256-GCM-SHA384',
        'DHE-RSA-AES128-GCM-SHA256',
        'DHE-RSA-AES256-SHA256',
        'DHE-RSA-AES128-SHA256',
        'DHE-RSA-AES256-SHA',
        'DHE-RSA-AES128-SHA',
        'AES256-GCM-SHA384',
        'AES128-GCM-SHA256',
        'AES256-SHA256',
        'AES128-SHA256',
        'AES256-SHA',
        'AES128-SHA'
      ].join(':'),
      honorCipherOrder: true
    };

    return https.createServer(options, app);
  }

  return null;
};

module.exports = { createHTTPSServer };
`;

    // Create security directory
    const securityDir = path.join(this.projectRoot, 'config');
    if (!fs.existsSync(securityDir)) {
      fs.mkdirSync(securityDir, { recursive: true });
    }

    fs.writeFileSync(path.join(securityDir, 'security.js'), securityConfig);
    fs.writeFileSync(path.join(securityDir, 'ssl.js'), sslConfig);

    console.log('   ✅ Security configurations generated');
    console.log('   🔒 config/security.js');
    console.log('   🔒 config/ssl.js');
  }

  async createMonitoringSetup() {
    console.log('\n📊 Creating monitoring setup...');

    // Create logs directory
    const logsDir = path.join(this.projectRoot, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Logging configuration
    const loggingConfig = `/**
 * Logging Configuration for Production
 */

const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => \`\${info.timestamp} \${info.level}: \${info.message}\`,
  ),
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format,
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: path.join('logs', 'error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join('logs', 'combined.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
];

// Add daily rotate file transport for production
if (process.env.NODE_ENV === 'production') {
  const DailyRotateFile = require('winston-daily-rotate-file');
  
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
});

module.exports = logger;
`;

    fs.writeFileSync(path.join(this.projectRoot, 'config', 'logger.js'), loggingConfig);

    console.log('   ✅ Monitoring setup created');
    console.log('   📊 config/logger.js');
    console.log('   📁 logs/ directory created');
  }

  async generateDeploymentScripts() {
    console.log('\n🚀 Generating deployment scripts...');

    // Create scripts directory
    const scriptsDir = path.join(this.projectRoot, 'scripts');
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }

    // Production deployment script
    const deployScript = `#!/bin/bash

# OneTime Dating App - Production Deployment Script

set -e

echo "🚀 Starting OneTime Dating App Deployment..."

# Configuration
APP_NAME="onetime-api"
DEPLOY_USER="deploy"
DEPLOY_HOST="your-server.com"
DEPLOY_PATH="/var/www/onetime"
GIT_REPO="https://github.com/yourusername/onetime-backend.git"

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "\${GREEN}[INFO]\${NC} $1"
}

log_warn() {
    echo -e "\${YELLOW}[WARN]\${NC} $1"
}

log_error() {
    echo -e "\${RED}[ERROR]\${NC} $1"
}

# Check if running as correct user
if [ "$USER" != "$DEPLOY_USER" ]; then
    log_error "This script should be run as the $DEPLOY_USER user"
    exit 1
fi

# Backup current deployment
backup_current() {
    log_info "Creating backup of current deployment..."
    if [ -d "$DEPLOY_PATH" ]; then
        sudo cp -r "$DEPLOY_PATH" "$DEPLOY_PATH.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "Backup created successfully"
    fi
}

# Pull latest code
deploy_code() {
    log_info "Deploying latest code..."
    
    if [ -d "$DEPLOY_PATH" ]; then
        cd "$DEPLOY_PATH"
        git pull origin main
    else
        git clone "$GIT_REPO" "$DEPLOY_PATH"
        cd "$DEPLOY_PATH"
    fi
    
    log_info "Code deployment completed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    cd "$DEPLOY_PATH"
    npm ci --only=production
    log_info "Dependencies installed"
}

# Run database migrations (if any)
run_migrations() {
    log_info "Running database migrations..."
    # Add your migration commands here
    # npm run migrate:prod
    log_info "Migrations completed"
}

# Build application (if needed)
build_application() {
    log_info "Building application..."
    # Add build commands if needed
    # npm run build:prod
    log_info "Build completed"
}

# Update environment configuration
update_environment() {
    log_info "Updating environment configuration..."
    
    if [ ! -f "$DEPLOY_PATH/.env.production" ]; then
        log_warn ".env.production file not found!"
        log_warn "Please create it based on .env.production.template"
        exit 1
    fi
    
    # Copy production environment
    cp "$DEPLOY_PATH/.env.production" "$DEPLOY_PATH/.env"
    log_info "Environment configuration updated"
}

# Restart application
restart_application() {
    log_info "Restarting application..."
    
    # Stop PM2 processes
    pm2 stop "$APP_NAME" || true
    pm2 delete "$APP_NAME" || true
    
    # Start with PM2
    cd "$DEPLOY_PATH"
    pm2 start ecosystem.config.js --env production
    pm2 save
    
    log_info "Application restarted"
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    sleep 10  # Wait for application to start
    
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        log_info "Health check passed ✅"
    else
        log_error "Health check failed ❌"
        log_error "Rolling back deployment..."
        rollback_deployment
        exit 1
    fi
}

# Rollback deployment
rollback_deployment() {
    log_warn "Rolling back to previous deployment..."
    
    # Stop current process
    pm2 stop "$APP_NAME" || true
    pm2 delete "$APP_NAME" || true
    
    # Restore backup
    LATEST_BACKUP=$(ls -1t "$DEPLOY_PATH".backup.* 2>/dev/null | head -n1)
    if [ -n "$LATEST_BACKUP" ]; then
        rm -rf "$DEPLOY_PATH"
        mv "$LATEST_BACKUP" "$DEPLOY_PATH"
        cd "$DEPLOY_PATH"
        pm2 start ecosystem.config.js --env production
        log_info "Rollback completed"
    else
        log_error "No backup found for rollback!"
    fi
}

# Main deployment process
main() {
    log_info "Starting deployment process..."
    
    backup_current
    deploy_code
    install_dependencies
    run_migrations
    build_application
    update_environment
    restart_application
    health_check
    
    log_info "🎉 Deployment completed successfully!"
    
    # Show application status
    pm2 status
    pm2 logs "$APP_NAME" --lines 20
}

# Run main function
main "$@"
`;

    // Quick restart script
    const restartScript = `#!/bin/bash

# Quick restart script for OneTime API

APP_NAME="onetime-api"

echo "🔄 Restarting OneTime API..."

# Restart PM2 process
pm2 restart "$APP_NAME"

# Show status
pm2 status "$APP_NAME"

# Show recent logs
pm2 logs "$APP_NAME" --lines 10

echo "✅ Restart completed"
`;

    // Setup script for new servers
    const setupScript = `#!/bin/bash

# Server setup script for OneTime Dating App

set -e

echo "🔧 Setting up OneTime Dating App server..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Docker and Docker Compose
sudo apt install -y docker.io docker-compose

# Add deploy user to docker group
sudo usermod -aG docker deploy

# Install Nginx
sudo apt install -y nginx

# Install certbot for SSL certificates
sudo apt install -y certbot python3-certbot-nginx

# Create application directory
sudo mkdir -p /var/www/onetime
sudo chown deploy:deploy /var/www/onetime

# Create logs directory
sudo mkdir -p /var/log/onetime
sudo chown deploy:deploy /var/log/onetime

# Set up PM2 startup
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u deploy --hp /home/deploy

echo "✅ Server setup completed!"
echo "Next steps:"
echo "1. Configure environment variables"
echo "2. Set up SSL certificates"
echo "3. Configure Nginx"
echo "4. Deploy application"
`;

    // Write scripts
    fs.writeFileSync(path.join(scriptsDir, 'deploy.sh'), deployScript);
    fs.writeFileSync(path.join(scriptsDir, 'restart.sh'), restartScript);
    fs.writeFileSync(path.join(scriptsDir, 'setup-server.sh'), setupScript);

    // Make scripts executable
    fs.chmodSync(path.join(scriptsDir, 'deploy.sh'), '755');
    fs.chmodSync(path.join(scriptsDir, 'restart.sh'), '755');
    fs.chmodSync(path.join(scriptsDir, 'setup-server.sh'), '755');

    console.log('   ✅ Deployment scripts generated');
    console.log('   🚀 scripts/deploy.sh');
    console.log('   🔄 scripts/restart.sh');
    console.log('   🔧 scripts/setup-server.sh');
  }

  printDeploymentInstructions() {
    console.log('\n📋 Production Deployment Instructions');
    console.log('====================================\n');

    console.log('🔧 1. Environment Setup:');
    console.log('   • Copy .env.production.template to .env.production');
    console.log('   • Fill in all required environment variables');
    console.log('   • Ensure MongoDB Atlas connection string is correct');
    console.log('   • Configure Cloudinary for photo storage');
    console.log('   • Set up email service (SendGrid) for notifications');
    console.log('   • Configure SMS service (Twilio) for phone verification\n');

    console.log('🐳 2. Docker Deployment:');
    console.log('   • Build image: docker build -t onetime-api .');
    console.log('   • Run with Docker Compose: docker-compose -f docker-compose.prod.yml up -d');
    console.log('   • Check logs: docker-compose -f docker-compose.prod.yml logs -f\n');

    console.log('🌐 3. Nginx Configuration:');
    console.log('   • Copy nginx/nginx.conf to your server');
    console.log('   • Obtain SSL certificates using certbot');
    console.log('   • Update server_name in nginx.conf');
    console.log('   • Restart Nginx: sudo systemctl restart nginx\n');

    console.log('⚙️ 4. PM2 Deployment (Alternative to Docker):');
    console.log('   • Install dependencies: npm ci --only=production');
    console.log('   • Start with PM2: pm2 start ecosystem.config.js --env production');
    console.log('   • Save PM2 config: pm2 save\n');

    console.log('🔍 5. Monitoring:');
    console.log('   • Set up log rotation for application logs');
    console.log('   • Configure monitoring alerts');
    console.log('   • Set up backup strategy for database');
    console.log('   • Implement health check monitoring\n');

    console.log('🔒 6. Security Checklist:');
    console.log('   • Ensure all environment variables are secure');
    console.log('   • Configure firewall rules');
    console.log('   • Set up SSL/TLS certificates');
    console.log('   • Enable rate limiting');
    console.log('   • Configure CORS properly');
    console.log('   • Set up security headers\n');

    console.log('🚀 7. Go Live:');
    console.log('   • Run integration tests against staging');
    console.log('   • Perform load testing');
    console.log('   • Deploy to production');
    console.log('   • Monitor application performance');
    console.log('   • Set up alerting for critical issues\n');

    console.log('📊 8. Post-Deployment:');
    console.log('   • Monitor application logs');
    console.log('   • Check database performance');
    console.log('   • Verify real-time messaging works');
    console.log('   • Test all API endpoints');
    console.log('   • Confirm admin dashboard access\n');

    console.log('🆘 9. Emergency Procedures:');
    console.log('   • Rollback: Use backup deployment or git revert');
    console.log('   • Quick restart: ./scripts/restart.sh');
    console.log('   • Check logs: pm2 logs or docker logs');
    console.log('   • Database issues: Check MongoDB Atlas status\n');

    console.log('💡 Tips:');
    console.log('   • Test deployment on staging first');
    console.log('   • Keep backups of working configurations');
    console.log('   • Document any custom configurations');
    console.log('   • Set up automated deployment pipeline for future updates');
  }
}

// Run setup if this script is executed directly
if (require.main === module) {
  const deployer = new ProductionDeployer();
  
  deployer.setupProduction()
    .then(() => {
      console.log('\n🎉 Production deployment setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Production setup failed:', error.message);
      process.exit(1);
    });
}

module.exports = ProductionDeployer;