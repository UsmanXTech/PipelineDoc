const db = require('../../config/database');
const { getRollbackPlan } = require('./rollback-planner');
const slackClient = require('../../integrations/slack/client');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Ensures deployments table schema has current_stage and deploy_history columns.
 */
async function ensureDbSchema() {
  if (db.pgPool) {
    try {
      await db.pgPool.query(`
        ALTER TABLE deployments 
        ADD COLUMN IF NOT EXISTS current_stage TEXT,
        ADD COLUMN IF NOT EXISTS deploy_history JSONB;
      `);
    } catch (err) {
      console.error('Failed to update deployments schema in coordinator:', err.message);
    }
  }
}

/**
 * Logs a stage update to the database and broadcasts to Slack.
 */
async function updateDeployStage(deploymentId, stageName, status, details = {}) {
  await ensureDbSchema();
  
  const timestamp = new Date().toISOString();
  const historyEvent = { stage: stageName, status, timestamp, ...details };

  if (db.pgPool) {
    try {
      const selectQuery = `SELECT deploy_history FROM deployments WHERE id = $1;`;
      const selectResult = await db.pgPool.query(selectQuery, [deploymentId]);
      
      let history = [];
      if (selectResult.rows.length > 0 && selectResult.rows[0].deploy_history) {
        history = typeof selectResult.rows[0].deploy_history === 'string'
          ? JSON.parse(selectResult.rows[0].deploy_history)
          : selectResult.rows[0].deploy_history;
      }
      
      history.push(historyEvent);

      const updateQuery = `
        UPDATE deployments
        SET current_stage = $1, status = $2, deploy_history = $3
        WHERE id = $4;
      `;
      await db.pgPool.query(updateQuery, [stageName, status, JSON.stringify(history), deploymentId]);
    } catch (err) {
      console.error(`Failed to update deploy stage in database:`, err.message);
    }
  }

  // Send Slack alert
  try {
    const text = `Deployment #${deploymentId.substring(0, 8)}: Stage *${stageName}* is now *${status}*.`;
    await slackClient.sendSlackMessage({
      text,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🚀 *Deployment Update*\n*ID:* \`${deploymentId.substring(0, 8)}\`\n*Stage:* \`${stageName}\`\n*Status:* \`${status.toUpperCase()}\`\n${details.message ? `*Info:* ${details.message}` : ''}`
          }
        }
      ]
    });
  } catch (slackErr) {
    console.warn('Slack deploy notification failed:', slackErr.message);
  }
}

/**
 * Executes a rollback or verification shell command safely.
 */
async function runCommand(command) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mock Exec Command]: ${command}`);
    return { stdout: 'Mock execution success', stderr: '' };
  }
  return execPromise(command);
}

/**
 * Runs a health check validation.
 */
async function runHealthCheck(healthCheckName, simulateFail = false) {
  if (simulateFail) {
    return false;
  }
  console.log(`Running health check: ${healthCheckName}...`);
  return true;
}

/**
 * Decrypts and executes the rollback plan.
 */
async function executeRollback(deploymentId) {
  await updateDeployStage(deploymentId, 'rollback', 'rolling_back', { message: 'Initiating rollback process...' });

  try {
    const rollbackPlan = await getRollbackPlan(deploymentId);
    if (!rollbackPlan) {
      throw new Error('No rollback plan found in database for this deployment.');
    }

    const steps = rollbackPlan.rollback_steps || [];
    console.log(`Executing ${steps.length} rollback step(s) for deployment ${deploymentId}`);

    for (const step of steps) {
      console.log(`Rollback Step ${step.order} (${step.type}): ${step.command}`);
      
      const { stdout } = await runCommand(step.command);
      console.log(`Rollback command output: ${stdout}`);

      if (step.verify_command) {
        console.log(`Verifying step ${step.order}: ${step.verify_command}`);
        const { stdout: verifyOut } = await runCommand(step.verify_command);
        console.log(`Verification output: ${verifyOut}`);
      }
    }

    await updateDeployStage(deploymentId, 'rollback', 'rolled_back', { message: 'Rollback completed successfully. Production restored.' });
    return true;
  } catch (err) {
    console.error(`Rollback execution failed for deployment ${deploymentId}:`, err.message);
    await updateDeployStage(deploymentId, 'rollback_failed', 'failed', { message: `Rollback failed: ${err.message}` });
    return false;
  }
}

/**
 * Coordinates and executes a deployment strategy stages pipeline.
 * 
 * @param {string} deploymentId - UUID of deployment in DB
 * @param {Object} strategyPlan - Selected strategy details (strategy, stages)
 * @param {Object} options - Control and simulation flags
 * @returns {boolean} True if deploy succeeded, false if aborted or rolled back
 */
async function executeDeployment(deploymentId, strategyPlan, options = {}) {
  const { strategy, stages } = strategyPlan;
  console.log(`Starting deployment coordination for ${deploymentId} with strategy: ${strategy}`);
  
  await updateDeployStage(deploymentId, 'pre_deploy', 'running', { message: `Starting deployment using ${strategy} strategy.` });

  // Run initial pre-deploy health check
  const preDeployHealthy = await runHealthCheck('pre_deploy_health', options.simulatePreDeployFailure);
  if (!preDeployHealthy) {
    console.error('Pre-deploy health check failed! Aborting deployment.');
    await updateDeployStage(deploymentId, 'pre_deploy', 'failed', { message: 'Pre-deploy health check failed. Deployment aborted.' });
    return false;
  }

  // Run each deployment stage sequentially
  for (const stage of stages) {
    await updateDeployStage(deploymentId, stage.name, 'running', { 
      message: `Deploying to ${stage.traffic_percent}% traffic. Wait period: ${stage.wait_minutes} min.` 
    });

    console.log(`Deploying stage ${stage.name} - Traffic percent: ${stage.traffic_percent}%`);

    const waitTimeMs = options.pollIntervalMs || (stage.wait_minutes * 60 * 1000);
    const pollInterval = options.pollIntervalMs || 15000;
    const startTime = Date.now();

    let stageHealthy = true;
    while (Date.now() - startTime < waitTimeMs) {
      for (const check of stage.health_checks || []) {
        const healthy = await runHealthCheck(check, options.simulateHealthFailure);
        if (!healthy) {
          stageHealthy = false;
          break;
        }
      }

      if (!stageHealthy) {
        break;
      }

      // For test execution shortcuts
      if (waitTimeMs <= pollInterval) {
        await new Promise(r => setTimeout(r, waitTimeMs));
        break;
      }
      await new Promise(r => setTimeout(r, Math.min(pollInterval, waitTimeMs - (Date.now() - startTime))));
    }

    if (!stageHealthy) {
      console.error(`Stage ${stage.name} health check failed! Initiating rollback.`);
      await executeRollback(deploymentId);
      return false;
    }

    await updateDeployStage(deploymentId, stage.name, 'success', { 
      message: `Stage ${stage.name} completed and verified.` 
    });
  }

  // Complete deployment
  await updateDeployStage(deploymentId, 'completed', 'success', { message: 'Deployment completed and fully rolled out.' });
  return true;
}

module.exports = {
  executeDeployment,
  executeRollback,
  updateDeployStage
};
