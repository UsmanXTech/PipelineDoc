const express = require('express');
const router = express.Router();

// POST /api/analysis/rca - Trigger direct log analysis
router.post('/rca', async (req, res) => {
  res.status(501).json({ error: 'RCA trigger endpoint not implemented yet' });
});

module.exports = router;
