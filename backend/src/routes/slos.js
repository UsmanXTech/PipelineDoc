const express = require('express');
const router = express.Router();
const { checkSLOs } = require('../../agents/monitor/slo-tracker');

// GET /api/slos - Returns all SLOs with compliance percentage
router.get('/', async (req, res) => {
  try {
    const report = await checkSLOs();
    res.json(report.results);
  } catch (error) {
    console.error('Error fetching SLO status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
