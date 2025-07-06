#!/usr/bin/env node

/**
 * Cloudinary Connection Test Script
 * Tests new Cloudinary credentials after rotation
 */

const cloudinary = require('cloudinary').v2;
const fs = require('fs');

class CloudinaryTester {
  constructor() {
    this.testResults = {
      startTime: new Date(),
      endTime: null,
      tests: [],
      overall: 'pending',
      uploadedAssets: []
    };
  }

  async runTests() {
    console.log('☁️ Cloudinary Credential Test');
    console.log('============================\n');

    try {
      await this.testConfiguration();
      await this.testConnection();
      await this.testImageUpload();
      await this.testImageTransformation();
      await this.testVideoUpload();
      await this.testAssetManagement();
      
      this.testResults.endTime = new Date();
      this.testResults.overall = 'passed';
      
      console.log('\n✅ All Cloudinary tests passed!');
      console.log('☁️ New credentials are working correctly.');
      
    } catch (error) {
      this.testResults.endTime = new Date();
      this.testResults.overall = 'failed';
      
      console.error('\n❌ Cloudinary tests failed:', error.message);
      console.error('🚨 Credential rotation may have issues.');
      process.exit(1);
    } finally {
      await this.cleanup();
      this.generateReport();
    }
  }

  async testConfiguration() {
    await this.runTest('Configuration Validation', async () => {
      // Check environment variables
      const requiredVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
      const missing = requiredVars.filter(varName => !process.env[varName]);
      
      if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
      }

      // Configure Cloudinary
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });

