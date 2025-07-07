#!/bin/bash

echo "🚀 Starting OneTime Backend Deployment"

# Set environment variables
export NODE_ENV=production
export PORT=8080

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Verify server file exists
if [ -f "server-production-minimal.js" ]; then
    echo "✅ Server file found: server-production-minimal.js"
else
    echo "❌ Server file not found!"
    exit 1
fi

# Test the server can start
echo "🧪 Testing server startup..."
timeout 10s node server-production-minimal.js &
SERVER_PID=$!

sleep 5

if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Server started successfully"
    kill $SERVER_PID
else
    echo "❌ Server failed to start"
    exit 1
fi

echo "🎉 Deployment preparation complete!"
echo "📝 Ready for Azure deployment"

# Display important info
echo ""
echo "📋 Deployment Info:"
echo "   - Entry point: server-production-minimal.js"
echo "   - Port: 8080"
echo "   - Node version: $(node --version)"
echo "   - Environment: production"
echo "" 