#!/usr/bin/env node

const { spawn } = require('child_process');
const axios = require('axios');

console.log('🚀 Quick Server Test...');

// Start server
const server = spawn('node', ['server-prod-simple.js'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe']
});

let serverOutput = '';
let serverStarted = false;

server.stdout.on('data', (data) => {
  const output = data.toString();
  serverOutput += output;
  console.log(output.trim());
  
  if (output.includes('OneTime Production Server running')) {
    serverStarted = true;
    setTimeout(testServer, 2000);
  }
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

server.on('close', (code) => {
  console.log(`Server exited with code ${code}`);
});

async function testServer() {
  try {
    console.log('\n🔍 Testing health endpoint...');
    const response = await axios.get('http://localhost:3000/health');
    console.log('✅ Health check passed:', response.data);
    
    console.log('\n🧪 Running messaging test...');
    const MessagingTester = require('./test-messaging.js');
    const tester = new MessagingTester();
    
    await tester.runTests();
    console.log('✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    console.log('\n🛑 Stopping server...');
    server.kill();
    process.exit(0);
  }
}

// Kill server after 60 seconds if not started
setTimeout(() => {
  if (!serverStarted) {
    console.log('❌ Server failed to start within 60 seconds');
    server.kill();
    process.exit(1);
  }
}, 60000);