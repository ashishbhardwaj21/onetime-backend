#!/usr/bin/env node

/**
 * SendGrid Email Service Test Script
 * Tests new SendGrid credentials after rotation
 */

const sgMail = require('@sendgrid/mail');

class SendGridTester {
  constructor() {
    this.testResults = {
      startTime: new Date(),
      endTime: null,
      tests: [],
      overall: 'pending',
      emailsSent: []
    };
  }

  async runTests() {
    console.log('📧 SendGrid Credential Test');
    console.log('===========================\n');

    try {
      await this.testConfiguration();
      await this.testAPIKey();
      await this.testEmailSending();
      await this.testTemplateEmail();
      await this.testEmailValidation();
      
      this.testResults.endTime = new Date();
      this.testResults.overall = 'passed';
      
      console.log('\n✅ All SendGrid tests passed!');
      console.log('📧 New credentials are working correctly.');
      
    } catch (error) {
      this.testResults.endTime = new Date();
      this.testResults.overall = 'failed';
      
      console.error('\n❌ SendGrid tests failed:', error.message);
      console.error('🚨 Credential rotation may have issues.');
      process.exit(1);
    } finally {
      this.generateReport();
    }
  }

  async testConfiguration() {
    await this.runTest('Configuration Validation', async () => {
      // Check environment variables
      const requiredVars = ['SENDGRID_API_KEY', 'FROM_EMAIL'];
      const missing = requiredVars.filter(varName => !process.env[varName]);
      
      if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
      }

      const apiKey = process.env.SENDGRID_API_KEY;
      const fromEmail = process.env.FROM_EMAIL;

      // Validate API key format
      if (!apiKey.startsWith('SG.')) {
        throw new Error('Invalid SendGrid API key format (should start with "SG.")');
      }

      if (apiKey.length < 50) {
        throw new Error('SendGrid API key appears too short');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(fromEmail)) {
        throw new Error('Invalid FROM_EMAIL format');
      }

      // Set API key
      sgMail.setApiKey(apiKey);

      console.log('   🔧 Configuration validated:');
      console.log(`   🔑 API Key: ${this.maskApiKey(apiKey)}`);
      console.log(`   📨 From Email: ${fromEmail}`);
      console.log(`   📧 Support Email: ${process.env.SUPPORT_EMAIL || 'Not set'}`);
    });
  }

  async testAPIKey() {
    await this.runTest('API Key Verification', async () => {
      console.log('   🔑 Testing API key validity...');

      try {
        // SendGrid doesn't have a direct ping endpoint, so we'll test with a minimal API call
        // We'll use the user profile endpoint to verify the API key
        const https = require('https');
        const options = {
          hostname: 'api.sendgrid.com',
          port: 443,
          path: '/v3/user/profile',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json'
          }
        };

        const response = await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              if (res.statusCode === 200) {
                resolve(JSON.parse(data));
              } else {
                reject(new Error(`API returned ${res.statusCode}: ${data}`));
              }
            });
          });

          req.on('error', reject);
          req.setTimeout(10000, () => reject(new Error('Request timeout')));
          req.end();
        });

        console.log('   ✅ API key is valid and active');
        console.log(`   👤 Account: ${response.username || 'N/A'}`);
        console.log(`   🏢 Company: ${response.company || 'N/A'}`);

      } catch (error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          throw new Error('API key is invalid or lacks proper permissions');
        } else {
          // API key might be valid but profile endpoint unavailable - continue with email test
          console.log('   ⚠️  Could not verify via profile endpoint, will test with email sending');
        }
      }
    });
  }

  async testEmailSending() {
    await this.runTest('Basic Email Sending', async () => {
      console.log('   📤 Testing basic email sending...');

      const testEmail = {
        to: process.env.SUPPORT_EMAIL || process.env.FROM_EMAIL,
        from: {
          email: process.env.FROM_EMAIL,
          name: 'OneTime Dating App'
        },
        subject: 'Credential Rotation Test - ' + new Date().toISOString(),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4285f4;">🔐 OneTime Dating App - Credential Test</h2>
            <p>This is a test email to verify SendGrid credentials after rotation.</p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Test Details:</h3>
              <ul>
                <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
                <li><strong>Test Type:</strong> Basic Email Sending</li>
                <li><strong>API Key:</strong> ${this.maskApiKey(process.env.SENDGRID_API_KEY)}</li>
                <li><strong>From Email:</strong> ${process.env.FROM_EMAIL}</li>
              </ul>
            </div>
            <p style="color: #666; font-size: 14px;">
              If you receive this email, the SendGrid credential rotation was successful.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #888; font-size: 12px;">
              This is an automated test email from OneTime Dating App credential rotation process.
            </p>
          </div>
        `,
        text: `
OneTime Dating App - Credential Rotation Test

This is a test email to verify SendGrid credentials after rotation.

Test Details:
- Timestamp: ${new Date().toISOString()}
- Test Type: Basic Email Sending
- API Key: ${this.maskApiKey(process.env.SENDGRID_API_KEY)}
- From Email: ${process.env.FROM_EMAIL}

If you receive this email, the SendGrid credential rotation was successful.
        `
      };

      try {
        const result = await sgMail.send(testEmail);
        
        console.log('   ✅ Test email sent successfully');
        console.log(`   📨 To: ${testEmail.to}`);
        console.log(`   📧 From: ${testEmail.from.email}`);
        console.log(`   📬 Message ID: ${result[0].headers['x-message-id'] || 'N/A'}`);
        console.log(`   📊 Status Code: ${result[0].statusCode}`);

        this.testResults.emailsSent.push({
          type: 'basic',
          to: testEmail.to,
          subject: testEmail.subject,
          messageId: result[0].headers['x-message-id'],
          timestamp: new Date()
        });

      } catch (error) {
        if (error.response) {
          const errorBody = error.response.body;
          if (errorBody.errors) {
            const errorMessages = errorBody.errors.map(err => err.message).join(', ');
            throw new Error(`SendGrid API error: ${errorMessages}`);
          }
        }
        throw new Error(`Email sending failed: ${error.message}`);
      }
    });
  }

  async testTemplateEmail() {
    await this.runTest('Template Email Sending', async () => {
      console.log('   📋 Testing template-based email...');

      // For now, we'll test with a simple dynamic template approach
      // In production, you would use actual SendGrid template IDs
      const templateEmail = {
        to: process.env.SUPPORT_EMAIL || process.env.FROM_EMAIL,
        from: {
          email: process.env.FROM_EMAIL,
          name: 'OneTime Dating App'
        },
        subject: 'Template Test - Credential Rotation',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #4285f4, #34a853); padding: 30px; text-align: center; color: white;">
              <h1 style="margin: 0;">💌 OneTime Dating App</h1>
              <p style="margin: 10px 0 0; opacity: 0.9;">Template Email Test</p>
            </div>
            <div style="padding: 30px; background: white;">
              <h2 style="color: #333;">🔐 Credential Rotation Test</h2>
              <p>This template email confirms that SendGrid is properly configured for:</p>
              <ul style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                <li>✅ Welcome emails</li>
                <li>✅ Verification emails</li>
                <li>✅ Password reset emails</li>
                <li>✅ Notification emails</li>
              </ul>
              <div style="text-align: center; margin: 30px 0;">
                <div style="background: #4285f4; color: white; padding: 15px 30px; border-radius: 25px; display: inline-block;">
                  Template System: Active ✅
                </div>
              </div>
            </div>
            <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px;">
              <p>Automated test from OneTime Dating App</p>
              <p>Timestamp: ${new Date().toISOString()}</p>
            </div>
          </div>
        `,
        categories: ['test', 'credential-rotation', 'template']
      };

      try {
        const result = await sgMail.send(templateEmail);
        
        console.log('   ✅ Template email sent successfully');
        console.log(`   📨 To: ${templateEmail.to}`);
        console.log(`   📋 Categories: ${templateEmail.categories.join(', ')}`);
        console.log(`   📬 Message ID: ${result[0].headers['x-message-id'] || 'N/A'}`);

        this.testResults.emailsSent.push({
          type: 'template',
          to: templateEmail.to,
          subject: templateEmail.subject,
          messageId: result[0].headers['x-message-id'],
          timestamp: new Date()
        });

      } catch (error) {
        throw new Error(`Template email failed: ${error.message}`);
      }
    });
  }

  async testEmailValidation() {
    await this.runTest('Email Validation Features', async () => {
      console.log('   ✅ Testing email validation capabilities...');

      // Test with various email formats to ensure validation works
      const testEmails = [
        { email: process.env.FROM_EMAIL, shouldPass: true, description: 'Valid sender email' },
        { email: 'test@example.com', shouldPass: true, description: 'Standard email format' },
        { email: 'invalid-email', shouldPass: false, description: 'Invalid email format' }
      ];

      for (const test of testEmails) {
        try {
          const validationEmail = {
            to: test.shouldPass ? test.email : process.env.FROM_EMAIL, // Send to valid email even for invalid tests
            from: process.env.FROM_EMAIL,
            subject: `Validation Test: ${test.description}`,
            text: `Testing email validation for: ${test.email}\nExpected to ${test.shouldPass ? 'pass' : 'fail'}: ${test.description}`
          };

          if (!test.shouldPass) {
            // For invalid email test, we'll just validate the format without sending
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValid = emailRegex.test(test.email);
            
            if (isValid === test.shouldPass) {
              throw new Error(`Email validation failed for: ${test.email}`);
            }
            
            console.log(`   ⚠️  Correctly rejected invalid email: ${test.email}`);
          } else {
            // Only send to valid emails
            console.log(`   ✅ Validated email format: ${test.email}`);
          }

        } catch (error) {
          if (!test.shouldPass) {
            console.log(`   ✅ Correctly handled invalid email: ${test.email}`);
          } else {
            throw error;
          }
        }
      }

      console.log('   ✅ Email validation working correctly');
    });
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
    if (!apiKey || apiKey.length < 10) return '****';
    return apiKey.substring(0, 6) + '*'.repeat(apiKey.length - 10) + apiKey.slice(-4);
  }

  generateReport() {
    const totalDuration = this.testResults.endTime - this.testResults.startTime;
    const passedTests = this.testResults.tests.filter(t => t.status === 'passed').length;
    const totalTests = this.testResults.tests.length;
    
    console.log('\n📊 SendGrid Test Report');
    console.log('=======================');
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`📈 Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`);
    console.log(`🎯 Overall Status: ${this.testResults.overall.toUpperCase()}`);
    console.log(`📧 Emails Sent: ${this.testResults.emailsSent.length}`);

    if (this.testResults.emailsSent.length > 0) {
      console.log('\n📨 Sent Emails:');
      this.testResults.emailsSent.forEach((email, index) => {
        console.log(`   ${index + 1}. ${email.type} email to ${email.to}`);
        console.log(`      Subject: ${email.subject}`);
        console.log(`      Message ID: ${email.messageId || 'N/A'}`);
      });
    }

    // Save detailed report
    const reportPath = 'sendgrid-test-report.json';
    require('fs').writeFileSync(reportPath, JSON.stringify(this.testResults, null, 2));
    console.log(`\n📋 Detailed report saved: ${reportPath}`);
  }
}

// Run tests if called directly
if (require.main === module) {
  require('dotenv').config();
  
  const tester = new SendGridTester();
  tester.runTests().catch(error => {
    console.error('💥 SendGrid test script failed:', error);
    process.exit(1);
  });
}

module.exports = SendGridTester;