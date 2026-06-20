const db = require('../../config/database');

const ENCRYPTION_KEY = process.env.JWT_SECRET || 'rollback-encryption-key-secret-fallback-123';

/**
 * Generates and stores a symmetric-key encrypted rollback plan for a deployment.
 * 
 * @param {Object} params
 * @param {string} params.deploymentId - UUID of the deployment
 * @param {string} params.repo - Repository name
 * @param {string} params.previousCommitSha - SHA to roll back to
 * @param {boolean} params.hasDbMigration - True if a DB migration rollback is needed
 * @param {Array<Object>} params.changedFlags - List of changed feature flags to restore
 * @returns {Object} Decrypted rollback plan
 */
async function generateRollbackPlan({ deploymentId, repo, previousCommitSha, hasDbMigration = false, changedFlags = [] }) {
  const rollback_steps = [];
  let order = 1;

  // Step 1: Restore Changed Feature Flags
  if (changedFlags && changedFlags.length > 0) {
    for (const flag of changedFlags) {
      rollback_steps.push({
        order: order++,
        type: 'config_restore',
        command: `ld-cli flags set ${flag.key} ${flag.previousValue}`,
        timeout_seconds: 60,
        verify_command: `ld-cli flags get ${flag.key} | grep ${flag.previousValue}`
      });
    }
  }

  // Step 2: Rollback DB Migration if present
  if (hasDbMigration) {
    rollback_steps.push({
      order: order++,
      type: 'db_rollback',
      command: `npm run db:migrate:undo -- --repo=${repo} --sha=${previousCommitSha}`,
      timeout_seconds: 180,
      verify_command: `npm run db:migrate:status -- --repo=${repo} | grep "pending"`
    });
  }

  // Step 3: Revert Kubernetes Deployments
  rollback_steps.push({
    order: order++,
    type: 'kubernetes_rollout',
    command: `kubectl rollout undo deployment/${repo} --to-revision=previous`,
    timeout_seconds: 120,
    verify_command: `kubectl rollout status deployment/${repo}`
  });

  // Step 4: Restore DNS/Load Balancer Routing
  rollback_steps.push({
    order: order++,
    type: 'dns_switch',
    command: `lb-cli route --service ${repo} --target ${previousCommitSha}`,
    timeout_seconds: 60,
    verify_command: `curl -f -s https://${repo}.prod.internal/health`
  });

  const rollbackPlan = {
    deployment_id: deploymentId,
    rollback_steps,
    estimated_downtime_seconds: hasDbMigration ? 30 : 0,
    can_auto_rollback: !hasDbMigration
  };

  // Store in deployments table (encrypted via pgcrypto)
  if (db.pgPool) {
    try {
      // Dynamically ensure the rollback_plan column exists
      await db.pgPool.query(`
        ALTER TABLE deployments 
        ADD COLUMN IF NOT EXISTS rollback_plan BYTEA;
      `);

      const jsonString = JSON.stringify(rollbackPlan);
      const query = `
        UPDATE deployments
        SET rollback_plan = pgp_sym_encrypt($1, $2)
        WHERE id = $3;
      `;
      await db.pgPool.query(query, [jsonString, ENCRYPTION_KEY, deploymentId]);
    } catch (err) {
      console.error('Failed to encrypt and store rollback plan:', err.message);
      throw err;
    }
  }

  return rollbackPlan;
}

/**
 * Retrieves and decrypts a stored rollback plan from the database.
 */
async function getRollbackPlan(deploymentId) {
  if (!db.pgPool) {
    return null;
  }

  try {
    const query = `
      SELECT pgp_sym_decrypt(rollback_plan, $1) as plan_json
      FROM deployments
      WHERE id = $2;
    `;
    const result = await db.pgPool.query(query, [ENCRYPTION_KEY, deploymentId]);
    if (result.rows.length === 0 || !result.rows[0].plan_json) {
      return null;
    }
    return JSON.parse(result.rows[0].plan_json);
  } catch (err) {
    console.error('Failed to decrypt and retrieve rollback plan:', err.message);
    throw err;
  }
}

module.exports = {
  generateRollbackPlan,
  getRollbackPlan
};
