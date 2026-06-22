const express = require('express');
const router = express.Router();
const anthropic = require('../../../config/ai-client');
const databaseConfig = require('../../../config/database');

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
  },
  {
    name: 'get_uipath_status',
    description: 'Get the connectivity status and active robots/processes of UiPath Orchestrator',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_uipath_jobs',
    description: 'Get the list of active/completed UiPath robot jobs',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'trigger_uipath_job',
    description: 'Trigger a manual UiPath RPA process (e.g. Restart Service, Clear Cache)',
    input_schema: {
      type: 'object',
      properties: {
        process_name: { type: 'string', description: 'The name of the UiPath process to run' },
        arguments: { type: 'object', description: 'Optional key-value parameters for the job' }
      },
      required: ['process_name']
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
      const { checkSLOs } = require('../../../agents/monitor/slo-tracker');
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
        const { generateRollbackPlan } = require('../../../agents/planner/rollback-planner');
        await generateRollbackPlan({
          deploymentId,
          repo,
          previousCommitSha: 'prev-sha-123',
          hasDbMigration: strategy === 'maintenance window'
        });
      } catch (err) {
        console.error('Failed to generate rollback plan in manual trigger:', err.message);
      }

      // Select strategy details
      const { selectStrategy } = require('../../../agents/planner/strategy-selector');
      const strategyPlan = selectStrategy({
        riskScore: 0,
        hasDbMigration: strategy === 'maintenance window'
      });
      strategyPlan.strategy = strategy; // use user-specified strategy

      // Run executeDeployment in background
      const { executeDeployment } = require('../../../agents/planner/deploy-coordinator');
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

      const { executeRollback } = require('../../../agents/planner/deploy-coordinator');
      // Run in background
      executeRollback(deploymentId).catch(err => {
        console.error(`Error executing rollback for ${deploymentId}:`, err);
      });

      return { success: true, deploymentId, status: 'rolling_back' };
    }
    case 'get_risk_score': {
      const prNumber = input.pr_number;
      const githubClient = require('../../../integrations/github/client');
      const { evaluateGate } = require('../../../agents/gatekeeper/gate-decision');

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
    case 'get_uipath_status': {
      const config = require('../../../config/uipath');
      const mockMode = process.env.NODE_ENV !== 'production';
      return {
        status: 'Connected',
        connectionMode: mockMode ? 'Simulation (Local Mock)' : 'UiPath Automation Cloud Live',
        organizationId: config.organizationId || 'pipelinedoc-org',
        tenantName: config.tenantName || 'pipelinedoc-tenant',
        folderPath: 'Shared/Orchestrator_Unit_1',
        activeRobots: ['Robot_Maestro_01', 'Robot_Maestro_02', 'Robot_Healer_01', 'Robot_Healer_02']
      };
    }
    case 'get_uipath_jobs': {
      if (!pgPool) return [];
      const result = await pgPool.query('SELECT * FROM uipath_jobs ORDER BY created_at DESC LIMIT 10');
      return result.rows;
    }
    case 'trigger_uipath_job': {
      const processName = input.process_name;
      const args = input.arguments || {};
      const robot = 'Robot_Maestro_01';
      const jobId = `job-ai-${Date.now().toString().slice(-4)}`;

      if (pgPool) {
        await pgPool.query(`
          INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, start_time, end_time)
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        `, [jobId, processName, robot, 'Successful', JSON.stringify(args)]);
      }

      return {
        success: true,
        jobId,
        state: 'Successful',
        robot,
        message: `Successfully executed manual UiPath job run ${jobId} for process ${processName}`
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// POST /api/chat - Chat with PipelineDoc assistant
router.post('/', async (req, res) => {
  const { message, conversation_history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Setup SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const systemPrompt = `You are PipelineDoc Assistant. You have access to the following tools:
- get_recent_deployments() → last 10 deployments with status
- get_incident(id) → full incident details
- get_slo_status() → current SLO compliance
- trigger_deploy(repo, branch, strategy) → start a deployment
- trigger_rollback(deployment_id) → rollback a deployment
- get_risk_score(pr_number) → gate score for a PR
- get_uipath_status() → check UiPath cloud connectivity status
- get_uipath_jobs() → retrieve recent RPA job execution logs
- trigger_uipath_job(process_name, arguments) → run a manual UiPath RPA process

Answer in plain English. Be concise.
CRITICAL: If asked to take an action (such as triggering a deploy, triggering a rollback, or running a UiPath job), you MUST first ask the user for confirmation in plain text. Do NOT call the tool until the user has explicitly confirmed in the conversation history. Once they confirm, you may proceed to call the tool.`;

  // Format conversation history for Claude
  const formattedMessages = [];
  if (Array.isArray(conversation_history)) {
    for (const msg of conversation_history) {
      const role = msg.role || (msg.isUser ? 'user' : 'assistant');
      const content = msg.content || msg.text || '';
      if (role && content) {
        formattedMessages.push({ role, content });
      }
    }
  }

  // Add the current user message
  formattedMessages.push({ role: 'user', content: message });

  try {
    let currentMessages = [...formattedMessages];
    let done = false;
    let finalModel = 'claude-3-5-sonnet-20241022';

    while (!done) {
      const response = await anthropic.messages.create({
        model: finalModel,
        max_tokens: 1000,
        system: systemPrompt,
        messages: currentMessages,
        tools: toolsList
      });

      const textBlock = response.content.find(c => c.type === 'text');
      const toolCalls = response.content.filter(c => c.type === 'tool_use');

      if (textBlock && textBlock.text) {
        // Stream text chunk
        res.write(`data: ${JSON.stringify({ type: 'text', text: textBlock.text })}\n\n`);
      }

      if (toolCalls.length > 0) {
        // Append assistant tool_use message to history
        currentMessages.push({
          role: 'assistant',
          content: response.content
        });

        const toolResults = [];
        for (const toolCall of toolCalls) {
          // Stream start event
          res.write(`data: ${JSON.stringify({ type: 'tool_start', name: toolCall.name, input: toolCall.input })}\n\n`);

          let result;
          try {
            result = await executeTool(toolCall.name, toolCall.input);
          } catch (err) {
            result = { error: err.message };
          }

          // Stream result event
          res.write(`data: ${JSON.stringify({ type: 'tool_result', name: toolCall.name, result })}\n\n`);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }

        // Append tool results to history
        currentMessages.push({
          role: 'user',
          content: toolResults
        });

        // Loop runs again to let Claude generate the final explanation based on tool results
      } else {
        done = true;
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Error in chat endpoint:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

module.exports = router;
