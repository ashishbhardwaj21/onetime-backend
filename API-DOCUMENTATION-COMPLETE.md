# 🚀 OneTime Dating App - Complete API Documentation

## 📋 Overview

The OneTime Dating App API provides a comprehensive backend for a modern dating application with advanced features including AI-powered matching, real-time location services, content moderation, fraud detection, and Apple Sign-In integration.

**Base URL**: `https://onetime-backend.onrender.com`
**Version**: `2.0.0` (Advanced Features)
**Authentication**: Bearer Token (JWT)

---

## 🔐 Authentication

### Traditional Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "age": 25,
  "gender": "male",
  "dateOfBirth": "1998-01-01",
  "location": {
    "coordinates": [-122.4194, 37.7749],
    "city": "San Francisco",
    "state": "CA",
    "country": "US"
  }
}
```

#### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

### 🍎 Apple Sign-In (NEW)

#### Sign In with Apple
```http
POST /api/auth/apple/signin
Content-Type: application/json

{
  "identityToken": "apple_identity_token_here",
  "authorizationCode": "apple_auth_code_here",
  "user": {
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "email": "john.doe@privaterelay.appleid.com"
  }
}
```

#### Link Apple Account
```http
POST /api/auth/apple/link
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "identityToken": "apple_identity_token_here"
}
```

#### Get Apple Auth Status
```http
GET /api/auth/apple/status
Authorization: Bearer <access_token>
```

---

## 🎯 Advanced Matching & Discovery

### 🧠 AI-Powered Matching

#### Get Enhanced Matches
```http
GET /api/advanced/matching/enhanced?minAge=22&maxAge=30&gender=female&maxDistance=25&minScore=60&limit=10
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "success": true,
  "message": "Enhanced matches retrieved",
  "data": {
    "matches": [
      {
        "user": {
          "_id": "user_id",
          "profile": {
            "name": "Jane Doe",
            "age": 26,
            "photos": ["photo_url_1", "photo_url_2"],
            "bio": "Love hiking and coffee",
            "interests": ["hiking", "coffee", "photography"],
            "energyLevel": "high"
          }
        },
        "compatibility": {
          "score": 85,
          "breakdown": {
            "interests": 0.8,
            "lifestyle": 0.9,
            "values": 0.7,
            "location": 0.95,
            "activity": 0.8,
            "behavioral": 0.7
          },
          "explanation": ["You have many shared interests", "Lives nearby", "Similar lifestyle preferences"]
        },
        "distance": 2.3
      }
    ],
    "algorithm": "advanced_compatibility_v2"
  }
}
```

#### AI-Powered Discovery
```http
GET /api/discovery/ai-powered?category=outdoor&weather={"condition":"sunny"}&limit=15
Authorization: Bearer <access_token>
```

#### Compatibility Analysis
```http
GET /api/advanced/matching/compatibility/<target_user_id>
Authorization: Bearer <access_token>
```

### 🎮 Smart Swipe (Enhanced)

#### Enhanced Swipe with AI Analysis
```http
POST /api/advanced/smart-swipe
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "targetUserId": "target_user_id",
  "action": "like",
  "feedback": "Really like their travel photos!",
  "positionInStack": 3
}
```

**Response**:
```json
{
  "success": true,
  "message": "Swiped like successfully",
  "data": {
    "swipeId": "swipe_id",
    "action": "like",
    "isMatch": true,
    "match": {
      "_id": "match_id",
      "compatibilityScore": 87,
      "user": {
        "_id": "target_user_id",
        "name": "Jane Doe",
        "photos": ["photo_url"]
      }
    },
    "analytics": {
      "compatibilityScore": 87,
      "moderationPassed": true,
      "enhancedFeatures": true
    }
  }
}
```

---

## 📍 Location Services

### Real-Time Location

#### Update Live Location
```http
POST /api/location/live-update
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "accuracy": 10
  },
  "preferences": {
    "visibleRange": 5000,
    "shareWithMatches": true,
    "nearbyNotifications": true
  }
}
```

#### Find Nearby Users and Events
```http
GET /api/advanced/location/nearby
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "success": true,
  "message": "Nearby content retrieved",
  "data": {
    "users": [
      {
        "user": {
          "_id": "user_id",
          "profile": {
            "name": "Nearby User",
            "photos": ["photo_url"]
          }
        },
        "distance": 150,
        "lastSeen": "2025-06-28T10:30:00Z",
        "isOnlineNow": true,
        "estimatedTimeNearby": "Just arrived"
      }
    ],
    "events": [
      {
        "_id": "event_id",
        "title": "Coffee Meetup",
        "location": {
          "name": "Local Café",
          "address": "123 Main St"
        },
        "distance": 300,
        "participantCount": 8
      }
    ],
    "suggestions": [
      {
        "type": "meetup",
        "title": "Coffee Meetup Nearby",
        "description": "3 potential matches are nearby. Perfect time for a coffee!"
      }
    ]
  }
}
```

#### Create Geofence
```http
POST /api/advanced/location/geofence
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "center": [-122.4194, 37.7749],
  "radius": 500,
  "type": "enter",
  "duration": 86400000
}
```

---

## 🤖 AI Activity Recommendations

### Get Personalized Recommendations
```http
GET /api/advanced/ai/recommendations?category=outdoor&maxDistance=20&weather={"condition":"sunny"}&limit=10&minScore=0.5
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "success": true,
  "message": "AI recommendations generated",
  "data": {
    "recommendations": [
      {
        "activity": {
          "_id": "activity_id",
          "title": "Golden Gate Park Picnic",
          "description": "Perfect sunny day picnic spot",
          "category": "outdoor",
          "energyLevel": "medium",
          "location": {
            "name": "Golden Gate Park",
            "coordinates": [-122.4683, 37.7694]
          },
          "price": 15,
          "participants": 4,
          "maxParticipants": 8
        },
        "aiScore": 92,
        "confidence": 85,
        "reasoning": ["Perfect for current weather", "Matches your interests", "Great timing for this activity"],
        "recommendationType": "ai_personalized"
      }
    ],
    "context": {
      "timeOfDay": "afternoon",
      "weather": "sunny",
      "userPreferences": "analyzed"
    },
    "algorithm": "ai_recommendation_v2"
  }
}
```

---

## 💬 Enhanced Messaging

### Send Message with Moderation
```http
POST /api/messages/send-enhanced
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "receiverId": "receiver_user_id",
  "content": "Hey! I saw we both love hiking. Want to explore some trails together?",
  "messageType": "text"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "messageId": "message_id",
    "conversationId": "conversation_id",
    "timestamp": "2025-06-28T10:30:00Z",
    "moderation": {
      "action": "approved",
      "passed": true
    },
    "security": {
      "passed": true,
      "riskScore": 0.1
    }
  }
}
```

---

## 🔔 Push Notifications

### Register Device for Notifications
```http
POST /api/advanced/notifications/register-device
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "deviceToken": "ios_device_token_here",
  "platform": "ios"
}
```

### Update Notification Preferences
```http
PUT /api/advanced/notifications/preferences
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "matches": true,
  "messages": true,
  "activities": true,
  "suggestions": false,
  "marketing": false,
  "nearby": true,
  "reminders": true,
  "quietHours": {
    "enabled": true,
    "start": 22,
    "end": 8
  }
}
```

### Send Test Notification
```http
POST /api/advanced/notifications/test
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "templateKey": "new_match",
  "data": {
    "matchUserName": "Test User"
  }
}
```

---

## 🛡️ Security & Content Moderation

### Security Analysis
```http
GET /api/advanced/security/analysis
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "success": true,
  "message": "Security analysis completed",
  "data": {
    "riskLevel": "low",
    "riskScore": 0.15,
    "patterns": ["normal_usage"],
    "recommendations": ["Continue normal usage patterns"]
  }
}
```

### Report Content
```http
POST /api/advanced/moderation/report
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "contentId": "message_or_profile_id",
  "reason": "harassment",
  "details": {
    "specificIssue": "Inappropriate language",
    "context": "In direct message"
  }
}
```

### Analyze Content (Moderation)
```http
POST /api/advanced/moderation/analyze
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "content": "Text content to analyze",
  "contentType": "message"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Content analyzed",
  "data": {
    "action": "approved",
    "score": 0.1,
    "violations": [],
    "approved": true
  }
}
```

---

## 📊 Analytics & Insights

### User Complete Analytics
```http
GET /api/user/complete-analytics
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "success": true,
  "message": "Complete user analytics retrieved",
  "data": {
    "security": {
      "riskLevel": "low",
      "riskScore": 0.1,
      "patterns": ["normal_usage"]
    },
    "behavior": {
      "swipeStatistics": {
        "totalSwipes": 150,
        "likes": 45,
        "passes": 105,
        "matchRate": 15.6
      }
    },
    "profile": {
      "completeness": 85,
      "optimization": [
        "Add more profile photos",
        "Verify your phone number"
      ]
    },
    "engagement": {
      "level": "high",
      "suggestions": [
        "Try updating your profile photos",
        "Add more interests to improve matches"
      ]
    }
  }
}
```

### Admin Dashboard (Admin Only)
```http
GET /api/advanced/admin/dashboard
Authorization: Bearer <admin_access_token>
```

---

## 🏗️ System & Infrastructure

### System Health Check
```http
GET /api/system/health
```

**Response**:
```json
{
  "success": true,
  "message": "System status: healthy",
  "data": {
    "status": "healthy",
    "timestamp": "2025-06-28T10:30:00Z",
    "services": {
      "mongodb": {
        "status": "healthy",
        "connectionState": 1,
        "responseTime": 15
      },
      "redis": {
        "status": "healthy",
        "responseTime": 8
      }
    },
    "metrics": {
      "requestCount": 1250,
      "averageResponseTime": 120,
      "errorRate": 0.2,
      "activeConnections": 45,
      "memoryUsage": 65.2,
      "cpuUsage": 23.1
    }
  }
}
```

### Performance Monitoring
```http
GET /api/system/performance
```

### Scaling Recommendations
```http
GET /api/advanced/system/scaling
```

**Response**:
```json
{
  "success": true,
  "message": "Scaling recommendations retrieved",
  "data": {
    "immediate": [],
    "planned": [
      "Consider adding load balancer instances"
    ],
    "cost_optimization": [
      "Consider reducing resource allocation during off-peak hours"
    ]
  }
}
```

---

## 📱 iOS Integration Examples

### Swift Code Examples

#### Apple Sign-In Integration
```swift
import AuthenticationServices

