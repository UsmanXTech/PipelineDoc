const express = require('express');
const router = express.Router();
const { getPrometheusText } = require('../services/metrics-store');

// GET /metrics - Exposes Prometheus telemetry
router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.end(getPrometheusText());
});

module.exports = router;
