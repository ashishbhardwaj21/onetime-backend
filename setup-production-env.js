#!/usr/bin/env node

/**
 * Production Environment Setup Script
 * Interactive setup for production environment variables
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

class ProductionEnvironmentSetup {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.envConfig = {};
  }

  async setupProductionEnvironment() {
    console.log('🚀 OneTime Dating App - Production Environment Setup');
    console.log('===================================================\n');

    try {
      // 1. Generate secure secrets
      await this.generateSecureSecrets();
      
      // 2. Configure MongoDB Atlas
      await this.configureMongoDB();
      
      // 3. Configure Cloudinary
      await this.configureCloudinary();
      
      // 4. Configure Email Service
      await this.configureEmailService();
      
      // 5. Configure SMS Service
      await this.configureSMSService();
      
      // 6. Configure Admin Account
      await this.configureAdminAccount();
      
      // 7. Configure Security Settings
      await this.configureSecuritySettings();
      
      // 8. Configure Performance Settings
      await this.configurePerformanceSettings();
      
      // 9. Generate environment files
      await this.generateEnvironmentFiles();
      
      // 10. Validate configuration
      await this.validateConfiguration();

      console.log('\n✅ Production environment setup completed successfully!');
      this.printNextSteps();

    } catch (error) {
      console.error('\n❌ Production environment setup failed:', error.message);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async generateSecureSecrets() {
    console.log('🔒 Generating secure secrets...\n');

    // Generate JWT secrets
    this.envConfig.JWT_SECRET = crypto.randomBytes(64).toString('hex');
    this.envConfig.JWT_REFRESH_SECRET = crypto.randomBytes(64).toString('hex');
    this.envConfig.SESSION_SECRET = crypto.randomBytes(64).toString('hex');

    console.log('✅ Generated JWT_SECRET (128 chars)');
    console.log('✅ Generated JWT_REFRESH_SECRET (128 chars)');
    console.log('✅ Generated SESSION_SECRET (128 chars)');
    
    // Set other security defaults
    this.envConfig.JWT_EXPIRES_IN = '7d';
    this.envConfig.JWT_REFRESH_EXPIRES_IN = '30d';
    this.envConfig.BCRYPT_ROUNDS = '12';
    
    console.log('✅ Security defaults configured\n');
  }

  async configureMongoDB() {
    console.log('🗄️ MongoDB Atlas Configuration\n');
    
    console.log('Please visit MongoDB Atlas (https://cloud.mongodb.com) and:');
    console.log('1. Create a new cluster or use existing one');
    console.log('2. Create a database user with read/write permissions');
    console.log('3. Add your server IP to the IP whitelist');
    console.log('4. Get the connection string\n');

    this.envConfig.MONGODB_URI = await this.prompt('Enter MongoDB Atlas connection string: ');
    
    // Validate MongoDB URI
    if (!this.envConfig.MONGODB_URI.includes('mongodb+srv://')) {
      console.log('⚠️  Warning: Using non-Atlas MongoDB URI. Ensure it\'s secure for production.');
    }
    
    // Ensure proper query parameters for production
    if (!this.envConfig.MONGODB_URI.includes('retryWrites=true')) {
      this.envConfig.MONGODB_URI += this.envConfig.MONGODB_URI.includes('?') ? '&retryWrites=true' : '?retryWrites=true';
    }
    
    if (!this.envConfig.MONGODB_URI.includes('w=majority')) {
      this.envConfig.MONGODB_URI += '&w=majority';
    }

    console.log('✅ MongoDB Atlas configuration completed\n');
  }

  async configureCloudinary() {
    console.log('☁️ Cloudinary Configuration\n');
    
    console.log('Please visit Cloudinary (https://cloudinary.com) and:');
    console.log('1. Create a free account or log into existing one');
    console.log('2. Go to Dashboard to get your credentials');
    console.log('3. Copy Cloud name, API Key, and API Secret\n');

    this.envConfig.CLOUDINARY_CLOUD_NAME = await this.prompt('Enter Cloudinary Cloud Name: ');
    this.envConfig.CLOUDINARY_API_KEY = await this.prompt('Enter Cloudinary API Key: ');
    this.envConfig.CLOUDINARY_API_SECRET = await this.prompt('Enter Cloudinary API Secret: ');

    console.log('✅ Cloudinary configuration completed\n');
  }

  async configureEmailService() {
    console.log('📧 Email Service Configuration\n');
    
    console.log('Choose your email service provider:');
    console.log('1. SendGrid (Recommended)');
    console.log('2. AWS SES');
    console.log('3. Mailgun');
    console.log('4. Custom SMTP\n');

    const emailChoice = await this.prompt('Enter choice (1-4): ');
    
    switch(emailChoice) {
      case '1':
        await this.configureSendGrid();
        break;
      case '2':
        await this.configureAWSSES();
        break;
      case '3':
        await this.configureMailgun();
        break;
      case '4':
        await this.configureCustomSMTP();
        break;
      default:
        console.log('Using SendGrid as default...');
        await this.configureSendGrid();
    }

    this.envConfig.EMAIL_FROM = await this.prompt('Enter FROM email address (e.g., noreply@onetime.app): ');
    this.envConfig.EMAIL_FROM_NAME = 'OneTime Dating App';

    console.log('✅ Email service configuration completed\n');
  }

  async configureSendGrid() {
    console.log('Setting up SendGrid...');
    console.log('1. Sign up at https://sendgrid.com');
    console.log('2. Verify your sender identity');
    console.log('3. Create an API key with Mail Send permissions\n');

    this.envConfig.EMAIL_SERVICE = 'sendgrid';
    this.envConfig.EMAIL_API_KEY = await this.prompt('Enter SendGrid API Key: ');
  }

  async configureAWSSES() {
    console.log('Setting up AWS SES...');
    this.envConfig.EMAIL_SERVICE = 'aws-ses';
    this.envConfig.AWS_ACCESS_KEY_ID = await this.prompt('Enter AWS Access Key ID: ');
    this.envConfig.AWS_SECRET_ACCESS_KEY = await this.prompt('Enter AWS Secret Access Key: ');
    this.envConfig.AWS_REGION = await this.prompt('Enter AWS Region (e.g., us-east-1): ');
  }

  async configureMailgun() {
    console.log('Setting up Mailgun...');
    this.envConfig.EMAIL_SERVICE = 'mailgun';
    this.envConfig.MAILGUN_API_KEY = await this.prompt('Enter Mailgun API Key: ');
    this.envConfig.MAILGUN_DOMAIN = await this.prompt('Enter Mailgun Domain: ');
  }

  async configureCustomSMTP() {
    console.log('Setting up Custom SMTP...');
    this.envConfig.EMAIL_SERVICE = 'smtp';
    this.envConfig.SMTP_HOST = await this.prompt('Enter SMTP Host: ');
    this.envConfig.SMTP_PORT = await this.prompt('Enter SMTP Port (587): ') || '587';
    this.envConfig.SMTP_USER = await this.prompt('Enter SMTP Username: ');
    this.envConfig.SMTP_PASS = await this.prompt('Enter SMTP Password: ');
  }

  async configureSMSService() {
    console.log('📱 SMS Service Configuration (Twilio)\n');
    
    console.log('Please visit Twilio (https://twilio.com) and:');
    console.log('1. Create a free account or log into existing one');
    console.log('2. Get your Account SID and Auth Token');
    console.log('3. Purchase a phone number for sending SMS\n');

    const useTwilio = await this.prompt('Do you want to configure Twilio for SMS? (y/n): ');
    
    if (useTwilio.toLowerCase() === 'y') {
      this.envConfig.TWILIO_ACCOUNT_SID = await this.prompt('Enter Twilio Account SID: ');
      this.envConfig.TWILIO_AUTH_TOKEN = await this.prompt('Enter Twilio Auth Token: ');
      this.envConfig.TWILIO_PHONE_NUMBER = await this.prompt('Enter Twilio Phone Number (with +): ');
      console.log('✅ Twilio SMS configuration completed');
    } else {
      console.log('⚠️  SMS verification will be disabled');
      this.envConfig.ENABLE_PHONE_VERIFICATION = 'false';
    }
    console.log('');
  }

  async configureAdminAccount() {
    console.log('👤 Admin Account Configuration\n');
    
    this.envConfig.ADMIN_EMAIL = await this.prompt('Enter admin email address: ');
    
    let adminPassword;
    while (true) {
      adminPassword = await this.prompt('Enter admin password (min 12 chars, include numbers, symbols): ');
      if (this.validatePassword(adminPassword)) {
        break;
      }
      console.log('❌ Password does not meet security requirements. Please try again.');
    }
    
    this.envConfig.ADMIN_PASSWORD = adminPassword;
    console.log('✅ Admin account configuration completed\n');
  }

  async configureSecuritySettings() {
    console.log('🔒 Security Settings Configuration\n');
    
    // Rate limiting settings
    this.envConfig.RATE_LIMIT_WINDOW_MS = '900000'; // 15 minutes
    this.envConfig.RATE_LIMIT_MAX_REQUESTS = '100';
    this.envConfig.RATE_LIMIT_AUTH_MAX_REQUESTS = '5';
    
    // File upload settings
    this.envConfig.MAX_FILE_SIZE = '10485760'; // 10MB
    this.envConfig.MAX_FILES_PER_USER = '6';
    
    // Feature flags
    this.envConfig.ENABLE_EMAIL_VERIFICATION = 'true';
    this.envConfig.ENABLE_PHOTO_VERIFICATION = 'true';
    this.envConfig.ENABLE_ADMIN_DASHBOARD = 'true';
    this.envConfig.ENABLE_ANALYTICS = 'true';
    
    // SSL settings (for production)
    const domain = await this.prompt('Enter your domain name (e.g., api.onetime.app): ');
    this.envConfig.API_BASE_URL = `https://${domain}`;
    this.envConfig.SSL_CERT_PATH = '/etc/ssl/certs/onetime.crt';
    this.envConfig.SSL_KEY_PATH = '/etc/ssl/private/onetime.key';
    
    // CORS settings
    const frontendDomain = await this.prompt('Enter your frontend domain (e.g., onetime.app): ');
    this.envConfig.CORS_ORIGIN = `https://${frontendDomain},https://www.${frontendDomain}`;
    this.envConfig.CORS_CREDENTIALS = 'true';

    console.log('✅ Security settings configuration completed\n');
  }

  async configurePerformanceSettings() {
    console.log('⚡ Performance Settings Configuration\n');
    
    // Server settings
    this.envConfig.NODE_ENV = 'production';
    this.envConfig.PORT = '3000';
    this.envConfig.LOG_LEVEL = 'info';
    
    // Redis settings (optional)
    const useRedis = await this.prompt('Do you want to configure Redis for caching? (y/n): ');
    if (useRedis.toLowerCase() === 'y') {
      this.envConfig.REDIS_URL = await this.prompt('Enter Redis URL (e.g., redis://localhost:6379): ');
      this.envConfig.REDIS_PASSWORD = await this.prompt('Enter Redis password (optional): ') || '';
    }
    
    // Monitoring settings (optional)
    const useSentry = await this.prompt('Do you want to configure Sentry for error tracking? (y/n): ');
    if (useSentry.toLowerCase() === 'y') {
      this.envConfig.SENTRY_DSN = await this.prompt('Enter Sentry DSN: ');
    }

    console.log('✅ Performance settings configuration completed\n');
  }

  async generateEnvironmentFiles() {
    console.log('📝 Generating environment files...\n');

    // Production environment file
    const prodEnvContent = this.generateEnvFileContent('production');
    fs.writeFileSync('.env.production', prodEnvContent);
    console.log('✅ Generated .env.production');

    // Staging environment file (copy of production with modifications)
    const stagingEnvContent = prodEnvContent
      .replace('NODE_ENV=production', 'NODE_ENV=staging')
      .replace(/onetime-prod/g, 'onetime-staging')
      .replace(/api\.onetime\.app/g, 'staging-api.onetime.app')
      .replace(/onetime\.app/g, 'staging.onetime.app');
    
    fs.writeFileSync('.env.staging', stagingEnvContent);
    console.log('✅ Generated .env.staging');

    // Update .gitignore to ensure env files are ignored
    this.updateGitignore();
    console.log('✅ Updated .gitignore');

    // Set secure file permissions
    try {
      fs.chmodSync('.env.production', 0o600);
      fs.chmodSync('.env.staging', 0o600);
      console.log('✅ Set secure file permissions');
    } catch (error) {
      console.log('⚠️  Could not set file permissions (Windows?)');
    }

    console.log('');
  }

  generateEnvFileContent(environment) {
    return `# OneTime Dating App - ${environment.charAt(0).toUpperCase() + environment.slice(1)} Environment
# Generated on ${new Date().toISOString()}
# DO NOT commit this file to version control

# Server Configuration
NODE_ENV=${this.envConfig.NODE_ENV || environment}
PORT=${this.envConfig.PORT || '3000'}
API_BASE_URL=${this.envConfig.API_BASE_URL || 'https://api.onetime.app'}

# Database Configuration
MONGODB_URI=${this.envConfig.MONGODB_URI}

# JWT Configuration
JWT_SECRET=${this.envConfig.JWT_SECRET}
JWT_EXPIRES_IN=${this.envConfig.JWT_EXPIRES_IN}
JWT_REFRESH_SECRET=${this.envConfig.JWT_REFRESH_SECRET}
JWT_REFRESH_EXPIRES_IN=${this.envConfig.JWT_REFRESH_EXPIRES_IN}

# Cloudinary Configuration (Photo Storage)
CLOUDINARY_CLOUD_NAME=${this.envConfig.CLOUDINARY_CLOUD_NAME}
CLOUDINARY_API_KEY=${this.envConfig.CLOUDINARY_API_KEY}
CLOUDINARY_API_SECRET=${this.envConfig.CLOUDINARY_API_SECRET}

# Email Configuration
EMAIL_SERVICE=${this.envConfig.EMAIL_SERVICE || 'sendgrid'}
${this.envConfig.EMAIL_API_KEY ? `EMAIL_API_KEY=${this.envConfig.EMAIL_API_KEY}` : ''}
${this.envConfig.AWS_ACCESS_KEY_ID ? `AWS_ACCESS_KEY_ID=${this.envConfig.AWS_ACCESS_KEY_ID}` : ''}
${this.envConfig.AWS_SECRET_ACCESS_KEY ? `AWS_SECRET_ACCESS_KEY=${this.envConfig.AWS_SECRET_ACCESS_KEY}` : ''}
${this.envConfig.AWS_REGION ? `AWS_REGION=${this.envConfig.AWS_REGION}` : ''}
${this.envConfig.MAILGUN_API_KEY ? `MAILGUN_API_KEY=${this.envConfig.MAILGUN_API_KEY}` : ''}
${this.envConfig.MAILGUN_DOMAIN ? `MAILGUN_DOMAIN=${this.envConfig.MAILGUN_DOMAIN}` : ''}
${this.envConfig.SMTP_HOST ? `SMTP_HOST=${this.envConfig.SMTP_HOST}` : ''}
${this.envConfig.SMTP_PORT ? `SMTP_PORT=${this.envConfig.SMTP_PORT}` : ''}
${this.envConfig.SMTP_USER ? `SMTP_USER=${this.envConfig.SMTP_USER}` : ''}
${this.envConfig.SMTP_PASS ? `SMTP_PASS=${this.envConfig.SMTP_PASS}` : ''}
EMAIL_FROM=${this.envConfig.EMAIL_FROM}
EMAIL_FROM_NAME=${this.envConfig.EMAIL_FROM_NAME}

# SMS Configuration (Twilio)
${this.envConfig.TWILIO_ACCOUNT_SID ? `TWILIO_ACCOUNT_SID=${this.envConfig.TWILIO_ACCOUNT_SID}` : ''}
${this.envConfig.TWILIO_AUTH_TOKEN ? `TWILIO_AUTH_TOKEN=${this.envConfig.TWILIO_AUTH_TOKEN}` : ''}
${this.envConfig.TWILIO_PHONE_NUMBER ? `TWILIO_PHONE_NUMBER=${this.envConfig.TWILIO_PHONE_NUMBER}` : ''}

# Admin Configuration
ADMIN_EMAIL=${this.envConfig.ADMIN_EMAIL}
ADMIN_PASSWORD=${this.envConfig.ADMIN_PASSWORD}

# Security Configuration
BCRYPT_ROUNDS=${this.envConfig.BCRYPT_ROUNDS}
RATE_LIMIT_WINDOW_MS=${this.envConfig.RATE_LIMIT_WINDOW_MS}
RATE_LIMIT_MAX_REQUESTS=${this.envConfig.RATE_LIMIT_MAX_REQUESTS}
RATE_LIMIT_AUTH_MAX_REQUESTS=${this.envConfig.RATE_LIMIT_AUTH_MAX_REQUESTS}

# File Upload Configuration
MAX_FILE_SIZE=${this.envConfig.MAX_FILE_SIZE}
MAX_FILES_PER_USER=${this.envConfig.MAX_FILES_PER_USER}

# Session Configuration
SESSION_SECRET=${this.envConfig.SESSION_SECRET}

# Redis Configuration (Optional)
${this.envConfig.REDIS_URL ? `REDIS_URL=${this.envConfig.REDIS_URL}` : ''}
${this.envConfig.REDIS_PASSWORD ? `REDIS_PASSWORD=${this.envConfig.REDIS_PASSWORD}` : ''}

# Monitoring Configuration (Optional)
${this.envConfig.SENTRY_DSN ? `SENTRY_DSN=${this.envConfig.SENTRY_DSN}` : ''}
LOG_LEVEL=${this.envConfig.LOG_LEVEL}

# SSL Configuration
${this.envConfig.SSL_CERT_PATH ? `SSL_CERT_PATH=${this.envConfig.SSL_CERT_PATH}` : ''}
${this.envConfig.SSL_KEY_PATH ? `SSL_KEY_PATH=${this.envConfig.SSL_KEY_PATH}` : ''}

# CORS Configuration
CORS_ORIGIN=${this.envConfig.CORS_ORIGIN}
CORS_CREDENTIALS=${this.envConfig.CORS_CREDENTIALS}

# Feature Flags
ENABLE_EMAIL_VERIFICATION=${this.envConfig.ENABLE_EMAIL_VERIFICATION}
ENABLE_PHONE_VERIFICATION=${this.envConfig.ENABLE_PHONE_VERIFICATION || 'true'}
ENABLE_PHOTO_VERIFICATION=${this.envConfig.ENABLE_PHOTO_VERIFICATION}
ENABLE_ADMIN_DASHBOARD=${this.envConfig.ENABLE_ADMIN_DASHBOARD}
ENABLE_ANALYTICS=${this.envConfig.ENABLE_ANALYTICS}
`;
  }

  updateGitignore() {
    const gitignorePath = '.gitignore';
    let gitignoreContent = '';
    
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    }
    
    const envEntries = [
      '.env',
      '.env.local',
      '.env.development',
      '.env.staging',
      '.env.production',
      '.env.*.local'
    ];
    
    let updated = false;
    envEntries.forEach(entry => {
      if (!gitignoreContent.includes(entry)) {
        gitignoreContent += `\n${entry}`;
        updated = true;
      }
    });
    
    if (updated) {
      fs.writeFileSync(gitignorePath, gitignoreContent);
    }
  }

  async validateConfiguration() {
    console.log('🔍 Validating configuration...\n');
    
    const validations = [
      { name: 'MongoDB URI', value: this.envConfig.MONGODB_URI, required: true },
      { name: 'JWT Secret', value: this.envConfig.JWT_SECRET, required: true, minLength: 32 },
      { name: 'Cloudinary Cloud Name', value: this.envConfig.CLOUDINARY_CLOUD_NAME, required: true },
      { name: 'Admin Email', value: this.envConfig.ADMIN_EMAIL, required: true },
      { name: 'Admin Password', value: this.envConfig.ADMIN_PASSWORD, required: true, minLength: 12 }
    ];
    
    let allValid = true;
    
    validations.forEach(validation => {
      if (validation.required && !validation.value) {
        console.log(`❌ ${validation.name} is required but missing`);
        allValid = false;
      } else if (validation.minLength && validation.value && validation.value.length < validation.minLength) {
        console.log(`❌ ${validation.name} is too short (minimum ${validation.minLength} characters)`);
        allValid = false;
      } else if (validation.value) {
        console.log(`✅ ${validation.name} is valid`);
      }
    });
    
    if (allValid) {
      console.log('\n✅ All configurations are valid!');
    } else {
      console.log('\n❌ Some configurations are invalid. Please review and fix.');
      throw new Error('Configuration validation failed');
    }
  }

  validatePassword(password) {
    return password.length >= 12 && 
           /\d/.test(password) && 
           /[!@#$%^&*(),.?":{}|<>]/.test(password);
  }

  async prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  printNextSteps() {
    console.log('\n🎯 Next Steps for Production Deployment:');
    console.log('========================================\n');
    
    console.log('1. 📋 Environment Files Created:');
    console.log('   • .env.production - Use for production deployment');
    console.log('   • .env.staging - Use for staging environment');
    console.log('   • Both files have secure permissions (600)\n');
    
    console.log('2. 🔐 Security Reminders:');
    console.log('   • Never commit .env files to version control');
    console.log('   • Keep your secrets secure and rotate them regularly');
    console.log('   • Use different passwords for staging and production\n');
    
    console.log('3. 🚀 Deployment Options:');
    console.log('   • Docker: docker-compose -f docker-compose.prod.yml up -d');
    console.log('   • PM2: pm2 start ecosystem.config.js --env production');
    console.log('   • Manual: NODE_ENV=production npm start\n');
    
    console.log('4. 🔍 Testing:');
    console.log('   • Test in staging first: NODE_ENV=staging npm start');
    console.log('   • Run integration tests: node test-integration.js');
    console.log('   • Run security audit: node security-audit.js\n');
    
    console.log('5. 📊 Monitoring:');
    console.log('   • Set up log monitoring for the logs/ directory');
    console.log('   • Configure alerts for error rates and performance');
    console.log('   • Monitor database performance and connections\n');
    
    console.log('6. 🔒 SSL Certificate Setup:');
    console.log('   • Use Let\'s Encrypt: certbot --nginx -d your-domain.com');
    console.log('   • Or use your existing SSL certificates');
    console.log('   • Ensure certificate auto-renewal is configured\n');
    
    console.log('💡 Pro Tips:');
    console.log('   • Test everything in staging before production');
    console.log('   • Keep backups of your environment files');
    console.log('   • Monitor your MongoDB Atlas usage and performance');
    console.log('   • Set up CloudFlare or similar CDN for additional security');
  }
}

// Run setup if this script is executed directly
if (require.main === module) {
  const setup = new ProductionEnvironmentSetup();
  setup.setupProductionEnvironment();
}

module.exports = ProductionEnvironmentSetup;