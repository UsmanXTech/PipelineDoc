const databaseConfig = require('../../config/database');
const slackClient = require('../../integrations/slack/client');
const { getMetricBaseline } = require('../monitor/anomaly-detector');
const { getRollbackPlan } = require('../planner/rollback-planner');
const { exec } = require('child_process');
const crypto = require('crypto');
const util = require('util');
const execPromise = util.promisify(exec);

// In-memory active timeouts list to allow cancelling rollbacks
const activeTimeouts = {};

async function runCommand(command) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mock Exec Command]: ${command}`);
    return { stdout: 'Mock execution success', stderr: '' };
  }
  return execPromise(command);
}

/**
 * Evaluates production metrics post-deployment and triggers auto-rollback if healthy targets are breached.
 */
async function evaluateAutoRollback() {
  const db = databaseConfig.pgPool;
  const redis = databaseConfig.redisClient;
  if (!db || !redis) {
    return { triggered: false, reason: 'Database or Redis not connected' };
  }

  try {
    // 1. Fetch most recent successful deployment completed in last 15 minutes
    const query = `
      SELECT id, repo, status, completed_at 
      FROM deployments 
      WHERE status = 'success' AND completed_at >= NOW() - INTERVAL '15 minutes'
      ORDER BY completed_at DESC LIMIT 1;
    `;
    const result = await db.query(query);
    if (result.rows.length === 0) {
      return { triggered: false, reason: 'No recent successful deployment found' };
    }

    const deployment = result.rows[0];
    const deploymentId = deployment.id;

    // 2. Fetch error rate baseline
    const baseline = await getMetricBaseline('http_error_rate');

    // 3. Fetch past 3 minutes of error rate samples (last 6 samples of 30-sec polling)
    const rawSamples = await redis.lrange('metrics:http_error_rate', 0, 5);
    if (!rawSamples || rawSamples.length < 6) {
      return { triggered: false, reason: 'Insufficient metrics samples' };
    }

    const samples = rawSamples.map(s => JSON.parse(s));
    const isErrorSpike = samples.every(s => s.value > baseline * 10);

    if (isErrorSpike) {
      // Trigger auto-rollback!
      const currentRate = samples[0].value;
      const pendingKey = `rollback:pending:${deploymentId}`;
      
      // Check if already pending or executed
      const existingStatus = await redis.get(pendingKey);
      if (existingStatus) {
        return { triggered: false, reason: 'Rollback already pending or executed for this deployment' };
      }

      await redis.set(pendingKey, 'pending', 'EX', 300); // 5 minutes TTL

      // Create auto_rollback incident
      const incId = crypto.randomUUID();
      const insertIncidentQuery = `
        INSERT INTO incidents (id, deployment_id, type, root_cause, raw_logs, resolution, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW());
      `;
      await db.query(insertIncidentQuery, [
        incId,
        deploymentId,
        'auto_rollback',
        `Error rate (${(currentRate * 100).toFixed(2)}%) exceeded 10x baseline (${(baseline * 100).toFixed(2)}%) for > 3 mins`,
        JSON.stringify({ samples, baseline, currentRate }),
        'pending_override'
      ]);

      // Post Slack alert with interactive actions
      const reasonText = `HTTP error rate (${(currentRate * 100).toFixed(2)}%) is 10x baseline (${(baseline * 100).toFixed(2)}%) for > 3 minutes post-deploy.`;
      
      await slackClient.sendSlackMessage({
        text: `🔄 AUTO-ROLLBACK TRIGGERED for deploy ${deploymentId}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🔄 Auto-Rollback Warning Triggered',
              emoji: true
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Deployment ID:* \`${deploymentId}\`\n*Repo:* \`${deployment.repo}\`\n*Reason:* ${reasonText}\n\n*Action:* A rollback will automatically initiate in *5 minutes* unless cancelled.`
            }
          },
          {
            type: 'actions',
            block_id: `rollback_actions:${deploymentId}`,
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Cancel Rollback ❌',
                  emoji: true
                },
                action_id: 'cancel_rollback',
                value: deploymentId,
                style: 'danger'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Approve Rollback Now ⚡',
                  emoji: true
                },
                action_id: 'approve_rollback',
                value: deploymentId,
                style: 'primary'
              }
            ]
          }
        ]
      });

      // Set timeout to execute rollback
      const timer = setTimeout(async () => {
        delete activeTimeouts[deploymentId];
        await executeRollbackSteps(deploymentId, currentRate);
      }, 300000); // 5 minutes
      activeTimeouts[deploymentId] = timer;

      return { triggered: true, deploymentId, incidentId: incId };
    }

    return { triggered: false };
  } catch (err) {
    console.error('Failed to evaluate auto-rollback:', err.message);
    return { triggered: false, error: err.message };
  }
}

/**
 * Cancels a pending auto-rollback.
 */
