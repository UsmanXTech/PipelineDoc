const { cancelRollback, approveRollbackNow } = require('../../agents/healer/auto-rollback');
const axios = require('axios');

/**
 * Handles incoming Slack interactive action payloads (e.g. button clicks).
 */
async function handleSlackAction(req, res) {
  try {
    const payloadStr = req.body.payload;
    if (!payloadStr) {
      return res.status(400).send('Missing payload');
    }

    const payload = JSON.parse(payloadStr);
    const action = payload.actions ? payload.actions[0] : null;

    if (!action) {
      return res.status(400).send('No action specified');
    }

    const actionId = action.action_id;
    const deploymentId = action.value;

    let textResponse = '';
    if (actionId === 'cancel_rollback') {
      await cancelRollback(deploymentId);
      textResponse = `❌ *Auto-Rollback Cancelled* by User <@${payload.user.id}>.`;
    } else if (actionId === 'approve_rollback') {
      // Execute immediately (asynchronously)
      approveRollbackNow(deploymentId).catch(err => {
        console.error(`Error in immediate rollback execution: ${err.message}`);
      });
      textResponse = `⚡ *Auto-Rollback Approved* by User <@${payload.user.id}>. Executing rollback...`;
    } else {
      return res.status(400).send('Unknown action_id');
    }

    // Respond to Slack's challenge/acknowledgement immediately
    res.status(200).send();

    // Update the Slack message using response_url
    if (payload.response_url) {
      await axios.post(payload.response_url, {
        replace_original: true,
        text: textResponse,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: textResponse
            }
          }
        ]
      });
    }
  } catch (error) {
    console.error('Error handling Slack action:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

module.exports = {
  handleSlackAction
};
