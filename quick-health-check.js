#!/usr/bin/env node

/**
 * Quick Health Check
 * Tests if the backend server is running and accessible
 */

const axios = require('axios');

async function quickHealthCheck() {
  const testURLs = [
    'http://localhost:3000',
    'https://onetime-backend.onrender.com',
    'https://onetimedating.me'
  ];

  console.log('🏥 Quick Backend Health Check');
  console.log('=============================\\n');

  for (const url of testURLs) {
    try {
      console.log(`Testing: ${url}`);
      
      const response = await axios.get(`${url}/health`, { timeout: 10000 });
      
      if (response.status === 200) {
        console.log(`✅ ${url} is HEALTHY`);
        console.log(`   Status: ${response.data.status}`);
        console.log(`   Environment: ${response.data.environment}`);
        console.log(`   Database: ${response.data.database?.status || 'Unknown'}`);
        console.log(`   Uptime: ${Math.round(response.data.uptime || 0)}s`);
        
        // If this is working, use it for our tests
        if (response.data.status === 'OK') {
          console.log(`\\n🎯 Using ${url} for integration tests\\n`);
          return url;
        }
      } else {
        console.log(`⚠️  ${url} responded with status ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ ${url} is not responding`);
      console.log(`   Error: ${error.message}`);
    }
    console.log('');
  }

  console.log('❌ No healthy backend found. Please start the backend server.');
  process.exit(1);
}

if (require.main === module) {
  quickHealthCheck().then(url => {
    console.log(`Backend is ready at: ${url}`);
  });
}

module.exports = quickHealthCheck;