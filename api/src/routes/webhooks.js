const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../../../integrations/github/webhook');

// POST /webhooks/github - GitHub webhook receiver
router.post('/github', handleWebhook);

module.exports = router;
