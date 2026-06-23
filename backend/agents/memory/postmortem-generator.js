const fs = require('fs');
const path = require('path');
const aiClient = require('../../config/ai-client');
const databaseConfig = require('../../config/database');
const slackClient = require('../../integrations/slack/client');

async function generatePostmortem(incidentId) {
  const pgPool = databaseConfig.pgPool;
  if (!incidentId) {
    return { success: false, reason: 'Incident ID is required' };
  }

  if (!pgPool) {
    return { success: false, reason: 'Database pool not initialized' };
  }

  try {
    // 1. Fetch incident from DB
    const incidentResult = await pgPool.query('SELECT * FROM incidents WHERE id = $1', [incidentId]);
    if (incidentResult.rows.length === 0) {
      return { success: false, reason: `Incident ${incidentId} not found in database` };
    }

    const incident = incidentResult.rows[0];
    
    // Fetch associated deployment details if available
    let deployment = null;
    if (incident.deployment_id) {
      const depResult = await pgPool.query('SELECT * FROM deployments WHERE id = $1', [incident.deployment_id]);
      if (depResult.rows.length > 0) {
        deployment = depResult.rows[0];
      }
    }

    // 2. Format incident timeline context for Claude/Gemini
    const timelineContext = `
Incident ID: ${incident.id}
Failure Type: ${incident.type}
Root Cause: ${incident.root_cause || 'Not specified'}
Created At: ${incident.created_at}
Resolved At: ${incident.resolved_at || 'Not resolved'}
Resolution Status/Details: ${incident.resolution || 'None'}
Raw Logs Sample: ${(incident.raw_logs || '').substring(0, 1000)}

${deployment ? `Deployment Context:
Repo: ${deployment.repo}
Branch: ${deployment.branch}
Commit: ${deployment.commit_sha}
Deployment Status: ${deployment.status}
Deployment Started: ${deployment.started_at}
Deployment Completed: ${deployment.completed_at}` : ''}
`;

    // 3. Ask LLM to generate the Markdown postmortem
    const systemPrompt = `You are a Principal Reliability Engineer.
Generate a structured, professional Postmortem in Markdown based on the incident metadata.
The markdown must contain the following exact sections:
1. **Timeline**: what happened and when
2. **Root cause**: the diagnosis and what triggered the failure
3. **Impact**: duration, error rate, users affected (provide an estimate)
4. **Resolution**: what fixed the issue
5. **Action items**: exactly 3 specific, actionable items to prevent recurrence.

Do not include any chat prefix or suffix. Output only the markdown document.`;

    const result = await aiClient.generateContent({
      system: systemPrompt,
      prompt: timelineContext,
      maxTokens: 1500
    });

    const postmortemMarkdown = result.text;

    // 4. Save to filesytem
    const postmortemDir = path.join(__dirname, '../../postmortems');
    if (!fs.existsSync(postmortemDir)) {
      fs.mkdirSync(postmortemDir, { recursive: true });
    }

    const filePath = path.join(postmortemDir, `postmortem-${incidentId}.md`);
    fs.writeFileSync(filePath, postmortemMarkdown, 'utf8');
    console.log(`Saved postmortem report to ${filePath}`);

    // 5. Post to Slack
    const slackChannel = process.env.SLACK_CHANNEL_ID || 'general';
    const slackMessageText = `📝 *Postmortem Generated* for Incident \`${incidentId}\`\n[View Full Report (Markdown)](file://${filePath})`;
    
    await slackClient.sendSlackMessage({
      channel: slackChannel,
      text: slackMessageText,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📝 *Postmortem Report Generated*\n*Incident:* \`${incidentId}\`\n*Type:* \`${incident.type}\`\n*Status:* Resolved\n\n<file://${filePath}|*View Postmortem Details*>`
          }
        }
      ]
    });

    return { success: true, filePath, markdown: postmortemMarkdown };

  } catch (err) {
    console.error('Failed to generate postmortem:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  generatePostmortem
};
