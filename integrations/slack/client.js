const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const SLACK_API_URL = 'https://slack.com/api/chat.postMessage';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'dummy-slack-token';

/**
 * Sends a diagnostic alert block-kit message to a Slack channel.
 */
async function sendDiagnosisAlert({ channel, repo, branch, commitSha, diagnosis, blame, flakiness, runId }) {
  if (!SLACK_BOT_TOKEN || SLACK_BOT_TOKEN === 'dummy-slack-token') {
    console.warn('Slack bot token not configured. Skipping Slack alert.');
    return null;
  }

  const repoName = repo || 'unknown-repo';
  const branchName = branch || 'main';
  const runUrl = `https://github.com/${repoName}/actions/runs/${runId || ''}`;
  
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `❌ CI Pipeline Failed in ${repoName}`,
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Branch:* \`${branchName}\` | *Commit:* \`${(commitSha || '').substring(0, 7)}\``
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🚨 Root Cause Diagnosis:*\n>${diagnosis.root_cause || diagnosis.summary || 'Unknown failure occurred.'}`
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Type:*\n\`${diagnosis.failure_type || 'unknown'}\``
        },
        {
          type: 'mrkdwn',
          text: `*Confidence:*\n\`${diagnosis.confidence || 0}%\``
        },
        {
          type: 'mrkdwn',
          text: `*Blame Attribution:*\n${blame ? `${blame.author_name} (${blame.blame_confidence}% confidence)` : 'Unassigned'}`
        },
        {
          type: 'mrkdwn',
          text: `*Is Flaky?*\n${flakiness && flakiness.is_flaky ? `⚠️ Yes (${flakiness.flaky_confidence}%)` : 'No'}`
        }
      ]
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*💡 Suggested Fixes:*\n${(diagnosis.fixes || []).map((f, i) => `${i + 1}. ${f}`).join('\n') || 'None suggested.'}`
      }
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Workflow Run',
            emoji: true
          },
          url: runUrl,
          style: 'danger'
        }
      ]
    }
  ];

  try {
    const response = await axios.post(
      SLACK_API_URL,
      {
        channel: channel || process.env.SLACK_CHANNEL_ID || 'general',
        text: `❌ CI build failed in ${repoName} (${branchName})`,
        blocks
      },
      {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (!response.data.ok) {
      throw new Error(`Slack API error: ${response.data.error}`);
    }

    return response.data;
  } catch (error) {
    console.error('Failed to post to Slack:', error.message);
    throw error;
  }
}

module.exports = {
  sendDiagnosisAlert
};
