#!/bin/bash

echo "🧪 Testing Simple Server Setup..."

# Start simple server in background
echo "🚀 Starting simple server..."
node server-simple.js &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Test health endpoint
echo "🏥 Testing health endpoint..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Health check passed!"
    curl http://localhost:3000/health
else
    echo "❌ Health check failed!"
fi

# Stop server
kill $SERVER_PID 2>/dev/null
echo ""
echo "🏁 Simple server test complete!"