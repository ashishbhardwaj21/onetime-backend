const express = require('express');
require('dotenv').config();

const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Minimal server working!' });
});

app.get('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Minimal server running on http://localhost:${PORT}`);
  console.log(`🏥 Test: http://localhost:${PORT}/health`);
});