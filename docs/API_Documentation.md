# OneTime Dating App - API Documentation

## Overview

The OneTime Dating App API provides comprehensive backend services for a modern dating application with real-time messaging, activity suggestions, and advanced matching algorithms.

**Base URL:** `https://api.onetime.app/` (Production) | `http://localhost:3000/` (Development)

**Version:** 1.0.0

## Authentication

All API endpoints require authentication using JWT Bearer tokens, except for registration and login endpoints.

### Headers
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

## Rate Limiting

- **General API:** 100 requests per 15 minutes per IP
- **Authentication endpoints:** 5 requests per 15 minutes per IP
- **File uploads:** 10 requests per hour per user

## Response Format

All API responses follow this standard format:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data here
  }
}
```

### Error Response Format

```json
{
  "success": false,
  "error": "Error message description",
  "code": "ERROR_CODE" // Optional error code
}
```

## Authentication Endpoints

### Register User
**POST** `/api/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "age": 28,
  "gender": "male",
  "dateOfBirth": "1995-01-01",
  "location": {
    "coordinates": [-122.4194, 37.7749],
    "city": "San Francisco",
    "state": "CA",
    "country": "US"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "userId": "user_id_here",
    "accessToken": "jwt_token_here",
    "refreshToken": "refresh_token_here",
    "isEmailVerified": false
  }
}
```

### Login User
**POST** `/api/auth/login`

Authenticate user and receive access tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User logged in successfully",
  "data": {
    "userId": "user_id_here",
    "accessToken": "jwt_token_here",
    "refreshToken": "refresh_token_here"
  }
}
```

### Refresh Token
**POST** `/api/auth/refresh`

Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

## User Profile Endpoints

### Get Current User Profile
**GET** `/api/users/me`

Get the current user's basic profile information.

### Get Complete User Profile
**GET** `/api/users/me/complete`

Get complete user profile with completion metrics and verification status.

**Response:**
```json
{
  "success": true,
  "message": "Complete profile retrieved",
  "data": {
    "user": {
      "_id": "user_id",
      "email": "user@example.com",
      "profile": {
        "name": "John Doe",
        "age": 28,
        "bio": "User bio here",
        "photos": [...],
        "prompts": [...],
        "interests": [...]
      },
      "profileCompletion": {
        "percentage": 75,
        "completed": 6,
        "total": 8,
        "recommendations": [...]
      },
      "verificationStatus": {
        "email": true,
        "phone": false,
        "photos": true,
        "identity": false
      }
    }
  }
}
```

### Update Profile Section
**PUT** `/api/users/me/profile`

Update specific sections of user profile.

**Request Body:**
```json
{
  "section": "basic", // basic, photos, prompts, interests, preferences, location
  "data": {
    "name": "John Doe",
    "age": 28,
    "occupation": "Software Engineer",
    "bio": "Updated bio here"
  }
}
```

### Upload Profile Photo
**POST** `/api/users/me/photos/upload`

Upload profile photo with automatic optimization.

**Content-Type:** `multipart/form-data`

**Form Data:**
- `photo`: Image file (max 10MB)
- `caption`: Photo caption (optional)
- `isPrimary`: Set as primary photo (optional)

**Response:**
```json
{
  "success": true,
  "message": "Photo uploaded successfully",
  "data": {
    "photo": {
      "url": "cloudinary_url",
      "cloudinaryId": "cloudinary_id",
      "caption": "Photo caption",
      "isPrimary": true,
      "thumbnails": {
        "small": "150x150_url",
        "medium": "400x400_url",
        "large": "800x800_url"
      }
    },
    "totalPhotos": 3
  }
}
```

### Update Profile Prompts
**PUT** `/api/users/me/prompts`

Update conversation starter prompts.

**Request Body:**
```json
{
  "prompts": [
    {
      "question": "What's your idea of a perfect Sunday?",
      "answer": "Sleeping in, hiking, then cooking a new recipe",
      "order": 0
    }
  ]
}
```

### Get Available Prompts
**GET** `/api/users/prompts/available`

Get list of available prompt questions.

## Discovery & Matching Endpoints

### Get Discovery Feed
**GET** `/api/discovery`

Get personalized user suggestions based on compatibility algorithm.

