/**
 * Photo Verification and Management Routes
 * Handles photo upload, verification, and management functionality
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const PhotoVerificationService = require('../services/PhotoVerificationService');
const User = require('../models/User');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  }
});

// Initialize photo verification service
const photoService = new PhotoVerificationService();

/**
 * Upload and verify a new profile photo
 * POST /api/photos/upload
 */
router.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No photo file provided'
      });
    }

    const userId = req.user._id;
    const { setPrimary = false, description = '' } = req.body;

    console.log(`📸 Photo upload request from user ${userId}`);

    // Verify photo
    const verification = await photoService.verifyPhoto(
      req.file.buffer,
      userId,
      {
        type: 'profile',
        requireAgeVerification: true,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    );

    if (!verification.passed) {
      return res.status(400).json({
        success: false,
        error: 'Photo verification failed',
        verification: {
          confidence: verification.confidence,
          flags: verification.flags,
          recommendations: verification.recommendations
        }
      });
    }

    // Add photo to user profile
    const result = await photoService.manageProfilePhotos(userId, 'add', {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      description,
      setPrimary
    });

    res.status(201).json({
      success: true,
      message: 'Photo uploaded and verified successfully',
      data: {
        photo: result.photo,
        verification: {
          passed: verification.passed,
          confidence: verification.confidence,
          scores: verification.scores
        }
      }
    });

  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload photo'
    });
  }
});

/**
 * Verify an existing photo
 * POST /api/photos/:photoId/verify
 */
router.post('/:photoId/verify', async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const photo = user.profile.photos.id(photoId);
    if (!photo) {
      return res.status(404).json({
        success: false,
        error: 'Photo not found'
      });
    }

    // Re-verify the photo
    const result = await photoService.manageProfilePhotos(userId, 'verify', {
      photoId
    });

    res.status(200).json({
      success: true,
      message: 'Photo re-verification completed',
      data: result
    });

  } catch (error) {
    console.error('Photo verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify photo'
    });
  }
});

/**
 * Get photo verification details
 * GET /api/photos/:photoId/verification
 */
router.get('/:photoId/verification', async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const photo = user.profile.photos.id(photoId);
    if (!photo) {
      return res.status(404).json({
        success: false,
        error: 'Photo not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Verification details retrieved',
      data: {
        photoId,
        verified: photo.verified,
        verification: photo.verification,
        uploadedAt: photo.uploadedAt,
        metadata: photo.metadata
      }
    });

  } catch (error) {
    console.error('Get verification details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get verification details'
    });
  }
});

/**
 * Delete a photo
 * DELETE /api/photos/:photoId
 */
router.delete('/:photoId', async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.user._id;

    const result = await photoService.manageProfilePhotos(userId, 'remove', {
      photoId
    });

    res.status(200).json({
      success: true,
      message: 'Photo deleted successfully',
      data: result
    });

  } catch (error) {
    console.error('Photo deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete photo'
    });
  }
});

/**
 * Reorder profile photos
 * PUT /api/photos/reorder
 */
router.put('/reorder', async (req, res) => {
  try {
    const { photoOrder } = req.body; // Array of photo IDs in desired order
    const userId = req.user._id;

    if (!Array.isArray(photoOrder)) {
      return res.status(400).json({
        success: false,
        error: 'Photo order must be an array of photo IDs'
      });
    }

    const result = await photoService.manageProfilePhotos(userId, 'reorder', {
      order: photoOrder
    });

    res.status(200).json({
      success: true,
      message: 'Photos reordered successfully',
      data: result
    });

  } catch (error) {
    console.error('Photo reorder error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reorder photos'
    });
  }
});

/**
 * Set primary photo
 * PUT /api/photos/:photoId/primary
 */
router.put('/:photoId/primary', async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.user._id;

    const result = await photoService.manageProfilePhotos(userId, 'setPrimary', {
      photoId
    });

    res.status(200).json({
      success: true,
      message: 'Primary photo set successfully',
      data: result
    });

  } catch (error) {
    console.error('Set primary photo error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set primary photo'
    });
  }
});

/**
 * Get all user photos with verification status
 * GET /api/photos/my-photos
 */
router.get('/my-photos', async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('profile.photos');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const photos = user.profile.photos.map(photo => ({
      _id: photo._id,
      url: photo.url,
      order: photo.order,
      verified: photo.verified,
      verification: photo.verification,
      uploadedAt: photo.uploadedAt,
      metadata: {
        width: photo.metadata?.width,
        height: photo.metadata?.height,
        format: photo.metadata?.format,
        size: photo.metadata?.size
      }
    }));

    res.status(200).json({
      success: true,
      message: 'User photos retrieved',
      data: {
        photos: photos.sort((a, b) => a.order - b.order),
        totalCount: photos.length,
        verifiedCount: photos.filter(p => p.verified).length
      }
    });

  } catch (error) {
    console.error('Get user photos error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user photos'
    });
  }
});

