const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const logger = require('./utils/logger');
const database = require('./utils/database');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const discoveryRoutes = require('./routes/discovery');
const matchRoutes = require('./routes/matches');
const messageRoutes = require('./routes/messages');
const activityRoutes = require('./routes/activities');
const adminRoutes = require('./routes/admin');

// Import socket handlers
const { authenticateSocket, handleConnection } = require('./socketHandlers');

const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization"],
    credentials: true
  }
});

// Make io available throughout the app
app.set('io', io);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression middleware
app.use(compression());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8080',
      'https://onetime.app',
      'https://staging.onetime.app'
    ];
    
    // Allow requests with no origin (mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    error: 'Too many authentication attempts, please try again later.'
  }
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const connectionStatus = database.getConnectionStatus();
    
    const health = {
      status: connectionStatus.isConnected ? 'OK' : 'ERROR',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      database: {
        status: connectionStatus.isConnected ? 'connected' : 'disconnected',
        connection: connectionStatus.isConnected,
        host: connectionStatus.host,
        database: connectionStatus.database
      },
      memory: process.memoryUsage(),
      system: {
        platform: process.platform,
        nodeVersion: process.version
      }
    };
    
    const statusCode = health.status === 'OK' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message,
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/admin', adminRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'OneTime Dating App API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      users: '/api/users',
      discovery: '/api/discovery',
      matches: '/api/matches',
      messages: '/api/messages',
      activities: '/api/activities',
      admin: '/api/admin'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Error handling middleware
app.use(errorHandler);

// Socket.io connection handling
io.use(authenticateSocket);
io.on('connection', handleConnection(io));

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('Received shutdown signal, closing server gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    database.disconnect().then(() => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    }).catch((error) => {
      logger.error('Error closing database connection:', error);
      process.exit(1);
    });
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Database connection and server startup
const startServer = async () => {
  try {
    // Connect to MongoDB
    await database.connect();
    
    // Run cleanup on startup (optional)
    if (process.env.AUTO_CLEANUP_EXPIRED_TOKENS === 'true') {
      setTimeout(async () => {
        try {
          await database.cleanupExpiredData();
        } catch (error) {
          logger.warn('Cleanup warning:', error.message);
        }
      }, 30000);
    }
    
    // Start server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      logger.info(`🚀 OneTime Backend Server running on port ${PORT}`);
      logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Health Check: http://localhost:${PORT}/health`);
      logger.info(`📡 WebSocket: ws://localhost:${PORT}`);
      logger.info(`🗄️  Database: ${database.getConnectionStatus().database}`);
    });
    
  } catch (error) {
    logger.error('Server startup failed:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;