async function cancelRollback(deploymentId) {
  const redis = databaseConfig.redisClient;
  const db = databaseConfig.pgPool;

  if (activeTimeouts[deploymentId]) {
    clearTimeout(activeTimeouts[deploymentId]);
    delete activeTimeouts[deploymentId];
  }

  if (redis) {
    await redis.set(`rollback:pending:${deploymentId}`, 'cancelled', 'EX', 3600);
  }

  if (db) {
    const res = await db.query(
      `SELECT id FROM incidents 
       WHERE deployment_id = $1 AND type = 'auto_rollback' AND resolution = 'pending_override'`,
      [deploymentId]
    );
    if (res.rows.length > 0) {
      const incidentId = res.rows[0].id;
      try {
        const { resolveIncident } = require('../memory/incident-resolver');
        await resolveIncident(incidentId, 'cancelled_by_user');
      } catch (err) {
        console.error('Failed to trigger memory resolver on cancel rollback:', err.message);
      }
    }
  }

  return true;
}

/**
 * Approves and triggers rollback immediately.
 */
async function approveRollbackNow(deploymentId) {
  if (activeTimeouts[deploymentId]) {
    clearTimeout(activeTimeouts[deploymentId]);
    delete activeTimeouts[deploymentId];
  }
  return executeRollbackSteps(deploymentId, 'user_approved');
}

/**
 * Performs actual rollback execution steps.
 */
async function executeRollbackSteps(deploymentId, currentRate = 'unknown') {
  const redis = databaseConfig.redisClient;
  const db = databaseConfig.pgPool;

  if (redis) {
    const status = await redis.get(`rollback:pending:${deploymentId}`);
    if (status === 'cancelled') {
      console.log(`Rollback for deployment ${deploymentId} was cancelled. Aborting.`);
      return false;
    }
    await redis.set(`rollback:pending:${deploymentId}`, 'executing', 'EX', 3600);
  }

  if (db) {
    // Update deployment status to rolling_back
    await db.query(`UPDATE deployments SET status = 'rolling_back' WHERE id = $1`, [deploymentId]);
  }

  try {
    const rollbackPlan = await getRollbackPlan(deploymentId);
    if (!rollbackPlan) {
      throw new Error(`Rollback plan not found for deployment ${deploymentId}`);
    }

    const steps = rollbackPlan.rollback_steps || [];
    steps.sort((a, b) => a.order - b.order);

    for (const step of steps) {
      console.log(`Executing Auto-Rollback Step ${step.order} (${step.type}): ${step.command}`);
      await runCommand(step.command);

      if (step.verify_command) {
        console.log(`Verifying Auto-Rollback Step ${step.order}: ${step.verify_command}`);
        try {
          await runCommand(step.verify_command);
        } catch (verifyErr) {
          // Verification failed! STOP execution, alert human, and abort.
          const errorMsg = `Verification failed on Step ${step.order} (${step.type}): ${verifyErr.message}`;
          console.error(errorMsg);

          if (db) {
            await db.query(`UPDATE deployments SET status = 'rollback_failed' WHERE id = $1`, [deploymentId]);
            const incRes = await db.query(
              `SELECT id FROM incidents WHERE deployment_id = $1 AND type = 'auto_rollback'`,
              [deploymentId]
            );
            if (incRes.rows.length > 0) {
              try {
                const { resolveIncident } = require('../memory/incident-resolver');
                await resolveIncident(incRes.rows[0].id, 'rollback_failed_verification');
              } catch (err) {
                console.error('Failed to trigger memory resolver on rollback verification failure:', err.message);
              }
            }
          }

          await slackClient.sendSlackMessage({
            text: `🚨 AUTO-ROLLBACK FAILED for deploy ${deploymentId}`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*🚨 Auto-Rollback FAILED during verification!*\n*Deployment ID:* \`${deploymentId}\`\n*Step:* \`${step.order} (${step.type})\`\n*Error:* ${errorMsg}\n\n*STOPPING ROLLBACK INCOMPLETE! Human intervention is urgently required.*`
                }
              }
            ]
          });
          return false;
        }
      }
    }

    // Success! Update statuses
    if (db) {
      await db.query(`UPDATE deployments SET status = 'rolled_back', completed_at = NOW() WHERE id = $1`, [deploymentId]);
      const incRes = await db.query(
        `SELECT id FROM incidents WHERE deployment_id = $1 AND type = 'auto_rollback'`,
        [deploymentId]
      );
      if (incRes.rows.length > 0) {
        try {
          const { resolveIncident } = require('../memory/incident-resolver');
          await resolveIncident(incRes.rows[0].id, 'rolled_back_successfully');
        } catch (err) {
          console.error('Failed to trigger memory resolver on rollback success:', err.message);
        }
      }
    }

    await slackClient.sendSlackMessage({
      text: `✅ AUTO-ROLLBACK COMPLETED for deploy ${deploymentId}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*✅ Auto-Rollback Completed Successfully*\n*Deployment ID:* \`${deploymentId}\`\n*Status:* Production has been restored to the previous stable revision.`
          }
        }
      ]
    });

    return true;
  } catch (err) {
    console.error(`Auto-rollback execution failed: ${err.message}`);
    if (db) {
      await db.query(`UPDATE deployments SET status = 'rollback_failed' WHERE id = $1`, [deploymentId]);
    }
    await slackClient.sendSlackMessage({
      text: `🚨 AUTO-ROLLBACK EXCEPTION for deploy ${deploymentId}: ${err.message}`
    });
    return false;
  }
}

module.exports = {
  evaluateAutoRollback,
  cancelRollback,
  approveRollbackNow,
  executeRollbackSteps,
  activeTimeouts
};