      console.log('   🏗️  Configuration set:');
      console.log(`   📁 Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
      console.log(`   🔑 API Key: ${this.maskApiKey(process.env.CLOUDINARY_API_KEY)}`);
      console.log(`   🔐 API Secret: ${this.maskSecret(process.env.CLOUDINARY_API_SECRET)}`);

      // Validate credentials format
      if (!/^[a-zA-Z0-9_-]+$/.test(process.env.CLOUDINARY_CLOUD_NAME)) {
        throw new Error('Invalid cloud name format');
      }

      if (!/^\d+$/.test(process.env.CLOUDINARY_API_KEY)) {
        throw new Error('Invalid API key format (should be numeric)');
      }

      if (process.env.CLOUDINARY_API_SECRET.length < 20) {
        throw new Error('API secret appears too short (should be 27+ characters)');
      }
    });
  }

  async testConnection() {
    await this.runTest('API Connection', async () => {
      console.log('   🏓 Testing API connectivity...');
      
      try {
        const result = await cloudinary.api.ping();
        console.log('   ✅ API ping successful');
        console.log(`   📊 Response: ${JSON.stringify(result)}`);
      } catch (error) {
        throw new Error(`API ping failed: ${error.message}`);
      }

      // Test account limits
      console.log('   📋 Checking account usage...');
      try {
        const usage = await cloudinary.api.usage();
        console.log(`   💾 Storage used: ${(usage.storage.used_bytes / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   📸 Images: ${usage.resources.image}`);
        console.log(`   🎬 Videos: ${usage.resources.video}`);
        console.log(`   📊 Transformations: ${usage.transformations.used}`);
      } catch (error) {
        console.log(`   ⚠️  Could not fetch usage data: ${error.message}`);
      }
    });
  }

  async testImageUpload() {
    await this.runTest('Image Upload', async () => {
      console.log('   📸 Testing image upload...');

      // Create a test image (SVG)
      const testImageData = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzQyODVmNCIvPgogIDx0ZXh0IHg9IjEwMCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSJ3aGl0ZSI+T25lVGltZSBUZXN0PC90ZXh0Pgo8L3N2Zz4K';
      
      const uploadOptions = {
        public_id: `test_image_${Date.now()}`,
        folder: 'test',
        resource_type: 'image',
        tags: ['test', 'credential-rotation']
      };

      try {
        const result = await cloudinary.uploader.upload(testImageData, uploadOptions);
        
        console.log(`   ✅ Image uploaded successfully`);
        console.log(`   🆔 Public ID: ${result.public_id}`);
        console.log(`   🔗 URL: ${result.secure_url}`);
        console.log(`   📏 Dimensions: ${result.width}x${result.height}`);
        console.log(`   📦 Size: ${(result.bytes / 1024).toFixed(2)} KB`);
        console.log(`   📅 Created: ${result.created_at}`);

        this.testResults.uploadedAssets.push({
          public_id: result.public_id,
          resource_type: 'image',
          url: result.secure_url
        });

        return result;
      } catch (error) {
        throw new Error(`Image upload failed: ${error.message}`);
      }
    });
  }

  async testImageTransformation() {
    await this.runTest('Image Transformation', async () => {
      console.log('   🔄 Testing image transformations...');

      if (this.testResults.uploadedAssets.length === 0) {
        throw new Error('No uploaded images available for transformation test');
      }

      const testImage = this.testResults.uploadedAssets.find(asset => asset.resource_type === 'image');
      if (!testImage) {
        throw new Error('No test image found for transformation');
      }

      // Test various transformations
      const transformations = [
        { width: 150, height: 150, crop: 'fill' },
        { width: 300, height: 200, crop: 'fit' },
        { quality: 'auto', format: 'webp' },
        { effect: 'blur:300' }
      ];

      for (const [index, transformation] of transformations.entries()) {
        try {
          const transformedUrl = cloudinary.url(testImage.public_id, transformation);
          console.log(`   ✅ Transformation ${index + 1}: ${Object.keys(transformation).join(', ')}`);
          console.log(`     🔗 URL: ${transformedUrl}`);
        } catch (error) {
          throw new Error(`Transformation ${index + 1} failed: ${error.message}`);
        }
      }

      console.log('   🎨 All transformations generated successfully');
    });
  }

  async testVideoUpload() {
    await this.runTest('Video Upload', async () => {
      console.log('   🎬 Testing video upload capability...');

      // Create a minimal test video data URL (1x1 pixel MP4)
      const testVideoData = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAChtZGF0AAACrgYF//+13EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0OCByMTEgNWE4OWM0NDU5YWY5NjE2NDVhOGNlOTFjNTQ3ZGI3NmVhZmYzM2FiNyAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMTQgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz02IGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0yNSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDA=';

      const uploadOptions = {
        public_id: `test_video_${Date.now()}`,
        folder: 'test',
        resource_type: 'video',
        tags: ['test', 'credential-rotation']
      };

      try {
        // Note: This might fail for accounts without video upload capability
        const result = await cloudinary.uploader.upload(testVideoData, uploadOptions);
        
        console.log(`   ✅ Video uploaded successfully`);
        console.log(`   🆔 Public ID: ${result.public_id}`);
        console.log(`   🔗 URL: ${result.secure_url}`);
        console.log(`   ⏱️  Duration: ${result.duration || 'N/A'} seconds`);
        console.log(`   📦 Size: ${(result.bytes / 1024).toFixed(2)} KB`);

        this.testResults.uploadedAssets.push({
          public_id: result.public_id,
          resource_type: 'video',
          url: result.secure_url
        });

      } catch (error) {
        if (error.message.includes('not enabled') || error.message.includes('not allowed')) {
          console.log('   ⚠️  Video upload not enabled for this account (this is normal for free accounts)');
        } else {
          throw new Error(`Video upload failed: ${error.message}`);
        }
      }
    });
  }

  async testAssetManagement() {
    await this.runTest('Asset Management', async () => {
      console.log('   🗂️  Testing asset management operations...');

      if (this.testResults.uploadedAssets.length === 0) {
        console.log('   ⚠️  No assets to manage (skipping management tests)');
        return;
      }

      // Test listing assets
      console.log('   📋 Testing asset listing...');
      try {
        const assets = await cloudinary.api.resources({
          type: 'upload',
          prefix: 'test/',
          max_results: 10
        });
        console.log(`   ✅ Found ${assets.resources.length} assets in test folder`);
      } catch (error) {
        throw new Error(`Asset listing failed: ${error.message}`);
      }

      // Test asset details
      const testAsset = this.testResults.uploadedAssets[0];
      console.log(`   🔍 Testing asset details for: ${testAsset.public_id}`);
      try {
        const details = await cloudinary.api.resource(testAsset.public_id);
        console.log(`   ✅ Asset details retrieved`);
        console.log(`     📅 Created: ${details.created_at}`);
        console.log(`     📊 Format: ${details.format}`);
        console.log(`     📦 Bytes: ${details.bytes}`);
      } catch (error) {
        throw new Error(`Asset details failed: ${error.message}`);
      }

      // Test adding tags
      console.log('   🏷️  Testing tag management...');
      try {
        await cloudinary.api.update(testAsset.public_id, {
          tags: 'test,credential-test,automated-test'
        });
        console.log('   ✅ Tags added successfully');
      } catch (error) {
        throw new Error(`Tag management failed: ${error.message}`);
      }
    });
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test assets...');
    
    for (const asset of this.testResults.uploadedAssets) {
      try {
        await cloudinary.uploader.destroy(asset.public_id, {
          resource_type: asset.resource_type
        });
        console.log(`   🗑️  Deleted: ${asset.public_id}`);
      } catch (error) {
        console.log(`   ⚠️  Could not delete ${asset.public_id}: ${error.message}`);
      }
    }

    // Clean up test folder if empty
    try {
      await cloudinary.api.delete_folder('test');
      console.log('   📁 Cleaned up test folder');
    } catch (error) {
      console.log('   📁 Test folder cleanup not needed or failed');
    }
  }

  async runTest(testName, testFunction) {
    const startTime = Date.now();
    
    try {
      console.log(`\n🔄 Running: ${testName}`);
      console.log('─'.repeat(40));
      
      await testFunction();
      
      const duration = Date.now() - startTime;
      console.log(`✅ ${testName} passed (${duration}ms)`);
      
      this.testResults.tests.push({
        name: testName,
        status: 'passed',
        duration,
        timestamp: new Date()
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ ${testName} failed (${duration}ms):`);
      console.error(`   Error: ${error.message}`);
      
      this.testResults.tests.push({
        name: testName,
        status: 'failed',
        duration,
        error: error.message,
        timestamp: new Date()
      });

      throw error;
    }
  }

