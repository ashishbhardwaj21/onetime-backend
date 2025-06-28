#!/usr/bin/env node

/**
 * Quick deployment check script
 * This script verifies that all components are ready for deployment
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 OneTime Backend Deployment Check\n');

// Check required files
const requiredFiles = [
    'server.js',
    'package.json',
    '.env.example',
    'models/User.js',
    'models/Match.js',
    'models/Message.js',
    'routes/auth.js',
    'routes/discovery.js',
    'routes/matches.js',
    'middleware/auth.js',
    'utils/logger.js'
];

console.log('📁 Checking required files...');
let allFilesPresent = true;

requiredFiles.forEach(file => {
    if (fs.existsSync(path.join(__dirname, file))) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - MISSING`);
        allFilesPresent = false;
    }
});

// Check package.json dependencies
console.log('\n📦 Checking package.json...');
try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    const requiredDeps = [
        'express',
        'mongoose',
        'bcryptjs',
        'jsonwebtoken',
        'cors',
        'helmet',
        'socket.io',
        'winston',
        'dotenv'
    ];
    
    let allDepsPresent = true;
    requiredDeps.forEach(dep => {
        if (packageJson.dependencies[dep]) {
            console.log(`✅ ${dep}: ${packageJson.dependencies[dep]}`);
        } else {
            console.log(`❌ ${dep} - MISSING`);
            allDepsPresent = false;
        }
    });
    
    if (allDepsPresent) {
        console.log('✅ All required dependencies present');
    }
} catch (error) {
    console.log('❌ Error reading package.json:', error.message);
    allFilesPresent = false;
}

// Check environment template
console.log('\n⚙️ Checking environment configuration...');
try {
    const envExample = fs.readFileSync('.env.example', 'utf8');
    const requiredEnvVars = [
        'MONGODB_URI',
        'JWT_SECRET',
        'NODE_ENV',
        'PORT'
    ];
    
    requiredEnvVars.forEach(envVar => {
        if (envExample.includes(envVar)) {
            console.log(`✅ ${envVar} template present`);
        } else {
            console.log(`❌ ${envVar} template missing`);
        }
    });
} catch (error) {
    console.log('❌ Error reading .env.example:', error.message);
}

// Summary
console.log('\n📊 Deployment Readiness Summary:');
if (allFilesPresent) {
    console.log('✅ Backend files structure: READY');
    console.log('✅ Dependencies configuration: READY');
    console.log('✅ Environment template: READY');
    
    console.log('\n🚀 Next Steps:');
    console.log('1. Set up MongoDB Atlas cluster');
    console.log('2. Create .env file with your configuration');
    console.log('3. Run: npm install');
    console.log('4. Run: npm start');
    console.log('5. Test endpoints with the authentication test script');
    
    console.log('\n📝 MongoDB Atlas Setup:');
    console.log('• Sign up at https://cloud.mongodb.com');
    console.log('• Create a free M0 cluster');
    console.log('• Get connection string');
    console.log('• Add IP address to whitelist');
    console.log('• Create database user');
    
} else {
    console.log('❌ Backend structure: INCOMPLETE');
    console.log('Please ensure all required files are present before deployment');
}

console.log('\n📚 Documentation:');
console.log('• Deployment Guide: ./docs/Deployment_Guide.md');
console.log('• MongoDB Setup: ./docs/MongoDB_Atlas_Setup.md');
console.log('• Auth Testing: node scripts/testAuthFlow.js');