**Query Parameters:**
- `limit`: Number of users to return (default: 10)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "message": "Discovery feed retrieved",
  "data": {
    "users": [
      {
        "_id": "user_id",
        "profile": {
          "name": "Jane Smith",
          "age": 26,
          "photos": [...],
          "bio": "User bio",
          "interests": [...],
          "location": {...}
        },
        "compatibility": {
          "score": 85,
          "factors": ["age", "interests", "energy", "goals"]
        },
        "distance": 12.5
      }
    ],
    "hasMore": true,
    "pagination": {...}
  }
}
```

### Swipe Action
**POST** `/api/discovery/swipe`

Record swipe action and check for matches.

**Request Body:**
```json
{
  "targetUserId": "target_user_id",
  "action": "like" // like, pass, super_like
}
```

**Response:**
```json
{
  "success": true,
  "message": "It's a match!", // or "Swipe recorded"
  "data": {
    "swipeId": "swipe_id",
    "action": "like",
    "isMatch": true,
    "matchId": "match_id" // if match occurred
  }
}
```

### Get User Matches
**GET** `/api/matches`

Get user's matches with pagination.

**Response:**
```json
{
  "success": true,
  "message": "Matches retrieved",
  "data": {
    "matches": [
      {
        "_id": "match_id",
        "matchedAt": "2023-01-01T00:00:00Z",
        "compatibility": {
          "score": 85,
          "factors": [...]
        },
        "user": {
          "_id": "user_id",
          "profile": {...}
        }
      }
    ],
    "hasMore": false,
    "pagination": {...}
  }
}
```

## Messaging Endpoints

### Get Conversations
**GET** `/api/conversations`

Get user's conversations with last message info.

**Response:**
```json
{
  "success": true,
  "message": "Conversations retrieved",
  "data": {
    "conversations": [
      {
        "_id": "conversation_id",
        "otherUser": {
          "_id": "user_id",
          "profile": {
            "name": "Jane Smith",
            "photos": [...]
          }
        },
        "lastMessage": {
          "content": {...},
          "timestamp": "2023-01-01T00:00:00Z"
        },
        "unreadCount": 2
      }
    ]
  }
}
```

### Get Messages
**GET** `/api/conversations/:conversationId/messages`

Get messages for a specific conversation.

**Query Parameters:**
- `limit`: Number of messages (default: 50)
- `offset`: Pagination offset (default: 0)

### Send Message
**POST** `/api/conversations/:conversationId/messages`

Send a message in a conversation.

**Request Body:**
```json
{
  "content": "Hello, how are you?",
  "type": "text" // text, image, voice, location, activity
}
```

### Create Conversation
**POST** `/api/conversations`

Create a new conversation from a match.

**Request Body:**
```json
{
  "matchId": "match_id"
}
```

## Activity Endpoints

### Get Activity Suggestions
**GET** `/api/activities/suggestions`

Get personalized activity recommendations.

**Query Parameters:**
- `limit`: Number of activities (default: 10)
- `category`: Filter by category (optional)
- `priceRange`: Filter by price range (optional)
- `timeOfDay`: Filter by preferred time (optional)
- `maxDistance`: Maximum distance in km (default: 25)

**Response:**
```json
{
  "success": true,
  "message": "Activity suggestions retrieved",
  "data": {
    "activities": [
      {
        "_id": "activity_id",
        "title": "Golden Gate Park Hike",
        "description": "Beautiful hiking trails...",
        "category": "outdoor",
        "location": {
          "address": "Golden Gate Park, SF",
          "coordinates": [-122.4783, 37.7694]
        },
        "priceRange": "free",
        "duration": 120,
        "averageRating": 4.5,
        "personalizationScore": 85,
        "distance": 5.2,
        "images": [...]
      }
    ]
  }
}
```

### Get Activity Categories
**GET** `/api/activities/categories`

Get available activity categories and filters.

### Search Activities
**GET** `/api/activities/search`

Search activities by keyword.

**Query Parameters:**
- `q`: Search query (required)
- `category`: Filter by category (optional)
- `priceRange`: Filter by price range (optional)
- `rating`: Minimum rating filter (optional)

### Rate Activity
**POST** `/api/activities/:activityId/rate`

Rate and review an activity.

**Request Body:**
```json
{
  "rating": 5,
  "review": "Amazing experience! Highly recommend."
}
```

### Suggest Activity to Match
**POST** `/api/matches/:matchId/suggest-activity`

Suggest an activity to a match via messaging.

**Request Body:**
```json
{
  "activityId": "activity_id",
  "message": "How about we try this activity together?"
}
```

## Verification Endpoints

### Send Email Verification
**POST** `/api/users/me/verification/email`

Send email verification code.

**Response:**
```json
{
  "success": true,
  "message": "Verification code sent to your email",
  "data": {
    "expiresAt": "2023-01-01T00:10:00Z",
    "testCode": "123456" // Only in development
  }
}
```

### Verify Email
**POST** `/api/users/me/verification/email/verify`

Verify email with verification code.

**Request Body:**
```json
{
  "code": "123456"
}
```

### Request Phone Verification
**POST** `/api/users/me/verification/phone`

Request phone verification code.

**Request Body:**
```json
{
  "phoneNumber": "+1234567890"
}
```

### Verify Phone
**POST** `/api/users/me/verification/phone/verify`

Verify phone with verification code.

**Request Body:**
```json
{
  "code": "123456"
}
```

### Request Photo Verification
**POST** `/api/users/me/verification/photos`

Request manual photo verification by admin.

### Get Verification Status
**GET** `/api/users/me/verification/status`

Get complete verification status.

## Settings Endpoints

### Update Settings
**PUT** `/api/users/me/settings`

Update user account settings.

**Request Body:**
```json
{
  "section": "notifications", // notifications, privacy, discovery
  "settings": {
    "matches": true,
    "messages": true,
    "activities": false,
    "marketing": false
  }
}
```

### Get Profile Analytics
**GET** `/api/users/me/analytics`

Get user profile analytics and insights.

## Real-time Events (Socket.io)

### Connection
Connect to WebSocket endpoint with JWT authentication:

```javascript
const socket = io('wss://api.onetime.app', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

### Events

#### Incoming Events
- `new_message`: New message received
- `typing_start`: User started typing
- `typing_stop`: User stopped typing
- `user_joined_conversation`: User joined conversation
- `broadcast_notification`: System notification

#### Outgoing Events
- `join_conversation`: Join conversation room
- `leave_conversation`: Leave conversation room
- `typing_start`: Start typing indicator
- `typing_stop`: Stop typing indicator
- `user_activity`: Update user activity status

### Example Usage

```javascript
// Join a conversation
socket.emit('join_conversation', { conversationId: 'conversation_id' });

// Listen for new messages
socket.on('new_message', (message) => {
  console.log('New message:', message);
});

// Send typing indicator
socket.emit('typing_start', { conversationId: 'conversation_id' });
```

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_TOKEN` | JWT token is invalid or expired |
| `USER_NOT_FOUND` | User account not found |
| `INVALID_CREDENTIALS` | Login credentials are incorrect |
| `EMAIL_ALREADY_EXISTS` | Email address already registered |
| `PROFILE_INCOMPLETE` | User profile is incomplete |
| `VERIFICATION_REQUIRED` | Email verification required |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `FILE_TOO_LARGE` | Uploaded file exceeds size limit |
| `INVALID_FILE_TYPE` | File type not supported |
| `CONVERSATION_NOT_FOUND` | Conversation doesn't exist |
| `MATCH_REQUIRED` | Match required for this action |

## iOS Integration Notes

### Authentication Flow
1. User registration/login
2. Store JWT tokens securely in Keychain
3. Include Bearer token in all API requests
4. Handle token refresh automatically
5. Redirect to login on token expiration

### Image Handling
- Use multipart/form-data for photo uploads
- Display optimized thumbnails for performance
- Implement progressive loading for images
- Cache images locally for offline viewing

### Real-time Messaging
- Connect to Socket.io on app launch
- Maintain connection during app usage
- Handle connection drops gracefully
- Queue messages when offline

### Location Services
- Request location permissions for discovery
- Use Core Location for accurate positioning
- Implement location-based activity filtering
- Respect user privacy settings

### Push Notifications
- Register for push notifications
- Handle notification permissions
- Deep link to relevant screens
- Badge count for unread messages

### Performance Optimization
- Implement pagination for large datasets
- Use lazy loading for images
- Cache API responses appropriately
- Optimize network requests

## Testing

### Test Environment
- **Base URL:** `http://localhost:3000`
- **Admin Credentials:** Check environment variables
- **Test Users:** Auto-generated during testing

### Available Test Scripts
- `test-auth.js` - Authentication flow testing
- `test-discovery.js` - Discovery and matching testing
- `test-activities.js` - Activity system testing
- `test-profile.js` - Profile management testing
- `test-messaging.js` - Real-time messaging testing
- `test-admin.js` - Admin dashboard testing

## Support

For API support and questions:
- **Email:** dev@onetime.app
- **Documentation:** https://docs.onetime.app
- **Status Page:** https://status.onetime.app