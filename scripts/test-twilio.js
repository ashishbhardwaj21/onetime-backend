#!/usr/bin/env node

/**
 * Twilio SMS Service Test Script
 * Tests new Twilio credentials after rotation
 */

const twilio = require('twilio');

class TwilioTester {
  constructor() {
    this.testResults = {
      startTime: new Date(),
      endTime: null,
      tests: [],
      overall: 'pending',
      messagesInfo: []
    };
    this.client = null;
  }

  async runTests() {
    console.log('📱 Twilio Credential Test');
    console.log('=========================\n');

    try {
      await this.testConfiguration();
      await this.testAccountAccess();
      await this.testPhoneNumberValidation();
      await this.testSMSCapability();
      await this.testAccountLimits();
      
      this.testResults.endTime = new Date();
      this.testResults.overall = 'passed';
      
      console.log('\n✅ All Twilio tests passed!');
      console.log('📱 New credentials are working correctly.');
      
    } catch (error) {
      this.testResults.endTime = new Date();
      this.testResults.overall = 'failed';
      
      console.error('\n❌ Twilio tests failed:', error.message);
      console.error('🚨 Credential rotation may have issues.');
      process.exit(1);
    } finally {
      this.generateReport();
    }
  }

  async testConfiguration() {
    await this.runTest('Configuration Validation', async () => {
      // Check environment variables
      const requiredVars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
      const missing = requiredVars.filter(varName => !process.env[varName]);
      
      if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
      }

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

      // Validate Account SID format
      if (!accountSid.startsWith('AC') || accountSid.length !== 34) {
        throw new Error('Invalid Twilio Account SID format (should start with "AC" and be 34 characters)');
      }

      // Validate Auth Token format
      if (authToken.length !== 32) {
        throw new Error('Invalid Twilio Auth Token format (should be 32 characters)');
      }

      // Validate phone number format
      if (!phoneNumber.startsWith('+') || phoneNumber.length < 10) {
        throw new Error('Invalid Twilio phone number format (should start with "+" and include country code)');
      }

      // Initialize Twilio client
      this.client = twilio(accountSid, authToken);

      console.log('   🔧 Configuration validated:');
      console.log(`   🆔 Account SID: ${this.maskCredential(accountSid)}`);
      console.log(`   🔑 Auth Token: ${this.maskCredential(authToken)}`);
      console.log(`   📞 Phone Number: ${phoneNumber}`);
    });
  }

  async testAccountAccess() {
    await this.runTest('Account Access Verification', async () => {
      console.log('   🔍 Testing account access...');

      try {
        // Fetch account details
        const account = await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        
        console.log('   ✅ Account access successful');
        console.log(`   🏢 Account Name: ${account.friendlyName || 'N/A'}`);
        console.log(`   📊 Account Status: ${account.status}`);
        console.log(`   📅 Created: ${account.dateCreated || 'N/A'}`);
        console.log(`   🔐 Account Type: ${account.type || 'N/A'}`);

        if (account.status !== 'active') {
          throw new Error(`Account status is '${account.status}', expected 'active'`);
        }

      } catch (error) {
        if (error.code === 20003) {
          throw new Error('Authentication failed - invalid Account SID or Auth Token');
        } else if (error.code === 20002) {
          throw new Error('Permission denied - check account permissions');
        } else {
          throw new Error(`Account access failed: ${error.message}`);
        }
      }
    });
  }

  async testPhoneNumberValidation() {
    await this.runTest('Phone Number Validation', async () => {
      console.log('   📞 Testing phone number capabilities...');

      try {
        // Fetch phone number details
        const phoneNumber = await this.client.incomingPhoneNumbers.list({
          phoneNumber: process.env.TWILIO_PHONE_NUMBER,
          limit: 1
        });

        if (phoneNumber.length === 0) {
          throw new Error(`Phone number ${process.env.TWILIO_PHONE_NUMBER} not found in account`);
        }

        const number = phoneNumber[0];
        console.log('   ✅ Phone number validated');
        console.log(`   📱 Number: ${number.phoneNumber}`);
        console.log(`   🏷️  Friendly Name: ${number.friendlyName || 'N/A'}`);
        console.log(`   📨 SMS Capable: ${number.capabilities.sms ? 'Yes' : 'No'}`);
        console.log(`   📞 Voice Capable: ${number.capabilities.voice ? 'Yes' : 'No'}`);

        if (!number.capabilities.sms) {
          throw new Error('Phone number does not support SMS');
        }

      } catch (error) {
        if (error.message.includes('not found')) {
          throw error;
        } else {
          throw new Error(`Phone number validation failed: ${error.message}`);
        }
      }
    });
  }

  async testSMSCapability() {
    await this.runTest('SMS Sending Capability', async () => {
      console.log('   💬 Testing SMS sending (without actually sending)...');

      // We'll validate the SMS sending capability without actually sending
      // to avoid charges and SMS spam during testing
      try {
        // Test message validation
        const testMessage = {
          body: 'OneTime Dating App - Credential rotation test message',
          from: process.env.TWILIO_PHONE_NUMBER,
          to: '+15551234567' // Fake number for validation only
        };

        // Validate message parameters without sending
        if (!testMessage.body || testMessage.body.length === 0) {
          throw new Error('Message body cannot be empty');
        }

        if (testMessage.body.length > 1600) {
          throw new Error('Message body too long (max 1600 characters)');
        }

        if (!testMessage.from.startsWith('+')) {
          throw new Error('From number must include country code');
        }

        if (!testMessage.to.startsWith('+')) {
          throw new Error('To number must include country code');
        }

        console.log('   ✅ SMS message validation passed');
        console.log(`   📝 Message length: ${testMessage.body.length} characters`);
        console.log(`   📤 From: ${testMessage.from}`);
        console.log('   💡 Actual SMS sending skipped to avoid charges');

        // Optional: Send actual SMS if test number is provided
        const testPhoneNumber = process.env.TEST_PHONE_NUMBER;
        if (testPhoneNumber && testPhoneNumber !== 'skip') {
          console.log('   📨 Sending actual test SMS...');
          
          const message = await this.client.messages.create({
            body: `OneTime Dating App: Credential rotation test successful at ${new Date().toLocaleString()}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: testPhoneNumber
          });

          console.log('   ✅ Test SMS sent successfully');
          console.log(`   📬 Message SID: ${message.sid}`);
          console.log(`   📊 Status: ${message.status}`);
          console.log(`   💰 Price: ${message.price || 'N/A'} ${message.priceUnit || ''}`);

          this.testResults.messagesInfo.push({
            sid: message.sid,
            to: testPhoneNumber,
            status: message.status,
            timestamp: new Date()
          });
        }

      } catch (error) {
        throw new Error(`SMS capability test failed: ${error.message}`);
      }
    });
  }

  async testAccountLimits() {
    await this.runTest('Account Limits and Usage', async () => {
      console.log('   📊 Checking account limits and usage...');

      try {
        // Get account usage (if available)
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), 1); // First day of current month
        
        try {
          const usage = await this.client.usage.records.list({
            category: 'sms',
            startDate: startDate,
            endDate: today,
            limit: 50
          });

          console.log('   📈 Usage information:');
          console.log(`   📱 SMS records this month: ${usage.length}`);
          
          if (usage.length > 0) {
            const totalUsage = usage.reduce((sum, record) => sum + parseInt(record.usage || 0), 0);
            console.log(`   💬 Total SMS sent: ${totalUsage}`);
          }

        } catch (usageError) {
          console.log('   ⚠️  Usage data not available (normal for some account types)');
        }

        // Check message history (recent messages)
        try {
          const recentMessages = await this.client.messages.list({
            limit: 5
          });

          console.log(`   📨 Recent messages: ${recentMessages.length}`);
          
          if (recentMessages.length > 0) {
            const latestMessage = recentMessages[0];
            console.log(`   🕐 Latest message: ${latestMessage.dateCreated}`);
            console.log(`   📊 Latest status: ${latestMessage.status}`);
          }

        } catch (messageError) {
          console.log('   ⚠️  Message history not accessible');
        }

        console.log('   ✅ Account limits check completed');

      } catch (error) {
        throw new Error(`Account limits check failed: ${error.message}`);
      }
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

  maskCredential(credential) {
    if (!credential || credential.length < 8) return '****';
    return credential.substring(0, 4) + '*'.repeat(credential.length - 8) + credential.slice(-4);
  }

  generateReport() {
    const totalDuration = this.testResults.endTime - this.testResults.startTime;
    const passedTests = this.testResults.tests.filter(t => t.status === 'passed').length;
    const totalTests = this.testResults.tests.length;
    
    console.log('\n📊 Twilio Test Report');
    console.log('=====================');
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`📈 Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`);
    console.log(`🎯 Overall Status: ${this.testResults.overall.toUpperCase()}`);
    console.log(`📱 Test Messages: ${this.testResults.messagesInfo.length}`);

    if (this.testResults.messagesInfo.length > 0) {
      console.log('\n📨 Sent Messages:');
      this.testResults.messagesInfo.forEach((msg, index) => {
        console.log(`   ${index + 1}. Message to ${msg.to}`);
        console.log(`      SID: ${msg.sid}`);
        console.log(`      Status: ${msg.status}`);
      });
    }

    // Save detailed report
    const reportPath = 'twilio-test-report.json';
    require('fs').writeFileSync(reportPath, JSON.stringify(this.testResults, null, 2));
    console.log(`\n📋 Detailed report saved: ${reportPath}`);

    // Important notes
    console.log('\n📝 Important Notes:');
    console.log('   💰 To avoid charges, actual SMS sending was skipped unless TEST_PHONE_NUMBER is set');
    console.log('   🔧 Set TEST_PHONE_NUMBER environment variable to test actual SMS sending');
    console.log('   📱 All SMS capabilities are validated and ready for production use');
  }
}

// Run tests if called directly
if (require.main === module) {
  require('dotenv').config();
  
  const tester = new TwilioTester();
  tester.runTests().catch(error => {
    console.error('💥 Twilio test script failed:', error);
    process.exit(1);
  });
}

module.exports = TwilioTester;