const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');
const { sendVerificationEmail, sendSMS } = require('../utils/communications');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  });
};

// Register endpoint
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').trim().isLength({ min: 1, max: 50 }).withMessage('Name must be between 1 and 50 characters'),
  body('age').isInt({ min: 18, max: 100 }).withMessage('Age must be between 18 and 100'),
  body('gender').isIn(['male', 'female', 'non-binary', 'other']).withMessage('Invalid gender'),
  body('dateOfBirth').isISO8601().withMessage('Invalid date of birth'),
  body('location.coordinates').isArray({ min: 2, max: 2 }).withMessage('Location coordinates required')
], async (req, res) => {
  try {
    // Check for validation errors
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
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Generate email verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create new user
    const user = new User({
      email,
      passwordHash: password, // Will be hashed by pre-save hook
      profile: {
        name,
        age,
        gender,
        dateOfBirth: new Date(dateOfBirth),
        location: {
          type: 'Point',
          coordinates: location.coordinates,
          city: location.city,
          state: location.state,
          country: location.country
        }
      },
      verification: {
        email: {
          verified: false,
          verificationCode,
          expiresAt: verificationExpiry
        }
      }
    });

    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationCode, name);
    } catch (emailError) {
      logger.error('Failed to send verification email:', emailError);
      // Don't fail registration if email fails
    }

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    logger.info('User registered successfully', { 
      userId: user._id, 
      email: user.email 
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      data: {
        user: user.getPublicProfile(),
        token,
        refreshToken,
        emailVerificationRequired: true
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Login endpoint
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').exists().withMessage('Password is required')
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

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last active time
    user.analytics.lastActiveAt = new Date();
    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    logger.info('User logged in successfully', { 
      userId: user._id, 
      email: user.email 
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.getPublicProfile(),
        token,
        refreshToken,
        emailVerificationRequired: !user.verification.email.verified
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Verify email endpoint
router.post('/verify-email', [
  body('email').isEmail().normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
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

    const { email, code } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already verified
    if (user.verification.email.verified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    // Check verification code and expiry
    if (user.verification.email.verificationCode !== code) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    if (user.verification.email.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Verification code expired'
      });
    }

    // Mark email as verified
    user.verification.email.verified = true;
    user.verification.email.verificationCode = undefined;
    user.verification.email.expiresAt = undefined;
    await user.save();

    logger.info('Email verified successfully', { 
      userId: user._id, 
      email: user.email 
    });

    res.json({
      success: true,
      message: 'Email verified successfully',
      data: {
        user: user.getPublicProfile()
      }
    });

  } catch (error) {
    logger.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Resend verification email
router.post('/resend-verification', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists for security
      return res.json({
        success: true,
        message: 'If the email exists, a verification code has been sent'
      });
    }

    if (user.verification.email.verified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    // Generate new verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.verification.email.verificationCode = verificationCode;
    user.verification.email.expiresAt = verificationExpiry;
    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationCode, user.profile.name);
    } catch (emailError) {
      logger.error('Failed to send verification email:', emailError);
    }

    res.json({
      success: true,
      message: 'If the email exists, a verification code has been sent'
    });

  } catch (error) {
    logger.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
    });
  }
});

