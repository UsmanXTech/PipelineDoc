const express = require('express');
const router = express.Router();
const databaseConfig = require('../../../config/database');
const axios = require('axios');

// Database Connection Health Check
router.get('/db', async (req, res) => {
  const pgPool = databaseConfig.pgPool;
  if (!pgPool) {
    return res.status(500).json({ db: 'disconnected', error: 'No database connection configured' });
  }
  try {
    await pgPool.query('SELECT 1');
    res.status(200).json({ db: 'connected' });
  } catch (err) {
    res.status(500).json({ db: 'disconnected', error: err.message });
  }
});

// Redis Connection Health Check
router.get('/redis', async (req, res) => {
  const redisClient = databaseConfig.redisClient;
  if (!redisClient) {
    return res.status(500).json({ redis: 'disconnected', error: 'No Redis connection configured' });
  }
  try {
    await redisClient.ping();
    res.status(200).json({ redis: 'connected' });
  } catch (err) {
    res.status(500).json({ redis: 'disconnected', error: err.message });
  }
});

// Qdrant Vector DB Health Check
router.get('/qdrant', async (req, res) => {
  const vectorDbUrl = databaseConfig.vectorDbUrl;
  if (!vectorDbUrl) {
    return res.status(500).json({ qdrant: 'disconnected', error: 'No Qdrant URL configured' });
  }
  try {
    const headers = {};
    if (process.env.QDRANT_API_KEY) {
      headers['api-key'] = process.env.QDRANT_API_KEY;
    }
    await axios.get(`${vectorDbUrl}/collections`, { headers, timeout: 5000 });
    res.status(200).json({ qdrant: 'connected' });
  } catch (err) {
    res.status(500).json({ qdrant: 'disconnected', error: err.message });
  }
});

module.exports = router;
