#!/usr/bin/env node

/**
 * Master Test Runner
 * Executes all integration tests in sequence for comprehensive validation
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class MasterTestRunner {
  constructor() {
    this.testResults = {
      startTime: new Date().toISOString(),
      endTime: null,
      totalDuration: 0,
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };
    
    this.testSuite = [
      {
        name: 'Backend Health Check',
        script: 'quick-health-check.js',
        critical: true,
        description: 'Verify backend server is running and accessible'
      },
      {
        name: 'API Endpoint Validation', 
        script: 'test-api-endpoints.js',
        critical: true,
        description: 'Test all critical API endpoints'
      },
      {
        name: 'iOS Backend Integration',
        script: 'test-ios-backend-integration.js', 
        critical: true,
        description: 'Test iOS services integration with backend'
      },
      {
        name: 'Comprehensive Integration Tests',
        script: 'test-integration.js',
        critical: false,
        description: 'Full system integration testing'
      },
      {
        name: 'End-to-End User Journey',
        script: 'test-end-to-end.js',
        critical: false,
        description: 'Complete user journey testing'
      }
    ];
  }

  async runAllTests() {
    console.log('🧪 OneTime Backend Integration - Master Test Runner');
    console.log('===================================================');
    console.log(`📅 Started: ${this.testResults.startTime}`);
    console.log(`🔢 Total Tests: ${this.testSuite.length}\\n`);

    let continueTests = true;

    for (const test of this.testSuite) {
      if (!continueTests && test.critical) {
        console.log(`⏭️  Skipping critical test due to previous failures: ${test.name}`);
        this.recordTestResult(test.name, 'skipped', 0, 'Skipped due to previous critical failure');
        continue;
      }

      const result = await this.runSingleTest(test);
      
      if (test.critical && !result.passed) {
        console.log(`\\n❌ Critical test failed: ${test.name}`);
        console.log('🛑 Stopping execution of critical tests');
        continueTests = false;
      }
    }

    this.generateFinalReport();
  }

  async runSingleTest(test) {
    console.log(`\\n🔄 Running: ${test.name}`);
    console.log(`📝 Description: ${test.description}`);
    console.log(`📄 Script: ${test.script}`);
    console.log(`⚠️  Critical: ${test.critical ? 'Yes' : 'No'}`);
    console.log('─'.repeat(50));

    const startTime = Date.now();

    try {
      const scriptPath = path.join(__dirname, test.script);
      
      // Check if script exists
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Test script not found: ${scriptPath}`);
      }

      const result = await this.executeScript(scriptPath);
      const duration = Date.now() - startTime;

      if (result.success) {
        console.log(`\\n✅ ${test.name} PASSED (${duration}ms)`);
        this.recordTestResult(test.name, 'passed', duration);
        return { passed: true, duration };
      } else {
        console.log(`\\n❌ ${test.name} FAILED (${duration}ms)`);
        console.log(`Error: ${result.error}`);
        this.recordTestResult(test.name, 'failed', duration, result.error);
        return { passed: false, duration };
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`\\n💥 ${test.name} CRASHED (${duration}ms)`);
      console.log(`Error: ${error.message}`);
      this.recordTestResult(test.name, 'failed', duration, error.message);
      return { passed: false, duration };
    }
  }

  executeScript(scriptPath) {
    return new Promise((resolve) => {
      const child = spawn('node', [scriptPath], {
        stdio: 'pipe',
        cwd: __dirname
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output); // Real-time output
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output); // Real-time error output
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          error: code !== 0 ? `Exit code: ${code}\\n${stderr}` : null,
          stdout,
          stderr
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
          stdout,
          stderr
        });
      });

      // Kill process after 5 minutes if still running
      setTimeout(() => {
        if (!child.killed) {
          child.kill();
          resolve({
            success: false,
            error: 'Test timeout after 5 minutes',
            stdout,
            stderr
          });
        }
      }, 5 * 60 * 1000);
    });
  }

  recordTestResult(name, status, duration, error = null) {
    this.testResults.tests.push({
      name,
      status,
      duration,
      error,
      timestamp: new Date().toISOString()
    });

    this.testResults.summary.total++;
    this.testResults.summary[status]++;
  }

  generateFinalReport() {
    this.testResults.endTime = new Date().toISOString();
    this.testResults.totalDuration = this.testResults.tests.reduce((sum, test) => sum + test.duration, 0);

    console.log('\\n\\n📊 FINAL TEST RESULTS');
    console.log('=====================');
    
    // Summary statistics
    const summary = this.testResults.summary;
    console.log(`✅ Passed: ${summary.passed}/${summary.total}`);
    console.log(`❌ Failed: ${summary.failed}/${summary.total}`);
    console.log(`⏭️  Skipped: ${summary.skipped}/${summary.total}`);
    console.log(`⏱️  Total Duration: ${(this.testResults.totalDuration / 1000).toFixed(2)}s`);
    console.log(`📈 Success Rate: ${((summary.passed / summary.total) * 100).toFixed(1)}%`);

    // Detailed results
    console.log('\\n📝 Detailed Results:');
    console.log('─'.repeat(70));
    
    this.testResults.tests.forEach((test, index) => {
      const statusIcon = {
        'passed': '✅',
        'failed': '❌',
        'skipped': '⏭️'
      }[test.status];
      
      const duration = `${test.duration}ms`.padStart(8);
      console.log(`${statusIcon} ${(index + 1).toString().padStart(2)}. ${test.name.padEnd(30)} ${duration}`);
      
      if (test.error && test.status === 'failed') {
        console.log(`     Error: ${test.error.split('\\n')[0]}`); // First line of error
      }
    });

    // Save detailed report
    const reportPath = 'master-test-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(this.testResults, null, 2));
    console.log(`\\n📋 Detailed report saved: ${reportPath}`);

    // Final assessment
    console.log('\\n🎯 INTEGRATION STATUS:');
    
    if (summary.failed === 0) {
      console.log('🎉 ALL TESTS PASSED - iOS backend integration is SUCCESSFUL!');
      console.log('✅ Ready for production deployment');
    } else if (summary.passed >= summary.failed) {
      console.log('⚠️  PARTIAL SUCCESS - Some tests failed but core functionality works');
      console.log('🔧 Review failed tests and address critical issues');
    } else {
      console.log('❌ INTEGRATION FAILED - Critical issues detected');
      console.log('🛠️  Major fixes required before deployment');
    }

    // Exit code based on results
    if (this.testResults.tests.some(test => test.status === 'failed')) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

// Run the master test suite
if (require.main === module) {
  const runner = new MasterTestRunner();
  runner.runAllTests().catch(error => {
    console.error('💥 Master test runner crashed:', error);
    process.exit(1);
  });
}

module.exports = MasterTestRunner;