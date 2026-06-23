const axios = require('axios');
const databaseConfig = require('../../config/database');
const anthropic = require('../../config/ai-client');

const toolsList = [
  {
    name: 'get_recent_deployments',
    description: 'Get the last 10 deployments with their status',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_incident',
    description: 'Get full details of a specific incident by ID',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The UUID of the incident' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_slo_status',
    description: 'Get the current status and compliance of all Service Level Objectives (SLOs)',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'trigger_deploy',
    description: 'Trigger a new deployment for a service/repository',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'The repository name' },
        branch: { type: 'string', description: 'The branch name to deploy' },
        strategy: { type: 'string', description: 'The deployment strategy (rolling, canary, blue/green, maintenance window)' }
      },
      required: ['repo', 'branch']
    }
  },
  {
    name: 'trigger_rollback',
    description: 'Trigger a rollback for a deployment',
    input_schema: {
      type: 'object',
      properties: {
        deployment_id: { type: 'string', description: 'The UUID of the deployment to roll back' }
      },
      required: ['deployment_id']
    }
  },
  {
    name: 'get_risk_score',
    description: 'Get the gate/risk score for a pull request (PR)',
    input_schema: {
      type: 'object',
      properties: {
        pr_number: { type: 'number', description: 'The pull request number' }
      },
      required: ['pr_number']
    }
  }
];

