/**
 * Apple Sign-In Authentication Routes
 * Handles Apple ID authentication for iOS app
 */

const express = require('express');
const router = express.Router();
const AppleAuthService = require('../services/AppleAuthService');

// Initialize Apple authentication service
const appleAuth = new AppleAuthService();

/**
 * POST /api/auth/apple/signin
 * Authenticate user with Apple ID
 */
router.post('/signin', async (req, res) => {
  try {
    const { identityToken, authorizationCode, user } = req.body;

    // Validate required fields
    if (!identityToken) {
      return res.status(400).json({
        success: false,
        error: 'Identity token is required'
      });
    }

    console.log('🍎 Apple Sign-In attempt...');

    // Authenticate with Apple
    const authResult = await appleAuth.authenticateWithApple(
      identityToken,
      authorizationCode,
      user
    );

    // Log successful authentication
    console.log(`✅ Apple authentication successful - User type: ${authResult.userType}`);

    res.status(200).json({
      success: true,
      message: authResult.userType === 'new_user' ? 
        'Account created successfully with Apple ID' : 
        'Signed in successfully with Apple ID',
      ...authResult
    });

  } catch (error) {
    console.error('❌ Apple Sign-In error:', error);
    
    // Handle specific error types
    if (error.message.includes('Invalid Apple ID token')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Apple ID token',
        code: 'INVALID_APPLE_TOKEN'
      });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: 'Account with this email already exists',
        code: 'USER_EXISTS'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Apple Sign-In failed',
      code: 'APPLE_AUTH_ERROR'
    });
  }
});

/**
 * POST /api/auth/apple/link
 * Link Apple ID to existing account
 */
router.post('/link', async (req, res) => {
  try {
    const { identityToken } = req.body;
    const userId = req.user._id; // From auth middleware

    if (!identityToken) {
      return res.status(400).json({
        success: false,
        error: 'Identity token is required'
      });
    }

    const linkResult = await appleAuth.linkAppleAccount(userId, identityToken);

    res.status(200).json(linkResult);

  } catch (error) {
    console.error('Apple account linking error:', error);

    if (error.message.includes('already linked')) {
      return res.status(409).json({
        success: false,
        error: 'This Apple ID is already linked to another account',
        code: 'APPLE_ALREADY_LINKED'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to link Apple account'
    });
  }
});

/**
 * DELETE /api/auth/apple/unlink
 * Unlink Apple ID from account
 */
router.delete('/unlink', async (req, res) => {
  try {
    const userId = req.user._id;

    const unlinkResult = await appleAuth.unlinkAppleAccount(userId);

    res.status(200).json(unlinkResult);

  } catch (error) {
    console.error('Apple account unlinking error:', error);

    if (error.message.includes('not linked')) {
      return res.status(400).json({
        success: false,
        error: 'Apple account is not linked to this user',
        code: 'APPLE_NOT_LINKED'
      });
    }

    if (error.message.includes('without setting up password')) {
      return res.status(400).json({
        success: false,
        error: 'Cannot unlink Apple account without alternative authentication method',
        code: 'REQUIRE_PASSWORD_SETUP'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to unlink Apple account'
    });
  }
});

/**
 * GET /api/auth/apple/status
 * Get Apple authentication status
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user._id;

    const status = await appleAuth.getAppleAuthStatus(userId);

    res.status(200).json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Apple auth status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Apple authentication status'
    });
  }
});

/**
 * POST /api/auth/apple/revoke
 * Revoke Apple authentication (for account deletion)
 */
router.post('/revoke', async (req, res) => {
  try {
    const userId = req.user._id;

    const revokeResult = await appleAuth.revokeAppleTokens(userId);

    res.status(200).json(revokeResult);

  } catch (error) {
    console.error('Apple token revocation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke Apple authentication'
    });
  }
});

/**
 * POST /api/auth/apple/refresh
 * Refresh tokens for Apple authenticated user
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token type'
      });
    }

    // Get user
    const User = require('../models/User');
    const user = await User.findById(decoded.userId);

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive'
      });
    }

    // Generate new tokens
    const newAccessToken = appleAuth.generateAccessToken(user._id);
    const newRefreshToken = appleAuth.generateRefreshToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Tokens refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Refresh token expired',
        code: 'REFRESH_TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    });
  }
});

module.exports = router;