/**
 * Analyze photo before upload (preview verification)
 * POST /api/photos/analyze
 */
router.post('/analyze', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No photo file provided'
      });
    }

    const userId = req.user._id;

    // Run verification analysis without saving
    const verification = await photoService.verifyPhoto(
      req.file.buffer,
      userId,
      {
        type: 'preview',
        requireAgeVerification: true,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    );

    res.status(200).json({
      success: true,
      message: 'Photo analysis completed',
      data: {
        verification: {
          passed: verification.passed,
          confidence: verification.confidence,
          scores: verification.scores,
          flags: verification.flags,
          recommendations: verification.recommendations
        },
        analysis: {
          faceDetected: verification.checks.faceDetection?.faceCount > 0,
          qualityScore: verification.scores.quality,
          appropriatenessScore: verification.scores.appropriateness,
          uniquenessScore: verification.scores.uniqueness
        }
      }
    });

  } catch (error) {
    console.error('Photo analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze photo'
    });
  }
});

/**
 * Get photo verification statistics
 * GET /api/photos/verification-stats
 */
router.get('/verification-stats', async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('profile.photos');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const photos = user.profile.photos || [];
    const verified = photos.filter(p => p.verified);
    const pending = photos.filter(p => !p.verified);

    const averageScore = verified.length > 0 
      ? verified.reduce((sum, p) => sum + (p.verification?.score || 0), 0) / verified.length
      : 0;

    res.status(200).json({
      success: true,
      message: 'Verification statistics retrieved',
      data: {
        totalPhotos: photos.length,
        verifiedPhotos: verified.length,
        pendingPhotos: pending.length,
        verificationRate: photos.length > 0 ? Math.round((verified.length / photos.length) * 100) : 0,
        averageVerificationScore: Math.round(averageScore * 100),
        profileCompleteness: Math.min(photos.length * 25, 100), // 4 photos = 100%
        recommendations: this.generateProfileRecommendations(photos)
      }
    });

  } catch (error) {
    console.error('Get verification stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get verification statistics'
    });
  }
});

/**
 * Process and enhance existing photo
 * POST /api/photos/:photoId/enhance
 */
router.post('/:photoId/enhance', async (req, res) => {
  try {
    const { photoId } = req.params;
    const { options = {} } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const photo = user.profile.photos.id(photoId);
    if (!photo) {
      return res.status(404).json({
        success: false,
        error: 'Photo not found'
      });
    }

    // Download original photo
    const response = await fetch(photo.url);
    const photoBuffer = await response.buffer();

    // Process with enhancement options
    const processed = await photoService.processPhoto(photoBuffer, {
      resize: options.resize,
      quality: options.quality || 90,
      enhance: options.enhance !== false,
      format: options.format || 'jpeg'
    });

    // Upload enhanced version
    const uploadResult = await cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder: `users/${userId}/photos`,
        public_id: `${photo.publicId}_enhanced`,
        transformation: [{ quality: 'auto:good' }]
      },
      (error, result) => {
        if (error) throw error;
        return result;
      }
    );

    // Update photo URL
    photo.url = uploadResult.secure_url;
    photo.publicId = uploadResult.public_id;
    photo.metadata.enhanced = true;
    photo.metadata.enhancedAt = new Date();

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Photo enhanced successfully',
      data: {
        photoId,
        newUrl: uploadResult.secure_url,
        enhanced: true
      }
    });

  } catch (error) {
    console.error('Photo enhancement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enhance photo'
    });
  }
});

// Helper function for profile recommendations
function generateProfileRecommendations(photos) {
  const recommendations = [];
  
  if (photos.length === 0) {
    recommendations.push('Add your first profile photo to get started');
  } else if (photos.length < 3) {
    recommendations.push('Add more photos to increase your match potential');
  }
  
  const verified = photos.filter(p => p.verified);
  if (verified.length < photos.length) {
    recommendations.push('Some photos need verification - check photo status');
  }
  
  const hasRecent = photos.some(p => 
    new Date() - new Date(p.uploadedAt) < 90 * 24 * 60 * 60 * 1000 // 90 days
  );
  
  if (!hasRecent && photos.length > 0) {
    recommendations.push('Consider adding more recent photos');
  }

  return recommendations;
}

module.exports = router;