/**
 * Jest Configuration for OneTime Backend
 * Comprehensive testing setup with multiple environments
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.js'
  ],
  
  // Test match patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // Specific thresholds for critical components
    './services/SubscriptionService.js': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './services/SecurityFraudDetection.js': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './routes/': {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Files to collect coverage from
  collectCoverageFrom: [
    'services/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**',
    '!**/*.test.js',
    '!**/*.spec.js'
  ],
  
  // Module path mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@models/(.*)$': '<rootDir>/models/$1',
    '^@routes/(.*)$': '<rootDir>/routes/$1',
    '^@middleware/(.*)$': '<rootDir>/middleware/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Test environments for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testEnvironment: 'node'
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testEnvironment: 'node',
      testTimeout: 30000
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testEnvironment: 'node',
      testTimeout: 60000
    }
  ],
  
  // Global timeout
  testTimeout: 15000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Detect open handles
  detectOpenHandles: true,
  forceExit: true,
  
  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Module file extensions
  moduleFileExtensions: [
    'js',
    'json',
    'node'
  ],
  
  // Global variables
  globals: {
    NODE_ENV: 'test'
  },
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ],
    [
      'jest-html-reporters',
      {
        publicPath: './test-results',
        filename: 'jest-report.html',
        expand: true,
        hideIcon: false,
        pageTitle: 'OneTime Backend Test Report'
      }
    ]
  ],
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/build/'
  ],
  
  // Module paths to ignore
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/build/'
  ],
  
  // Error handling
  errorOnDeprecated: true,
  
  // Snapshot serializers
  snapshotSerializers: [
    'jest-serializer-html'
  ],
  
  // Custom matchers
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.js',
    'jest-extended'
  ],
  
  // Maximum workers for parallel execution
  maxWorkers: '50%',
  
  // Cache directory
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Enable coverage collection from untested files
  collectCoverageFrom: [
    'services/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**',
    '!**/*.config.js',
    '!**/dist/**',
    '!**/build/**'
  ],
  
  // Bail after first test failure in CI
  bail: process.env.CI ? 1 : 0,
  
  // Silent mode for CI
  silent: process.env.CI ? true : false,
  
  // Run tests serially in CI for stability
  maxConcurrency: process.env.CI ? 1 : 5
};