#!/bin/bash

# OneTime Dating App - Complete Setup Script
# Run this script to set up your MongoDB backend

echo "🚀 Setting up OneTime Dating App Backend..."
echo "======================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Step 1: Install dependencies
echo ""
print_info "Step 1: Installing Node.js dependencies..."
if npm install; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Step 2: Test MongoDB connection
echo ""
print_info "Step 2: Testing MongoDB Atlas connection..."
if node test-connection.js; then
    print_success "MongoDB connection test passed"
else
    print_error "MongoDB connection test failed"
    echo "Please check your .env file and MongoDB Atlas configuration"
    exit 1
fi

# Step 3: Setup database structure
echo ""
print_info "Step 3: Setting up MongoDB database structure..."
if node scripts/setupMongoDB.js; then
    print_success "Database structure created successfully"
else
    print_error "Database setup failed"
    exit 1
fi

# Step 4: Run quick health check
echo ""
print_info "Step 4: Running system health check..."
if node quick-check.js; then
    print_success "Health check passed"
else
    print_error "Health check failed"
fi

echo ""
echo "🎉 Setup Complete!"
echo "=================="
print_success "Your OneTime Dating App backend is ready!"

echo ""
echo "📋 Next Steps:"
echo "1. Start the server: npm run dev"
echo "2. Test authentication: node scripts/testAuthFlow.js"
echo "3. Open http://localhost:3000/health in your browser"

echo ""
echo "🔗 Important URLs:"
echo "• Health Check: http://localhost:3000/health"
echo "• API Base: http://localhost:3000/api"
echo "• MongoDB Atlas: https://cloud.mongodb.com"

echo ""
echo "📞 Need help? Check the documentation in docs/ folder"