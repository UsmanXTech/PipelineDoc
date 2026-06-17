const express = require('express');
const router = express.Router();
const { pgPool } = require('../../../config/database');

// GET /api/deployments - Get deployments list
router.get('/', async (req, res) => {
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'Database connection not initialized' });
    }
    const result = await pgPool.query('SELECT * FROM deployments ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching deployments:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/deployments/:id/status - Get status of specific deployment
router.get('/:id/status', async (req, res) => {
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'Database connection not initialized' });
    }
    const result = await pgPool.query('SELECT status, strategy, risk_score FROM deployments WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching deployment status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
