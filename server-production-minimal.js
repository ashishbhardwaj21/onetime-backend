const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

console.log('🚀 Starting OneTime Minimal Production Server...');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Import models
const User = require('./models/User');

// JWT token generation
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Auth middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token - user not found'
      });
    }
    
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token - user inactive'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.log('❌ Auth error:', error.message);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'OneTime Dating App API - Production',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      'POST /api/auth/register': 'Register with email',
      'POST /api/auth/login': 'Login with email',
      'POST /api/auth/phone/send-code': 'Send phone verification code',
      'POST /api/auth/phone/verify': 'Verify phone code',
      'POST /api/auth/apple/signin': 'Apple Sign In'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// EMAIL AUTHENTICATION
app.post('/api/auth/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').isLength({ min: 2 }),
  body('age').isInt({ min: 18, max: 100 }),
  body('gender').isIn(['male', 'female', 'other'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { email, password, name, age, gender, dateOfBirth, location } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Create new user
    const user = new User({
      email: email.toLowerCase(),
      passwordHash: password, // Will be hashed by pre-save hook
      profile: {
        name,
        age,
        gender,
        dateOfBirth: new Date(dateOfBirth),
        location: location || {
          type: 'Point',
          coordinates: [-122.4194, 37.7749], // Default to SF
          city: 'San Francisco',
          state: 'CA',
          country: 'US'
        }
      },
      status: 'active'
    });

    await user.save();

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateToken(user._id);

    console.log('✅ User registered:', user.email);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        userId: user._id,
        accessToken,
        refreshToken,
        isEmailVerified: user.verification.email.verified
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

app.post('/api/auth/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateToken(user._id);

    console.log('✅ User logged in:', user.email);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        userId: user._id,
        accessToken,
        refreshToken,
        isEmailVerified: user.verification.email.verified
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// PHONE AUTHENTICATION
app.post('/api/auth/phone/send-code', [
  body('phoneNumber').isLength({ min: 10, max: 15 }).withMessage('Phone number must be 10-15 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { phoneNumber } = req.body;
    
    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store verification code in database (temporary)
    // In production, you would send this via SMS
    
    // For now, let's create a simple temporary storage
    const verificationData = {
      phoneNumber,
      verificationCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    };
    
    // Store in a simple way - in production you'd use Redis or similar
    global.phoneVerifications = global.phoneVerifications || {};
    global.phoneVerifications[phoneNumber] = verificationData;

    console.log('📱 Phone verification code generated:', verificationCode);

    res.json({
      success: true,
      message: 'Verification code sent',
      data: {
        phoneNumber,
        // For development only - remove in production
        verificationCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined
      }
    });

  } catch (error) {
    console.error('Phone send code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send verification code'
    });
  }
});

app.post('/api/auth/phone/verify', [
  body('phoneNumber').isLength({ min: 10, max: 15 }).withMessage('Phone number must be 10-15 digits'),
  body('code').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { phoneNumber, code } = req.body;

    // Get verification data
    const verificationData = global.phoneVerifications && global.phoneVerifications[phoneNumber];
    if (!verificationData) {
      return res.status(400).json({
        success: false,
        error: 'Phone number not found or verification expired'
      });
    }

    // Check verification code
    if (verificationData.verificationCode !== code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    // Check if code is expired
    if (verificationData.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Verification code expired'
      });
    }

    // Find or create user
    let user = await User.findOne({ 'profile.phoneNumber': phoneNumber });
    
    if (!user) {
      // Create new user
      user = new User({
        'profile.phoneNumber': phoneNumber,
        isPhoneOnlyUser: true,
        profile: {
          name: 'Phone User',
          age: 25,
          gender: 'other',
          dateOfBirth: new Date('1999-01-01'),
          phoneNumber: phoneNumber,
          location: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749], // Default to SF
            city: 'San Francisco',
            state: 'CA',
            country: 'US'
          }
        },
        status: 'active',
        verification: {
          phone: {
            verified: true,
            number: phoneNumber
          }
        }
      });
      
      await user.save();
    } else {
      // Update existing user
      user.verification.phone.verified = true;
      user.status = 'active';
      await user.save();
    }

    // Clear verification data
    delete global.phoneVerifications[phoneNumber];

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateToken(user._id);

    console.log('✅ Phone verification successful:', phoneNumber);

    res.json({
      success: true,
      message: 'Phone verification successful',
      data: {
        userId: user._id,
        accessToken,
        refreshToken,
        isPhoneVerified: true
      }
    });

  } catch (error) {
    console.error('Phone verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Phone verification failed'
    });
  }
});

// APPLE SIGN IN
app.post('/api/auth/apple/signin', [
  body('identityToken').exists().withMessage('Identity token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { identityToken, authorizationCode, user: appleUser } = req.body;

    // For development/testing, we'll create a mock Apple authentication
    // In production, you would verify the identityToken with Apple's servers
    
    let email = appleUser?.email;
    let name = appleUser?.name ? `${appleUser.name.firstName} ${appleUser.name.lastName}` : 'Apple User';
    
    // If no email provided (private relay), generate a temporary one
    if (!email) {
      email = `apple_${Date.now()}@privaterelay.appleid.com`;
    }

    // Check if user already exists
    let user = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { appleId: identityToken }
      ]
    });

    if (!user) {
      // Create new user
      user = new User({
        email: email.toLowerCase(),
        appleId: identityToken,
        isAppleUser: true,
        profile: {
          name,
          age: 25, // Default age
          gender: 'other', // Default gender
          dateOfBirth: new Date('1999-01-01'), // Default DOB
          location: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749], // Default to SF
            city: 'San Francisco',
            state: 'CA',
            country: 'US'
          }
        },
        status: 'active',
        verification: {
          email: {
            verified: true // Apple emails are pre-verified
          }
        }
      });

      await user.save();
      console.log('✅ New Apple user created:', email);
    } else {
      console.log('✅ Existing Apple user logged in:', email);
    }

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateToken(user._id);

    res.json({
      success: true,
      message: 'Apple Sign In successful',
      data: {
        userId: user._id,
        accessToken,
        refreshToken,
        isEmailVerified: true
      }
    });

  } catch (error) {
    console.error('Apple Sign In error:', error);
    res.status(500).json({
      success: false,
      error: 'Apple Sign In failed'
    });
  }
});

// LOGOUT
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// USER PROFILE
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash');
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Database connection
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Start server
async function startServer() {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  });
}

startServer().catch(console.error); 