  maskApiKey(apiKey) {
    if (!apiKey || apiKey.length < 8) return '****';
    return apiKey.substring(0, 4) + '*'.repeat(apiKey.length - 8) + apiKey.slice(-4);
  }

  maskSecret(secret) {
    if (!secret || secret.length < 8) return '****';
    return secret.substring(0, 4) + '*'.repeat(secret.length - 8) + secret.slice(-4);
  }

  generateReport() {
    const totalDuration = this.testResults.endTime - this.testResults.startTime;
    const passedTests = this.testResults.tests.filter(t => t.status === 'passed').length;
    const totalTests = this.testResults.tests.length;
    
    console.log('\n📊 Cloudinary Test Report');
    console.log('=========================');
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`📈 Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`);
    console.log(`🎯 Overall Status: ${this.testResults.overall.toUpperCase()}`);
    console.log(`📁 Assets Created: ${this.testResults.uploadedAssets.length}`);

    // Save detailed report
    const reportPath = 'cloudinary-test-report.json';
    require('fs').writeFileSync(reportPath, JSON.stringify(this.testResults, null, 2));
    console.log(`\n📋 Detailed report saved: ${reportPath}`);
  }
}

// Run tests if called directly
if (require.main === module) {
  require('dotenv').config();
  
  const tester = new CloudinaryTester();
  tester.runTests().catch(error => {
    console.error('💥 Cloudinary test script failed:', error);
    process.exit(1);
  });
}

module.exports = CloudinaryTester;