class AppleSignInManager: NSObject, ASAuthorizationControllerDelegate {
    func signInWithApple() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }
    
    func authorizationController(controller: ASAuthorizationController, 
                               didCompleteWithAuthorization authorization: ASAuthorization) {
        if let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential {
            let identityToken = String(data: appleIDCredential.identityToken!, encoding: .utf8)!
            let authCode = String(data: appleIDCredential.authorizationCode!, encoding: .utf8)!
            
            // Send to your backend
            authenticateWithBackend(identityToken: identityToken, authCode: authCode)
        }
    }
    
    private func authenticateWithBackend(identityToken: String, authCode: String) {
        let url = URL(string: "https://onetime-backend.onrender.com/api/auth/apple/signin")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = [
            "identityToken": identityToken,
            "authorizationCode": authCode
        ]
        
        request.httpBody = try! JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            // Handle response
        }.resume()
    }
}
```

#### Enhanced Matching Request
```swift
func getEnhancedMatches() {
    guard let token = AuthManager.shared.accessToken else { return }
    
    let url = URL(string: "https://onetime-backend.onrender.com/api/advanced/matching/enhanced?minAge=22&maxAge=30&limit=10")!
    var request = URLRequest(url: url)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    
    URLSession.shared.dataTask(with: request) { data, response, error in
        if let data = data {
            let matches = try! JSONDecoder().decode(MatchesResponse.self, from: data)
            DispatchQueue.main.async {
                self.updateUI(with: matches.data.matches)
            }
        }
    }.resume()
}
```

#### Location Updates
```swift
import CoreLocation