// Phone authentication endpoints
router.post('/phone/send-code', [
  body('phoneNumber').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number format')
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

    // Check if user exists with this phone number
    let user = await User.findOne({ 'profile.phoneNumber': phoneNumber });
    
    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (user) {
      // Update existing user's verification code
      user.verification.phone = {
        verified: false,
        verificationCode,
        expiresAt: verificationExpiry
      };
      await user.save();
    } else {
      // Create a temporary user with phone number
      user = new User({
        email: `${phoneNumber.replace(/\+/g, '')}@temp.onetime.app`, // Temporary email
        passwordHash: Math.random().toString(36).substring(7), // Random password
        profile: {
          name: 'User',
          phoneNumber,
          age: 18,
          gender: 'other'
        },
        verification: {
          phone: {
            verified: false,
            verificationCode,
            expiresAt: verificationExpiry
          }
        },
        isPhoneOnlyUser: true
      });
      await user.save();
    }

    // Send SMS with verification code
    try {
      await sendSMS(phoneNumber, `Your One Time verification code is: ${verificationCode}`);
      logger.info('SMS verification code sent', { phoneNumber });
    } catch (smsError) {
      logger.error('Failed to send SMS:', smsError);
      // For development/testing, we'll still return success
      if (process.env.NODE_ENV === 'development') {
        logger.info('Development mode - verification code:', { phoneNumber, verificationCode });
      } else {
        return res.status(500).json({
          success: false,
          message: 'Failed to send verification code'
        });
      }
    }

    res.json({
      success: true,
      message: 'Verification code sent successfully',
      data: {
        phoneNumber,
        // Include code in development for testing
        ...(process.env.NODE_ENV === 'development' && { verificationCode })
      }
    });

  } catch (error) {
    logger.error('Phone send code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Verify phone code endpoint
router.post('/phone/verify', [
  body('phoneNumber').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number format'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
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

    const user = await User.findOne({ 'profile.phoneNumber': phoneNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check verification code and expiry
    if (!user.verification.phone || user.verification.phone.verificationCode !== code) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    if (user.verification.phone.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Verification code expired'
      });
    }

    // Mark phone as verified
    user.verification.phone.verified = true;
    user.verification.phone.verificationCode = undefined;
    user.verification.phone.expiresAt = undefined;
    
    // Update last active time
    user.analytics.lastActiveAt = new Date();
    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    logger.info('Phone verified successfully', { 
      userId: user._id, 
      phoneNumber 
    });

    res.json({
      success: true,
      message: 'Phone verified successfully',
      data: {
        user: user.getPublicProfile(),
        token,
        refreshToken,
        isNewUser: user.isPhoneOnlyUser && !user.profile.name || user.profile.name === 'User'
      }
    });

  } catch (error) {
    logger.error('Phone verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Phone verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Refresh token endpoint
router.post('/refresh', [
  body('refreshToken').exists().withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: user.getPublicProfile()
      }
    });

  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user information'
    });
  }
});

// Logout endpoint
router.post('/logout', auth, async (req, res) => {
  try {
    // In a more sophisticated implementation, you might blacklist the token
    // For now, we'll just return success as the client will remove the token
    
    logger.info('User logged out', { userId: req.userId });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// Apple Sign In endpoint
router.post('/apple/signin', [
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
      const appleId = Math.random().toString(36).substring(7);
      email = `${appleId}@privaterelay.appleid.com`;
    }

    // Check if user already exists
    let user = await User.findOne({ email });
    let isNewUser = false;

    if (!user) {
      // Create new user
      isNewUser = true;
      user = new User({
        email,
        passwordHash: Math.random().toString(36).substring(7), // Random password for Apple users
        profile: {
          name,
          age: 18, // Default age, user will need to update
          gender: 'other' // Default gender, user will need to update
        },
        verification: {
          email: {
            verified: true // Apple users are pre-verified
          }
        },
        appleId: identityToken, // Store Apple ID token reference
        isAppleUser: true
      });
      await user.save();
    }

    // Update last active time
    user.analytics.lastActiveAt = new Date();
    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    logger.info('Apple Sign In successful', { 
      userId: user._id, 
      email: user.email,
      isNewUser 
    });

    res.json({
      success: true,
      message: isNewUser ? 'Account created with Apple ID' : 'Signed in with Apple ID',
      data: {
        user: user.getPublicProfile(),
        token,
        refreshToken,
        isNewUser,
        userType: isNewUser ? 'new_user' : 'existing_user'
      }
    });

  } catch (error) {
    logger.error('Apple Sign In error:', error);
    res.status(500).json({
      success: false,
      message: 'Apple Sign In failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;