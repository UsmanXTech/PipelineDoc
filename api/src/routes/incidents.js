const express = require('express');
const router = express.Router();
const { pgPool } = require('../../../config/database');

// GET /api/incidents - Get incidents list
router.get('/', async (req, res) => {
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'Database connection not initialized' });
    }
    const result = await pgPool.query('SELECT * FROM incidents ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/incidents/:id - Get specific incident detail
router.get('/:id', async (req, res) => {
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'Database connection not initialized' });
    }
    const result = await pgPool.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching incident:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
