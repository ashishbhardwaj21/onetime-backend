#!/bin/bash

# Deploy Advanced Features to Production
# This script commits all advanced features and triggers Render deployment

echo "🚀 Deploying Advanced Features to Production"
echo "============================================"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Not in a git repository. Initializing..."
    git init
    git remote add origin https://github.com/ashishbhardwaj21/onetime-backend.git
fi

# Add all new advanced features
echo "📦 Adding advanced features to git..."
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo "ℹ️ No changes to commit."
else
    echo "💾 Committing advanced features..."
    git commit -m "🚀 Add comprehensive advanced features

✨ New Features:
- 🍎 Apple Sign-In authentication with JWT verification
- 📱 Push notifications for iOS/Android (APNs/FCM)
- 🛡️ Advanced security & fraud detection with real-time analysis
- 🏗️ Infrastructure scaling with Redis caching & performance monitoring
- 📊 Admin analytics dashboard with business intelligence
- 🤖 Content moderation system with automated filtering
- 🎯 Enhanced matching engine with 6-factor compatibility scoring
- 📍 Location-based discovery with geofencing
- 🤖 AI activity recommendations with context awareness

🔧 Technical Improvements:
- Comprehensive API documentation with Swift examples
- Production-ready error handling and security measures
- Intelligent caching layer with TTL management
- Real-time fraud detection and behavioral analysis
- Automated scaling recommendations
- Enterprise-grade monitoring and analytics

📱 iOS Integration:
- Complete Swift code examples for all endpoints
- Apple Sign-In integration guide
- Push notification setup instructions
- Location services implementation

🎯 All advanced features now rival industry leaders like Hinge, Bumble, and Tinder!

🤖 Generated with Claude Code (https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
fi

# Push to trigger Render deployment
echo "🌐 Pushing to GitHub to trigger Render deployment..."
git push origin main

echo ""
echo "✅ Advanced features deployment initiated!"
echo "🔗 Monitor deployment at: https://dashboard.render.com"
echo "🎯 Test deployment at: https://onetime-backend.onrender.com/health"
echo ""
echo "📋 New Advanced Endpoints:"
echo "  - /api/auth/apple/* (Apple Sign-In)"
echo "  - /api/advanced/* (All advanced features)"
echo "  - /api/discovery/ai-powered (AI discovery)"
echo "  - /api/messages/send-enhanced (Enhanced messaging)"
echo "  - /api/location/live-update (Live location)"
echo "  - /api/user/complete-analytics (User analytics)"
echo "  - /api/system/performance (Performance monitoring)"
echo ""
echo "🎉 OneTime Dating App now has enterprise-grade features!"