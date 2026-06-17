const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const port = process.env.APP_PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Basic Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Import and register routes
const deploymentsRoute = require('./routes/deployments');
const incidentsRoute = require('./routes/incidents');
const analysisRoute = require('./routes/analysis');
const webhooksRoute = require('./routes/webhooks');
const chatRoute = require('./routes/chat');

app.use('/api/deployments', deploymentsRoute);
app.use('/api/incidents', incidentsRoute);
app.use('/api/analysis', analysisRoute);
app.use('/webhooks', webhooksRoute);
app.use('/api/chat', chatRoute);

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start Express Server
app.listen(port, () => {
  console.log(`PipelineDoc API Server listening on port ${port} in ${process.env.NODE_ENV || 'development'} mode.`);
});

module.exports = app;