class LocationManager: NSObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    
    func startLocationUpdates() {
        locationManager.delegate = self
        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingLocation()
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        
        sendLocationUpdate(latitude: location.coordinate.latitude, 
                          longitude: location.coordinate.longitude,
                          accuracy: location.horizontalAccuracy)
    }
    
    private func sendLocationUpdate(latitude: Double, longitude: Double, accuracy: Double) {
        guard let token = AuthManager.shared.accessToken else { return }
        
        let url = URL(string: "https://onetime-backend.onrender.com/api/location/live-update")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = [
            "location": [
                "latitude": latitude,
                "longitude": longitude,
                "accuracy": accuracy
            ],
            "preferences": [
                "visibleRange": 5000,
                "shareWithMatches": true,
                "nearbyNotifications": true
            ]
        ]
        
        request.httpBody = try! JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let data = data {
                let result = try! JSONDecoder().decode(LocationUpdateResponse.self, from: data)
                if result.data.nearbyCount > 0 {
                    // Show nearby users notification
                }
            }
        }.resume()
    }
}
```

---

## 🔒 Security Considerations

### Rate Limiting
- Registration: 3 attempts per hour per IP
- Login: 5 attempts per 15 minutes per IP
- Messaging: 20 messages per minute per user
- Swipes: 100 swipes per minute per user

### Data Protection
- All sensitive data encrypted at rest and in transit
- PII detection and filtering
- Apple Sign-In privacy compliance
- GDPR compliance for EU users

### Fraud Prevention
- Real-time fraud detection on all actions
- Device fingerprinting and tracking
- Suspicious behavior pattern analysis
- Automatic account suspension for high-risk activities

---

## 📈 Error Handling

### Error Response Format
```json
{
  "success": false,
  "error": "Error message description",
  "code": "ERROR_CODE",
  "details": {
    "field": "specific_field",
    "reason": "validation_failed"
  }
}
```

### Common Error Codes
- `INVALID_TOKEN`: Authentication token is invalid or expired
- `SECURITY_BLOCK`: Action blocked due to security concerns
- `RATE_LIMIT_EXCEEDED`: Too many requests from this source
- `INVALID_APPLE_TOKEN`: Apple ID token verification failed
- `CONTENT_MODERATION_FAILED`: Content blocked by moderation system
- `USER_NOT_FOUND`: Requested user does not exist

---

## 🚀 Getting Started

1. **Register your app** and get API credentials
2. **Implement authentication** (traditional or Apple Sign-In)
3. **Set up location services** for enhanced matching
4. **Integrate push notifications** for better engagement
5. **Use advanced matching** for better user experience
6. **Enable content moderation** for safe environment

### Production Checklist
- ✅ SSL/HTTPS enabled
- ✅ Rate limiting configured
- ✅ Content moderation active
- ✅ Fraud detection enabled
- ✅ Push notifications set up
- ✅ Apple Sign-In configured
- ✅ Location services implemented
- ✅ Analytics and monitoring active

---

**🎉 Your OneTime Dating App is now equipped with enterprise-grade features!**

For technical support or questions, contact: support@onetimedating.me