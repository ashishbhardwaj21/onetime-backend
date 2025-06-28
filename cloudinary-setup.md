# Cloudinary Production Setup Guide

## ☁️ Setting Up Cloudinary for OneTime Dating App Image Storage

### Overview
Cloudinary provides cloud-based image and video management for the OneTime Dating App, handling profile photos, image optimization, transformations, and CDN delivery.

### Step 1: Create Cloudinary Account

1. **Visit Cloudinary**: Go to [https://cloudinary.com](https://cloudinary.com)
2. **Sign Up**: Create a free account
3. **Plan Selection**: 
   - **Free Plan**: 25GB storage, 25GB bandwidth (good for testing)
   - **Plus Plan**: $89/month for production apps
   - **Advanced Plan**: $224/month for high-volume apps

### Step 2: Get Your Credentials

1. **Dashboard**: Log into your Cloudinary dashboard
2. **Account Details**: Find your credentials in the dashboard:
   - **Cloud Name**: Your unique cloud identifier
   - **API Key**: Public key for API access
   - **API Secret**: Private key (keep secure!)

Example credentials format:
```
Cloud Name: democloud
API Key: 123456789012345
API Secret: abcdef123456789_ABCDEF123456789
```

### Step 3: Configure Production Settings

#### Security Settings:
1. **Go to Settings → Security**
2. **Enable the following**:
   - ✅ **Strict transformations**: Prevent unauthorized transformations
   - ✅ **Secure URLs**: Use HTTPS for all image URLs
   - ✅ **Private CDN**: For additional security (paid plans)

#### Upload Settings:
1. **Go to Settings → Upload**
2. **Configure Upload Presets**:
   - Create preset for profile photos
   - Set size limits and quality settings
   - Configure automatic transformations

#### Media Management:
1. **Folder Structure**: Organize uploads by:
   - `profile-photos/` - User profile images
   - `verification-photos/` - Photo verification images
   - `activity-images/` - Activity suggestion images

### Step 4: Create Upload Presets

#### Profile Photo Preset:
```javascript
// Preset Name: profile-photos
{
  "folder": "profile-photos",
  "resource_type": "image",
  "format": "jpg",
  "quality": "auto:good",
  "fetch_format": "auto",
  "width": 800,
  "height": 800,
  "crop": "limit",
  "flags": ["progressive"],
  "allowed_formats": ["jpg", "png", "webp"],
  "max_bytes": 10485760, // 10MB
  "tags": ["profile", "user-generated"]
}
```

#### Verification Photo Preset:
```javascript
// Preset Name: verification-photos
{
  "folder": "verification-photos",
  "resource_type": "image",
  "format": "jpg",
  "quality": "auto:best",
  "width": 600,
  "height": 600,
  "crop": "limit",
  "flags": ["progressive"],
  "allowed_formats": ["jpg", "png"],
  "max_bytes": 5242880, // 5MB
  "tags": ["verification", "moderation"]
}
```

### Step 5: Configure Auto-Moderation

#### Content Moderation:
1. **Go to Add-ons → Content Moderation**
2. **Enable**:
   - **AWS Rekognition**: Detect inappropriate content
   - **Google Vision**: Additional content analysis
   - **Manual Moderation Queue**: For human review

#### Moderation Workflow:
```javascript
// Auto-moderation configuration
{
  "moderation": "aws_rek",
  "notification_url": "https://api.onetime.app/webhooks/cloudinary/moderation",
  "auto_tagging": 95, // Confidence threshold
  "categorization": "google_tagging",
  "detection": "adv_face" // Advanced face detection
}
```

### Step 6: Image Transformation Strategy

#### Responsive Images:
```javascript
// Create multiple sizes for different devices
const transformations = {
  thumbnail: "w_150,h_150,c_fill,q_auto,f_auto",
  small: "w_300,h_300,c_limit,q_auto,f_auto",
  medium: "w_600,h_600,c_limit,q_auto,f_auto",
  large: "w_1200,h_1200,c_limit,q_auto,f_auto"
};
```

#### Profile Photo Transformations:
```javascript
// Automatic optimizations for profile photos
const profileTransformations = {
  // Smart crop to focus on faces
  smartCrop: "w_400,h_400,c_fill,g_face,q_auto,f_auto",
  
  // Background removal for verification
  backgroundRemoval: "w_400,h_400,c_fill,e_background_removal",
  
  // Face detection and enhancement
  faceEnhancement: "w_400,h_400,c_fill,g_face,e_enhance:indoor:80",
  
  // Watermark for verification photos
  watermark: "l_text:Arial_20:OneTime,g_south_east,x_10,y_10,o_30"
};
```

### Step 7: Integration with OneTime App

#### Update Upload Middleware:
```javascript
// middleware/upload.js
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true // Force HTTPS
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'onetime-profiles',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [
      { width: 800, height: 800, crop: 'limit', quality: 'auto:good' },
      { fetch_format: 'auto' }
    ],
    public_id: (req, file) => {
      const timestamp = Date.now();
      const userId = req.user?._id || 'anonymous';
      return `user_${userId}_${timestamp}`;
    },
    // Use upload preset for consistent settings
    upload_preset: 'profile-photos',
    // Enable moderation
    moderation: 'aws_rek'
  },
});
```

#### Image URL Generation:
```javascript
// Helper function for generating optimized image URLs
const getOptimizedImageUrl = (publicId, options = {}) => {
  const defaultOptions = {
    width: 400,
    height: 400,
    crop: 'fill',
    quality: 'auto',
    fetch_format: 'auto',
    secure: true
  };
  
  const finalOptions = { ...defaultOptions, ...options };
  return cloudinary.url(publicId, finalOptions);
};

// Generate responsive image set
const getResponsiveImageUrls = (publicId) => {
  return {
    thumbnail: getOptimizedImageUrl(publicId, { width: 150, height: 150 }),
    small: getOptimizedImageUrl(publicId, { width: 300, height: 300 }),
    medium: getOptimizedImageUrl(publicId, { width: 600, height: 600 }),
    large: getOptimizedImageUrl(publicId, { width: 1200, height: 1200 })
  };
};
```

### Step 8: Webhook Configuration

#### Set up Cloudinary Webhooks:
1. **Go to Settings → Webhooks**
2. **Add Notification URL**: `https://api.onetime.app/webhooks/cloudinary`
3. **Select Events**:
   - Upload completion
   - Moderation results
   - Transformation completion

#### Webhook Handler:
```javascript
// routes/webhooks.js
app.post('/webhooks/cloudinary', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const event = req.body;
    
    switch(event.notification_type) {
      case 'upload':
        await handleImageUpload(event);
        break;
      case 'moderation':
        await handleModerationResult(event);
        break;
      default:
        console.log('Unknown webhook event:', event.notification_type);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

async function handleModerationResult(event) {
  const { public_id, moderation } = event;
  
  // Update user photo status based on moderation results
  if (moderation.status === 'approved') {
    await approveUserPhoto(public_id);
  } else if (moderation.status === 'rejected') {
    await rejectUserPhoto(public_id, moderation.reason);
  }
}
```

### Step 9: Performance Optimization

#### CDN Configuration:
1. **Enable Auto CDN**: Automatic global content delivery
2. **Custom CNAME**: Use your own domain (premium feature)
3. **Gzip Compression**: Enabled by default
4. **HTTP/2**: Enabled for faster loading

#### Caching Strategy:
```javascript
// Set cache headers for different image types
const cacheConfig = {
  profilePhotos: {
    maxAge: 86400, // 24 hours
    staleWhileRevalidate: 3600 // 1 hour
  },
  thumbnails: {
    maxAge: 604800, // 7 days
    staleWhileRevalidate: 86400 // 24 hours
  }
};
```

### Step 10: Monitoring and Analytics

#### Cloudinary Analytics:
1. **Usage Dashboard**: Monitor bandwidth and storage
2. **Transformation Analytics**: Track most used transformations
3. **Error Monitoring**: Track failed uploads and transformations

#### Custom Monitoring:
```javascript
// Track image performance metrics
const trackImageMetrics = async (publicId, operation) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    
    // Log metrics
    console.log('Image Metrics:', {
      publicId,
      operation,
      bytes: result.bytes,
      format: result.format,
      width: result.width,
      height: result.height,
      created: result.created_at
    });
    
    // Send to analytics service
    analytics.track('image_operation', {
      operation,
      file_size: result.bytes,
      format: result.format
    });
  } catch (error) {
    console.error('Metrics tracking error:', error);
  }
};
```

### Step 11: Security Best Practices

#### API Security:
```javascript
// Secure API calls with signed requests
const generateSignature = (params, apiSecret) => {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  return crypto
    .createHash('sha1')
    .update(sortedParams + apiSecret)
    .digest('hex');
};

// Validate webhook signatures
const validateWebhookSignature = (body, signature, secret) => {
  const expectedSignature = crypto
    .createHash('sha1')
    .update(body + secret)
    .digest('hex');
  
  return signature === expectedSignature;
};
```

#### Access Control:
1. **Signed URLs**: For sensitive images
2. **Token-based Authentication**: For API access
3. **Role-based Permissions**: Different access levels
4. **Rate Limiting**: Prevent abuse

### Step 12: Backup and Disaster Recovery

#### Backup Strategy:
1. **Auto-backup**: Enable automatic backups (premium)
2. **Multiple Regions**: Store copies in different regions
3. **Version Control**: Keep multiple versions of images
4. **Export Tools**: Regular exports for compliance

#### Recovery Plan:
```javascript
// Backup critical images
const backupCriticalImages = async () => {
  try {
    // Get all verified profile photos
    const resources = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'profile-photos/',
      max_results: 500,
      tags: ['verified']
    });
    
    // Create backup manifest
    const backupManifest = {
      timestamp: new Date().toISOString(),
      count: resources.resources.length,
      images: resources.resources.map(r => ({
        public_id: r.public_id,
        secure_url: r.secure_url,
        bytes: r.bytes,
        created_at: r.created_at
      }))
    };
    
    // Store manifest
    fs.writeFileSync(
      `backups/cloudinary-${Date.now()}.json`,
      JSON.stringify(backupManifest, null, 2)
    );
    
    console.log(`Backup completed: ${resources.resources.length} images`);
  } catch (error) {
    console.error('Backup failed:', error);
  }
};
```

### Environment Configuration

Add to your `.env.production` file:
```bash
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### Production Deployment Checklist:

- [ ] **Account Setup**: Cloudinary account created and verified
- [ ] **Plan Selection**: Appropriate plan selected for production volume
- [ ] **Security Settings**: Strict transformations and secure URLs enabled
- [ ] **Upload Presets**: Profile photo and verification presets configured
- [ ] **Content Moderation**: Auto-moderation enabled and configured
- [ ] **Webhooks**: Notification URLs configured for important events
- [ ] **Performance**: CDN and caching optimizations enabled
- [ ] **Monitoring**: Usage monitoring and alerts set up
- [ ] **Backup**: Backup strategy implemented
- [ ] **Testing**: Upload and transformation workflows tested
- [ ] **Documentation**: Integration documented for team

### 🚨 Security Reminders:

1. **API Secret Protection**: Never expose API secret in client-side code
2. **Signed Uploads**: Use signed uploads for security-sensitive uploads
3. **Webhook Validation**: Always validate webhook signatures
4. **Access Logging**: Monitor API access for suspicious activity
5. **Regular Audits**: Review uploaded content and access patterns
6. **Compliance**: Ensure GDPR/privacy compliance for user images

### Support and Resources:

- **Cloudinary Documentation**: https://cloudinary.com/documentation
- **API Reference**: https://cloudinary.com/documentation/image_upload_api_reference
- **Community Forum**: https://community.cloudinary.com/
- **Support**: Available via dashboard for paid plans

### Next Steps:

1. ✅ Complete Cloudinary setup and configuration
2. 🔄 Test image upload and transformation workflows
3. 📊 Set up monitoring and alerts
4. 📧 Configure email service for notifications
5. 🔒 Set up SSL certificates
6. 🚀 Deploy application with image storage integration