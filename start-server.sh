#!/bin/bash

# OneTime Dating App - Server Startup Script

echo "🚀 Starting OneTime Dating App Backend Server..."
echo "=============================================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📊 Server Information:${NC}"
echo "• Environment: $(grep NODE_ENV .env | cut -d'=' -f2)"
echo "• Port: $(grep PORT .env | cut -d'=' -f2)"
echo "• Database: MongoDB Atlas"

echo ""
echo -e "${GREEN}🌐 Server will be available at:${NC}"
echo "• Health Check: http://localhost:3000/health"
echo "• API Documentation: http://localhost:3000/api/docs"
echo "• WebSocket: ws://localhost:3000"

echo ""
echo -e "${BLUE}📝 Logs will appear below...${NC}"
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm run dev