async function executeTool(name, input) {
  const pgPool = databaseConfig.pgPool;

  switch (name) {
    case 'get_recent_deployments': {
      if (!pgPool) return [];
      const result = await pgPool.query('SELECT id, repo, branch, commit_sha, status, risk_score, strategy, started_at, completed_at, created_at FROM deployments ORDER BY created_at DESC LIMIT 10');
      return result.rows;
    }
    case 'get_incident': {
      if (!pgPool) return null;
      const result = await pgPool.query('SELECT * FROM incidents WHERE id = $1', [input.id]);
      return result.rows[0] || null;
    }
    case 'get_slo_status': {
      const { checkSLOs } = require('../../agents/monitor/slo-tracker');
      const report = await checkSLOs();
      return report.results;
    }
    case 'trigger_deploy': {
      const repo = input.repo;
      const branch = input.branch;
      const strategy = input.strategy || 'rolling';

      if (!pgPool) {
        return { success: true, deploymentId: 'mock-deploy-id', status: 'running', strategy };
      }

      const commitSha = 'manual-' + Math.random().toString(36).substring(2, 10);
      const insertQuery = `
        INSERT INTO deployments (repo, branch, commit_sha, status, strategy, started_at)
        VALUES ($1, $2, $3, 'running', $4, NOW())
        RETURNING id;
      `;
      const insertResult = await pgPool.query(insertQuery, [repo, branch, commitSha, strategy]);
      const deploymentId = insertResult.rows[0].id;

      // Generate default rollback plan
      try {
        const { generateRollbackPlan } = require('../../agents/planner/rollback-planner');
        await generateRollbackPlan({
          deploymentId,
          repo,
          previousCommitSha: 'prev-sha-123',
          hasDbMigration: strategy === 'maintenance window'
        });
      } catch (err) {
        console.error('Failed to generate rollback plan in manual trigger:', err.message);
      }

      const { selectStrategy } = require('../../agents/planner/strategy-selector');
      const strategyPlan = selectStrategy({
        riskScore: 0,
        hasDbMigration: strategy === 'maintenance window'
      });
      strategyPlan.strategy = strategy;

      const { executeDeployment } = require('../../agents/planner/deploy-coordinator');
      executeDeployment(deploymentId, strategyPlan, {
        pollIntervalMs: process.env.NODE_ENV === 'test' ? 5 : 15000
      }).catch(err => {
        console.error(`Error executing deployment ${deploymentId}:`, err);
      });

      return { success: true, deploymentId, status: 'running', strategy: strategyPlan.strategy };
    }
    case 'trigger_rollback': {
      const deploymentId = input.deployment_id;
      if (!pgPool) {
        return { success: true, deploymentId, status: 'rolling_back' };
      }

      const { executeRollback } = require('../../agents/planner/deploy-coordinator');
      executeRollback(deploymentId).catch(err => {
        console.error(`Error executing rollback for ${deploymentId}:`, err);
      });

      return { success: true, deploymentId, status: 'rolling_back' };
    }
    case 'get_risk_score': {
      const prNumber = input.pr_number;
      const githubClient = require('../github/client');
      const { evaluateGate } = require('../../agents/gatekeeper/gate-decision');

      const owner = process.env.GITHUB_OWNER || 'owner';
      const repo = process.env.GITHUB_REPO || 'pipelinedoc';

      let diff = 'diff --git a/src/index.js b/src/index.js\n+console.log("hello");';
      let files = [{ path: 'src/index.js' }];
      let authorEmail = 'developer@example.com';

      try {
        const [prDetails, prDiff, prFiles] = await Promise.all([
          githubClient.getPRDetails(owner, repo, prNumber),
          githubClient.getPRDiff(owner, repo, prNumber),
          githubClient.getPRFiles(owner, repo, prNumber)
        ]);
        diff = prDiff || diff;
        files = prFiles.map(f => ({ path: f.filename })) || files;
        authorEmail = prDetails.user?.email || prDetails.commit?.author?.email || authorEmail;
      } catch (err) {
        console.warn(`Could not fetch GitHub PR #${prNumber} info, using fallback:`, err.message);
      }

      const report = await evaluateGate({ rawDiff: diff, files, authorEmail });
      return { pr_number: prNumber, risk_score: report.risk_score, decision: report.decision, reason: report.reason };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function postToResponseUrl(url, payload) {
  try {
    await axios.post(url, payload);
  } catch (err) {
    console.error('Failed to post to Slack response_url:', err.message);
  }
}

async function processCommand(text, response_url, user_id) {
  const args = text ? text.trim().split(/\s+/) : [];
  const subCommand = args[0] ? args[0].toLowerCase() : '';

  switch (subCommand) {
    case 'status': {
      const pgPool = databaseConfig.pgPool;
      let deploymentsText = 'No recent deployments found.';
      if (pgPool) {
        try {
          const result = await pgPool.query('SELECT repo, branch, status, created_at FROM deployments ORDER BY created_at DESC LIMIT 5');
          if (result.rows.length > 0) {
            deploymentsText = result.rows.map(d => `• *${d.repo}* (${d.branch}) - \`${d.status.toUpperCase()}\` (at ${new Date(d.created_at).toLocaleString()})`).join('\n');
          }
        } catch (dbErr) {
          console.error('Failed to query deployments for Slack status:', dbErr.message);
        }
      }

      let sloText = 'SLO tracking not available.';
      try {
        const { checkSLOs } = require('../../agents/monitor/slo-tracker');
        const report = await checkSLOs();
        if (report && report.results) {
          sloText = report.results.map(r => {
            const status = r.compliance_percent >= r.target ? 'healthy' : 'breached';
            return `• *${r.name}*: ${r.compliance_percent.toFixed(2)}% compliance (${status.toUpperCase()})`;
          }).join('\n');
        }
      } catch (err) {
        console.error('Failed to fetch SLOs in Slack command:', err.message);
      }

      const responseText = `📊 *PipelineDoc System Status*\n\n*SLO Status:*\n${sloText}\n\n*Recent Deployments:*\n${deploymentsText}`;
      await postToResponseUrl(response_url, { text: responseText });
      break;
    }

    case 'deploy': {
      const repo = args[1];
      const branch = args[2];
      const strategy = args[3] || 'rolling';

      if (!repo || !branch) {
        await postToResponseUrl(response_url, { text: '⚠️ *Usage:* `/pd deploy [repo] [branch] [strategy]`' });
        return;
      }

      const pgPool = databaseConfig.pgPool;
      const commitSha = 'manual-' + Math.random().toString(36).substring(2, 10);
      let deploymentId = 'mock-deploy-id-' + Math.random().toString(36).substring(2, 5);

      if (pgPool) {
        try {
          const insertResult = await pgPool.query(
            `INSERT INTO deployments (repo, branch, commit_sha, status, strategy, started_at)
             VALUES ($1, $2, $3, 'running', $4, NOW()) RETURNING id`,
            [repo, branch, commitSha, strategy]
          );
          deploymentId = insertResult.rows[0].id;

          // Generate default rollback plan
          const { generateRollbackPlan } = require('../../agents/planner/rollback-planner');
          await generateRollbackPlan({
            deploymentId,
            repo,
            previousCommitSha: 'prev-sha-123',
            hasDbMigration: strategy === 'maintenance window'
          });
        } catch (dbErr) {
          console.error('Failed to create deployment record in database:', dbErr.message);
        }
      }

      const { selectStrategy } = require('../../agents/planner/strategy-selector');
      const strategyPlan = selectStrategy({
        riskScore: 0,
        hasDbMigration: strategy === 'maintenance window'
      });
      strategyPlan.strategy = strategy;

      const { executeDeployment } = require('../../agents/planner/deploy-coordinator');
      executeDeployment(deploymentId, strategyPlan, {
        pollIntervalMs: process.env.NODE_ENV === 'test' ? 5 : 15000
      }).catch(err => {
        console.error(`Error in manual deploy execution:`, err);
      });

      const responseText = `🚀 *Deployment Started!*\n*Repo:* \`${repo}\`\n*Branch:* \`${branch}\`\n*Strategy:* \`${strategy}\`\n*Deployment ID:* \`${deploymentId}\``;
      await postToResponseUrl(response_url, { text: responseText });
      break;
    }

    case 'rollback': {
      const deploymentId = args[1];
      if (!deploymentId) {
        await postToResponseUrl(response_url, { text: '⚠️ *Usage:* `/pd rollback [deployment-id]`' });
        return;
      }

      const { executeRollback } = require('../../agents/planner/deploy-coordinator');
      executeRollback(deploymentId).catch(err => {
        console.error('Error executing manual rollback:', err);
      });

      const responseText = `🔄 *Rollback Triggered* for deployment \`${deploymentId}\`.`;
      await postToResponseUrl(response_url, { text: responseText });
      break;
    }

    case 'why': {
      const pgPool = databaseConfig.pgPool;
      if (!pgPool) {
        await postToResponseUrl(response_url, { text: '⚠️ Database connection not initialized' });
        return;
      }

      try {
        const result = await pgPool.query('SELECT * FROM incidents ORDER BY created_at DESC LIMIT 1');
        if (result.rows.length === 0) {
          await postToResponseUrl(response_url, { text: 'No recent incidents found.' });
          return;
        }
        const incident = result.rows[0];
        const responseText = `🚨 *Last Incident Details:*\n*ID:* \`${incident.id}\`\n*Type:* \`${incident.type}\`\n*Root Cause:* \`${incident.root_cause || 'Unknown'}\`\n*Resolution:* \`${incident.resolution || 'Pending'}\`\n*Created At:* \`${incident.created_at}\``;
        await postToResponseUrl(response_url, { text: responseText });
      } catch (dbErr) {
        console.error('Failed to query incidents for Slack commands:', dbErr.message);
        await postToResponseUrl(response_url, { text: '⚠️ Failed to retrieve last incident details' });
      }
      break;
    }

    default: {
      // Natural language fallback! Run the input through Claude Messages API
      const systemPrompt = `You are PipelineDoc Assistant. You have access to the following tools:
- get_recent_deployments() → last 10 deployments with status
- get_incident(id) → full incident details
- get_slo_status() → current SLO compliance
- trigger_deploy(repo, branch, strategy) → start a deployment
- trigger_rollback(deployment_id) → rollback a deployment
- get_risk_score(pr_number) → gate score for a PR

Answer in plain English. Be concise.
CRITICAL: If asked to take an action (such as triggering a deploy or triggering a rollback), you MUST first ask the user for confirmation in plain text. Do NOT call the tool until the user has explicitly confirmed in the conversation history. Once they confirm, you may proceed to call the tool.`;

      try {
        let currentMessages = [{ role: 'user', content: text || 'status' }];
        let done = false;
        let finalExplanation = '';

        while (!done) {
          const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            system: systemPrompt,
            messages: currentMessages,
            tools: toolsList
          });

          const textBlock = response.content.find(c => c.type === 'text');
          const toolCalls = response.content.filter(c => c.type === 'tool_use');

          if (textBlock && textBlock.text) {
            finalExplanation = textBlock.text;
          }

          if (toolCalls.length > 0) {
            currentMessages.push({
              role: 'assistant',
              content: response.content
            });

            const toolResults = [];
            for (const toolCall of toolCalls) {
              let result;
              try {
                result = await executeTool(toolCall.name, toolCall.input);
              } catch (err) {
                result = { error: err.message };
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: JSON.stringify(result)
              });
            }

            currentMessages.push({
              role: 'user',
              content: toolResults
            });
          } else {
            done = true;
          }
        }

        await postToResponseUrl(response_url, { text: finalExplanation || 'No response generated.' });
      } catch (err) {
        console.error('Error in Slack command natural language fallback:', err);
        await postToResponseUrl(response_url, { text: `⚠️ Error processing request: ${err.message}` });
      }
      break;
    }
  }
}

async function handleSlackCommand(req, res) {
  try {
    const { command, text, response_url, user_id } = req.body;
    
    if (command !== '/pd') {
      return res.status(400).send('Invalid command');
    }

    // Acknowledge immediately to avoid timeout
    res.status(200).json({ response_type: 'ephemeral', text: 'Acknowledged. Processing your request...' });

    // Process command asynchronously
    processCommand(text, response_url, user_id).catch(err => {
      console.error('Error processing Slack command:', err);
    });
  } catch (error) {
    console.error('Error in handleSlackCommand:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
}

module.exports = {
  handleSlackCommand,
  processCommand
};
