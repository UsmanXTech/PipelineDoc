const databaseConfig = require('../../config/database');
const slackClient = require('../../integrations/slack/client');
const { HEALING_ACTIONS } = require('./healing-actions');
const { exec } = require('child_process');
const crypto = require('crypto');
const util = require('util');
const execPromise = util.promisify(exec);

async function runCommandWithTimeout(command, timeoutMs = 120000) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mock Exec Command]: ${command}`);
    return { stdout: 'Mock execution success', stderr: '' };
  }
  return new Promise((resolve, reject) => {
    const process = exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Custom verification logic.
 */
async function runVerification(verifyCommand, context = {}) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mock Verification]: ${verifyCommand}`);
    return true;
  }

  // Handle custom semantic checks
  if (verifyCommand.includes('check error rate')) {
    const redis = databaseConfig.redisClient;
    if (redis) {
      // Poll error rate over 2 minutes (up to 4 checks at 30s intervals)
      for (let i = 0; i < 4; i++) {
        await new Promise(r => setTimeout(r, 30000));
        const samples = await redis.lrange('metrics:http_error_rate', 0, 0);
        if (samples && samples.length > 0) {
          const latest = JSON.parse(samples[0]);
          if (latest.value < 0.01) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Handle shell verification command
  try {
    const { stdout } = await runCommandWithTimeout(verifyCommand);
    // Standard Unix rule: success if it completes without throwing
    return true;
  } catch (err) {
    console.error(`Verification command failed: ${verifyCommand}`, err.message);
    return false;
  }
}

/**
 * Executes a self-healing action, logs state to Postgres, and alerts Slack.
 * 
 * @param {string} actionKey - Key in HEALING_ACTIONS (e.g. 'pod_oom')
 * @param {Object} context - Template variables (e.g. { name: 'auth-service', current_mem_limit: '512Mi' })
 * @returns {Object} Status report of the execution
 */
async function executeHealingAction(actionKey, context = {}) {
  const db = databaseConfig.pgPool;
  const actionConfig = HEALING_ACTIONS[actionKey];
  if (!actionConfig) {
    throw new Error(`Healing action "${actionKey}" is not defined.`);
  }

  try {
    const metricsStore = require('../../api/src/services/metrics-store');
    let healingType = 'service_restart';
    if (actionKey.includes('rollback')) {
      healingType = 'rollback';
    } else if (actionKey.includes('hotfix')) {
      healingType = 'hotfix';
    }
    metricsStore.incrementHealing(healingType);
  } catch (err) {
    // Ignore metrics failure
  }

  const incidentId = crypto.randomUUID();
  const name = context.name || 'unknown-service';

  // Replace template variables
  let commandStr = actionConfig.action
    .replace(/\$NAME/g, name)
    .replace(/\$CURRENT_MEM_LIMIT/g, context.current_mem_limit || '512Mi');
  let verifyStr = actionConfig.verify
    .replace(/\$NAME/g, name);

  // 1. Log intent to incidents table with status 'pending'
  if (db) {
    try {
      const query = `
        INSERT INTO incidents (id, type, root_cause, raw_logs, resolution, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW());
      `;
      const values = [
        incidentId,
        'self_healing',
        `Self-healing triggered: ${actionKey} on ${name}`,
        JSON.stringify({ actionKey, command: commandStr, verify: verifyStr, context }),
        'pending'
      ];
      await db.query(query, values);
    } catch (err) {
      console.error('Failed to log healing incident:', err.message);
    }
  }

  // Post initial notification
  try {
    await slackClient.sendSlackMessage({
      text: `🔧 [PipelineDoc Healer] Initiating auto-remediation: ${actionKey} for ${name}...`
    });
  } catch (e) {}

  try {
    // 2. Execute action command with 120s timeout
    await runCommandWithTimeout(commandStr, 120000);

    // 3. Verify results
    const verifySuccess = await runVerification(verifyStr, context);

    if (verifySuccess) {
      // 4. Update status to resolved
      if (db) {
        try {
          const { resolveIncident } = require('../memory/incident-resolver');
          await resolveIncident(incidentId, 'resolved', {
            root_cause: `Self-healing triggered: ${actionKey} on ${name}`,
            failure_type: 'self_healing',
            repo: context.repo || 'unknown-repo'
          });
        } catch (resErr) {
          console.error('Failed to trigger memory resolver on healing success:', resErr.message);
        }
      }

      await slackClient.sendSlackMessage({
        text: `✅ [PipelineDoc Healer] Auto-remediation succeeded!`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*✅ Self-Healing Completed successfully*\n*Service:* \`${name}\`\n*Action:* \`${actionKey}\`\n*Status:* \`resolved\``
            }
          }
        ]
      });

      return { success: true, incidentId, status: 'resolved' };
    } else {
      throw new Error(`Verification command failed: "${verifyStr}"`);
    }
  } catch (err) {
    console.error(`Self-healing action ${actionKey} failed:`, err.message);

    // 5. Update status to healer_failed, alert human
    if (db) {
      try {
        const { resolveIncident } = require('../memory/incident-resolver');
        await resolveIncident(incidentId, 'healer_failed', {
          root_cause: `Self-healing triggered: ${actionKey} on ${name}`,
          failure_type: 'self_healing',
          repo: context.repo || 'unknown-repo'
        });
      } catch (dbErr) {
        console.error('Failed to trigger memory resolver on healing failure:', dbErr.message);
      }
    }

    await slackClient.sendSlackMessage({
      text: `🚨 [PipelineDoc Healer] Auto-remediation FAILED!`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🚨 Self-Healing Remediation FAILED!*\n*Service:* \`${name}\`\n*Action:* \`${actionKey}\`\n*Error:* ${err.message}\n\n*Human intervention required!*`
          }
        }
      ]
    });

    return { success: false, incidentId, status: 'healer_failed', error: err.message };
  }
}

module.exports = {
  executeHealingAction,
  runVerification
};
