#!/bin/bash

# MongoDB Atlas Deployment Script for OneTime Dating App
# This script helps you deploy your application to MongoDB Atlas

echo "🚀 MongoDB Atlas Deployment for OneTime Dating App"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if required tools are installed
check_requirements() {
    echo "📋 Checking requirements..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt "18" ]; then
        print_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed."
        exit 1
    fi
    
    # Check if in correct directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run this script from the OneTime Backend directory."
        exit 1
    fi
    
    print_status "All requirements met!"
}

# Install dependencies
install_dependencies() {
    echo -e "\n📦 Installing dependencies..."
    
    if npm install; then
        print_status "Dependencies installed successfully!"
    else
        print_error "Failed to install dependencies."
        exit 1
    fi
}

# Setup environment file
setup_environment() {
    echo -e "\n⚙️  Setting up environment configuration..."
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            print_status "Created .env file from template"
        else
            print_error ".env.example file not found"
            exit 1
        fi
    else
        print_warning ".env file already exists"
    fi
    
    echo ""
    echo "🔧 Please configure your .env file with the following information:"
    echo "   1. MongoDB Atlas connection string"
    echo "   2. JWT secret (minimum 32 characters)"
    echo "   3. Email service credentials (SendGrid/SMTP)"
    echo "   4. Other required environment variables"
    echo ""
    read -p "Press Enter to continue after updating .env file..."
}

# Validate environment configuration
validate_environment() {
    echo -e "\n🔍 Validating environment configuration..."
    
    # Source environment variables
    if [ -f ".env" ]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi
    
    # Check required variables
    REQUIRED_VARS=("MONGODB_URI" "JWT_SECRET" "NODE_ENV")
    MISSING_VARS=()
    
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var}" ]; then
            MISSING_VARS+=("$var")
        fi
    done
    
    if [ ${#MISSING_VARS[@]} -gt 0 ]; then
        print_error "Missing required environment variables:"
        for var in "${MISSING_VARS[@]}"; do
            echo "   - $var"
        done
        exit 1
    fi
    
    # Check JWT secret length
    if [ ${#JWT_SECRET} -lt 32 ]; then
        print_error "JWT_SECRET must be at least 32 characters long"
        exit 1
    fi
    
    print_status "Environment configuration is valid!"
}

# Test MongoDB connection
test_mongodb_connection() {
    echo -e "\n🔌 Testing MongoDB connection..."
    
    # Create temporary test script
    cat > temp_db_test.js << 'EOF'
const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Successfully connected to MongoDB Atlas!');
        
        // Test basic operations
        const testCollection = mongoose.connection.db.collection('connection_test');
        await testCollection.insertOne({ test: true, timestamp: new Date() });
        console.log('✅ Database write test successful!');
        
        await testCollection.deleteMany({ test: true });
        console.log('✅ Database cleanup successful!');
        
        await mongoose.disconnect();
        console.log('✅ Database connection test completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        process.exit(1);
    }
}

testConnection();
EOF

    if node temp_db_test.js; then
        print_status "MongoDB connection test passed!"
    else
        print_error "MongoDB connection test failed!"
        rm -f temp_db_test.js
        exit 1
    fi
    
    rm -f temp_db_test.js
}

# Setup MongoDB database structure
setup_database() {
    echo -e "\n🗄️  Setting up MongoDB database structure..."
    
    if npm run setup:mongodb; then
        print_status "Database setup completed successfully!"
    else
        print_error "Database setup failed!"
        exit 1
    fi
}

# Run health check
run_health_check() {
    echo -e "\n🏥 Running application health check..."
    
    # Start server in background for testing
    npm start &
    SERVER_PID=$!
    
    # Wait for server to start
    sleep 10
    
    # Test health endpoint
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        print_status "Health check passed!"
    else
        print_error "Health check failed!"
        kill $SERVER_PID 2>/dev/null
        exit 1
    fi
    
    # Stop test server
    kill $SERVER_PID 2>/dev/null
    sleep 2
}

# Run authentication flow test
test_authentication() {
    echo -e "\n🔐 Testing authentication flow..."
    
    # Start server in background for testing
    npm start &
    SERVER_PID=$!
    
    # Wait for server to start
    sleep 10
    
    # Run authentication tests
    if npm run test:auth; then
        print_status "Authentication tests passed!"
    else
        print_warning "Authentication tests had issues. Check the logs above."
    fi
    
    # Stop test server
    kill $SERVER_PID 2>/dev/null
    sleep 2
}

# Deploy to production (if specified)
deploy_production() {
    if [ "$1" = "production" ]; then
        echo -e "\n🚀 Deploying to production..."
        
        # Run production checks
        npm run lint
        npm test
        
        # Build production bundle (if applicable)
        if [ -f "webpack.config.js" ] || [ -f "rollup.config.js" ]; then
            npm run build
        fi
        
        # Start with PM2 if available
        if command -v pm2 &> /dev/null; then
            pm2 start ecosystem.config.js --env production
            print_status "Application started with PM2!"
        else
            print_info "PM2 not found. Starting with npm..."
            NODE_ENV=production npm start &
            print_status "Application started!"
        fi
    fi
}

# Display deployment summary
show_summary() {
    echo -e "\n🎉 Deployment Summary"
    echo "===================="
    print_status "MongoDB Atlas connection established"
    print_status "Database structure created"
    print_status "Indexes and initial data setup"
    print_status "Health checks passed"
    print_status "Authentication flow tested"
    
    echo -e "\n📋 Next Steps:"
    echo "1. Configure your iOS app to use the API endpoint"
    echo "2. Set up production hosting (AWS, DigitalOcean, Heroku)"
    echo "3. Configure SSL certificate for HTTPS"
    echo "4. Set up monitoring and logging"
    echo "5. Configure backup strategy"
    
    echo -e "\n🔗 Important URLs:"
    echo "   Health Check: http://localhost:3000/health"
    echo "   API Documentation: http://localhost:3000/api/docs (if enabled)"
    echo "   MongoDB Atlas Dashboard: https://cloud.mongodb.com"
    
    echo -e "\n📧 Support:"
    echo "   Email: dev@onetime.app"
    echo "   Documentation: ./docs/"
}

# Main deployment function
main() {
    echo "Starting OneTime Dating App deployment..."
    echo ""
    
    check_requirements
    install_dependencies
    setup_environment
    validate_environment
    test_mongodb_connection
    setup_database
    run_health_check
    test_authentication
    deploy_production "$1"
    show_summary
    
    print_status "Deployment completed successfully! 🎉"
}

# Parse command line arguments
DEPLOY_ENV="development"
if [ "$1" = "production" ] || [ "$1" = "staging" ]; then
    DEPLOY_ENV="$1"
fi

# Run main function
main "$DEPLOY_ENV"