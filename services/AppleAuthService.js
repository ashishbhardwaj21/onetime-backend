/**
 * Apple Sign-In Authentication Service
 * 
 * Features:
 * - Apple ID token verification
 * - Secure user registration with Apple credentials
 * - Privacy-first approach (email masking support)
 * - Seamless account linking
 * - Apple's privacy requirements compliance
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');

class AppleAuthService {
  constructor() {
    this.applePublicKeys = new Map(); // Cache for Apple's public keys
    this.keysCacheTime = 24 * 60 * 60 * 1000; // 24 hours
    this.lastKeysUpdate = 0;
    
    // Apple's endpoints
    this.appleKeysUrl = 'https://appleid.apple.com/auth/keys';
    this.appleIssuer = 'https://appleid.apple.com';
    this.clientId = process.env.APPLE_CLIENT_ID || 'com.ashish.One-Time'; // Your app's bundle ID
  }

  /**
   * Authenticate user with Apple ID token
   * @param {string} identityToken - Apple ID token from iOS app
   * @param {string} authorizationCode - Authorization code from Apple
   * @param {Object} user - User information from Apple (if available)
   * @returns {Object} Authentication result
   */
  async authenticateWithApple(identityToken, authorizationCode, user = null) {
    try {
      console.log('🍎 Starting Apple Sign-In authentication...');

      // Verify the identity token
      const tokenPayload = await this.verifyAppleToken(identityToken);
      
      if (!tokenPayload) {
        throw new Error('Invalid Apple ID token');
      }

      // Extract user information
      const appleUserId = tokenPayload.sub;
      const email = tokenPayload.email;
      const emailVerified = tokenPayload.email_verified === 'true';
      
      console.log(`✅ Apple token verified for user: ${appleUserId}`);

      // Check if user already exists
      let existingUser = await User.findOne({
        $or: [
          { 'apple.id': appleUserId },
          { email: email }
        ]
      });

      if (existingUser) {
        // Update Apple authentication info if needed
        if (!existingUser.apple || existingUser.apple.id !== appleUserId) {
          existingUser.apple = {
            id: appleUserId,
            email: email,
            emailVerified: emailVerified,
            connectedAt: new Date()
          };
          
          // Update email verification if Apple email is verified
          if (emailVerified && !existingUser.verification.email.verified) {
            existingUser.verification.email.verified = true;
            existingUser.verification.email.verifiedAt = new Date();
          }
          
          await existingUser.save();
        }

        // Update last active
        existingUser.lastActive = new Date();
        await existingUser.save();

        return this.generateAuthResponse(existingUser, 'existing_user');
      }

      // Create new user account
      const newUserData = await this.createAppleUser(tokenPayload, user, authorizationCode);
      const newUser = await this.registerNewUser(newUserData);

      console.log(`✅ New Apple user created: ${newUser._id}`);
      return this.generateAuthResponse(newUser, 'new_user');

    } catch (error) {
      console.error('❌ Apple authentication error:', error);
      throw error;
    }
  }

  /**
   * Verify Apple ID token
   * @param {string} identityToken - The identity token to verify
   * @returns {Object} Decoded token payload
   */
  async verifyAppleToken(identityToken) {
    try {
      // Get Apple's public keys
      await this.updateApplePublicKeys();

      // Decode token header to get the key ID
      const decodedHeader = jwt.decode(identityToken, { complete: true });
      
      if (!decodedHeader || !decodedHeader.header.kid) {
        throw new Error('Invalid token header');
      }

      const keyId = decodedHeader.header.kid;
      const publicKey = this.applePublicKeys.get(keyId);

      if (!publicKey) {
        throw new Error(`Public key not found for key ID: ${keyId}`);
      }

      // Verify the token
      const payload = jwt.verify(identityToken, publicKey, {
        issuer: this.appleIssuer,
        audience: this.clientId,
        algorithms: ['RS256']
      });

      // Additional validations
      if (payload.aud !== this.clientId) {
        throw new Error('Invalid audience');
      }

      if (payload.iss !== this.appleIssuer) {
        throw new Error('Invalid issuer');
      }

      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        throw new Error('Token expired');
      }

      return payload;

    } catch (error) {
      console.error('Apple token verification error:', error);
      return null;
    }
  }

  /**
   * Create user data from Apple authentication
   * @param {Object} tokenPayload - Verified token payload
   * @param {Object} userInfo - Additional user info from Apple
   * @param {string} authorizationCode - Authorization code
   * @returns {Object} User data for registration
   */
  async createAppleUser(tokenPayload, userInfo, authorizationCode) {
    const appleUserId = tokenPayload.sub;
    const email = tokenPayload.email;
    const emailVerified = tokenPayload.email_verified === 'true';

    // Parse user info from Apple (if provided on first sign-in)
    let firstName = '';
    let lastName = '';
    
    if (userInfo && userInfo.name) {
      firstName = userInfo.name.firstName || '';
      lastName = userInfo.name.lastName || '';
    }

    // If no name provided, generate a default name
    const displayName = firstName && lastName ? 
      `${firstName} ${lastName}` : 
      `Apple User ${appleUserId.substring(0, 8)}`;

    return {
      email: email,
      profile: {
        name: displayName,
        firstName: firstName,
        lastName: lastName,
        age: null, // Will need to be set during onboarding
        gender: null, // Will need to be set during onboarding
        bio: '',
        interests: [],
        photos: [],
        energyLevel: 'medium',
        location: null,
        preferences: {
          ageRange: { min: 18, max: 35 },
          maxDistance: 25,
          genderPreference: 'all'
        }
      },
      apple: {
        id: appleUserId,
        email: email,
        emailVerified: emailVerified,
        authorizationCode: authorizationCode,
        connectedAt: new Date()
      },
      verification: {
        email: {
          verified: emailVerified,
          verifiedAt: emailVerified ? new Date() : null
        },
        phone: {
          verified: false
        }
      },
      privacy: {
        hideEmail: userInfo?.email?.endsWith('@privaterelay.appleid.com') || false,
        applePrivateEmail: userInfo?.email?.endsWith('@privaterelay.appleid.com') || false
      },
      status: 'onboarding', // User needs to complete profile setup
      authProvider: 'apple',
      createdAt: new Date(),
      lastActive: new Date()
    };
  }

  /**
   * Register new user with Apple authentication
   * @param {Object} userData - User data to register
   * @returns {Object} Created user
   */
  async registerNewUser(userData) {
    try {
      // Check if email already exists (shouldn't happen, but safety check)
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Create new user
      const user = new User(userData);
      await user.save();

      console.log(`✅ Apple user registered: ${user.email}`);
      return user;

    } catch (error) {
      console.error('Apple user registration error:', error);
      throw error;
    }
  }

  /**
   * Generate authentication response
   * @param {Object} user - User object
   * @param {string} userType - 'new_user' or 'existing_user'
   * @returns {Object} Authentication response
   */
  generateAuthResponse(user, userType) {
    // Generate JWT tokens
    const accessToken = this.generateAccessToken(user._id);
    const refreshToken = this.generateRefreshToken(user._id);

    return {
      success: true,
      userType: userType,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          profile: {
            name: user.profile.name,
            firstName: user.profile.firstName,
            lastName: user.profile.lastName,
            photos: user.profile.photos || [],
            isComplete: this.isProfileComplete(user)
          },
          status: user.status,
          authProvider: 'apple',
          apple: {
            id: user.apple.id,
            emailVerified: user.apple.emailVerified,
            privateEmail: user.privacy?.applePrivateEmail || false
          },
          verification: user.verification,
          needsOnboarding: user.status === 'onboarding'
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        }
      }
    };
  }

  /**
   * Link Apple account to existing user
   * @param {string} userId - Existing user ID
   * @param {string} identityToken - Apple ID token
   * @returns {Object} Link result
   */
  async linkAppleAccount(userId, identityToken) {
    try {
      const tokenPayload = await this.verifyAppleToken(identityToken);
      
      if (!tokenPayload) {
        throw new Error('Invalid Apple ID token');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if Apple ID is already linked to another account
      const existingAppleUser = await User.findOne({
        'apple.id': tokenPayload.sub,
        _id: { $ne: userId }
      });

      if (existingAppleUser) {
        throw new Error('This Apple ID is already linked to another account');
      }

      // Link Apple account
      user.apple = {
        id: tokenPayload.sub,
        email: tokenPayload.email,
        emailVerified: tokenPayload.email_verified === 'true',
        connectedAt: new Date()
      };

      await user.save();

      return {
        success: true,
        message: 'Apple account linked successfully',
        data: {
          appleId: tokenPayload.sub,
          email: tokenPayload.email
        }
      };

    } catch (error) {
      console.error('Apple account linking error:', error);
      throw error;
    }
  }

  /**
   * Unlink Apple account from user
   * @param {string} userId - User ID
   * @returns {Object} Unlink result
   */
  async unlinkAppleAccount(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.apple || !user.apple.id) {
        throw new Error('Apple account not linked');
      }

      // Check if user has other authentication methods
      if (user.authProvider === 'apple' && !user.passwordHash) {
        throw new Error('Cannot unlink Apple account without setting up password authentication');
      }

      // Remove Apple authentication
      user.apple = undefined;
      
      // If Apple was the primary auth method, require password setup
      if (user.authProvider === 'apple') {
        user.status = 'requires_password';
      }

      await user.save();

      return {
        success: true,
        message: 'Apple account unlinked successfully'
      };

    } catch (error) {
      console.error('Apple account unlinking error:', error);
      throw error;
    }
  }

  /**
   * Update Apple public keys from Apple's servers
   */
  async updateApplePublicKeys() {
    try {
      // Check if keys need updating
      if (Date.now() - this.lastKeysUpdate < this.keysCacheTime) {
        return; // Keys are still fresh
      }

      console.log('🔄 Updating Apple public keys...');

      const response = await axios.get(this.appleKeysUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'OneTime-Dating-App/1.0'
        }
      });

      if (!response.data || !response.data.keys) {
        throw new Error('Invalid response from Apple keys endpoint');
      }

      // Clear existing keys
      this.applePublicKeys.clear();

      // Process each key
      for (const key of response.data.keys) {
        const publicKey = this.constructPublicKey(key);
        this.applePublicKeys.set(key.kid, publicKey);
      }

      this.lastKeysUpdate = Date.now();
      console.log(`✅ Updated ${this.applePublicKeys.size} Apple public keys`);

    } catch (error) {
      console.error('❌ Failed to update Apple public keys:', error);
      // Don't throw here - use cached keys if available
    }
  }

  /**
   * Construct public key from Apple's JWK format
   * @param {Object} jwk - JSON Web Key from Apple
   * @returns {string} PEM formatted public key
   */
  constructPublicKey(jwk) {
    try {
      // Convert JWK to PEM format
      const modulus = Buffer.from(jwk.n, 'base64');
      const exponent = Buffer.from(jwk.e, 'base64');

      // Create RSA public key
      const key = crypto.createPublicKey({
        key: {
          kty: jwk.kty,
          n: jwk.n,
          e: jwk.e
        },
        format: 'jwk'
      });

      return key.export({ type: 'spki', format: 'pem' });

    } catch (error) {
      console.error('Public key construction error:', error);
      throw error;
    }
  }

  /**
   * Generate access token for user
   * @param {string} userId - User ID
   * @returns {string} JWT access token
   */
  generateAccessToken(userId) {
    return jwt.sign(
      { userId, type: 'access' },
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        issuer: 'onetime-app',
        subject: userId.toString()
      }
    );
  }

  /**
   * Generate refresh token for user
   * @param {string} userId - User ID
   * @returns {string} JWT refresh token
   */
  generateRefreshToken(userId) {
    return jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
        issuer: 'onetime-app',
        subject: userId.toString()
      }
    );
  }

  /**
   * Check if user profile is complete
   * @param {Object} user - User object
   * @returns {boolean} Whether profile is complete
   */
  isProfileComplete(user) {
    const profile = user.profile;
    return !!(
      profile.age &&
      profile.gender &&
      profile.bio &&
      profile.interests && profile.interests.length > 0 &&
      profile.photos && profile.photos.length > 0 &&
      profile.location
    );
  }

  /**
   * Get Apple authentication status for user
   * @param {string} userId - User ID
   * @returns {Object} Apple auth status
   */
  async getAppleAuthStatus(userId) {
    try {
      const user = await User.findById(userId).select('apple authProvider verification');
      
      if (!user) {
        throw new Error('User not found');
      }

      return {
        isLinked: !!(user.apple && user.apple.id),
        isPrimaryAuth: user.authProvider === 'apple',
        email: user.apple?.email,
        emailVerified: user.apple?.emailVerified || false,
        connectedAt: user.apple?.connectedAt,
        privateEmail: user.privacy?.applePrivateEmail || false
      };

    } catch (error) {
      console.error('Apple auth status error:', error);
      throw error;
    }
  }

  /**
   * Revoke Apple authentication tokens (for account deletion)
   * @param {string} userId - User ID
   * @returns {Object} Revocation result
   */
  async revokeAppleTokens(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user || !user.apple || !user.apple.authorizationCode) {
        return { success: true, message: 'No Apple tokens to revoke' };
      }

      // In production, you would call Apple's token revocation endpoint
      // For now, just remove the local Apple authentication data
      
      console.log(`🍎 Revoking Apple tokens for user: ${userId}`);
      
      // Remove Apple auth data
      user.apple = undefined;
      await user.save();

      return {
        success: true,
        message: 'Apple authentication revoked'
      };

    } catch (error) {
      console.error('Apple token revocation error:', error);
      throw error;
    }
  }
}

module.exports = AppleAuthService;