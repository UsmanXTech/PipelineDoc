const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../../integrations/github/webhook');
const { handleSlackAction } = require('../../integrations/slack/actions');
const { handleSlackCommand } = require('../../integrations/slack/commands');

// POST /webhooks/github - GitHub webhook receiver
router.post('/github', handleWebhook);

// POST /webhooks/slack/actions - Slack interactive action handler
router.post('/slack/actions', handleSlackAction);

// POST /webhooks/slack/commands - Slack slash commands handler
router.post('/slack/commands', handleSlackCommand);

module.exports = router;
