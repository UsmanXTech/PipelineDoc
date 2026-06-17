const express = require('express');
const router = express.Router();

// POST /webhooks/github - GitHub webhook receiver
router.post('/github', (req, res) => {
  res.json({ message: 'Webhook receiver placeholder' });
});

module.exports = router;
