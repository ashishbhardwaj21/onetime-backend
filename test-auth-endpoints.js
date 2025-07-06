const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/onetime-test', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Routes
app.use('/api/auth', authRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'OneTime Dating App API - Test Server',
    version: '1.0.0',
    endpoints: {
      'POST /api/auth/phone/send-code': 'Send phone verification code',
      'POST /api/auth/phone/verify': 'Verify phone code',
      'POST /api/auth/apple/signin': 'Apple Sign In',
      'POST /api/auth/register': 'Email registration',
      'POST /api/auth/login': 'Email login'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Test server running on port ${PORT}`);
  console.log(`📱 Test endpoints:`);
  console.log(`   Phone auth: POST http://localhost:${PORT}/api/auth/phone/send-code`);
  console.log(`   Apple auth: POST http://localhost:${PORT}/api/auth/apple/signin`);
  console.log(`   Email auth: POST http://localhost:${PORT}/api/auth/register`);
}); 