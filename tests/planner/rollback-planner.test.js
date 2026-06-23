const test = require('node:test');
const assert = require('node:assert');
const databaseConfig = require('../../backend/config/database');

const originalPgPool = databaseConfig.pgPool;
const originalRedisClient = databaseConfig.redisClient;

// Mock database pool
let dbMockQueryCalled = false;
let dbEncryptedPayload = null;
databaseConfig.pgPool = {
  query: async (sql, params) => {
    dbMockQueryCalled = true;
    if (sql.includes('pgp_sym_encrypt')) {
      dbEncryptedPayload = params[0]; // Stores the JSON string
    }
    if (sql.includes('pgp_sym_decrypt')) {
      return { rows: [{ plan_json: dbEncryptedPayload }] };
    }
    return { rows: [] };
  }
};

const { generateRollbackPlan, getRollbackPlan } = require('../../backend/agents/planner/rollback-planner');

test('Rollback Planner - generates and encrypts/decrypts rollback plan successfully', async () => {
  const deploymentId = '550e8400-e29b-41d4-a716-446655440000';
  const plan = await generateRollbackPlan({
    deploymentId,
    repo: 'payment-service',
    previousCommitSha: 'sha9999',
    hasDbMigration: true,
    changedFlags: [{ key: 'new-ui-enabled', previousValue: 'false' }]
  });

  // Verify plan shape
  assert.strictEqual(plan.deployment_id, deploymentId);
  assert.strictEqual(plan.rollback_steps.length, 4); // flag, db, k8s, dns
  assert.strictEqual(plan.rollback_steps[0].type, 'config_restore');
  assert.strictEqual(plan.rollback_steps[1].type, 'db_rollback');
  assert.strictEqual(plan.rollback_steps[2].type, 'kubernetes_rollout');
  assert.strictEqual(plan.rollback_steps[3].type, 'dns_switch');

  // Verify DB interaction
  assert.strictEqual(dbMockQueryCalled, true);
  assert.ok(dbEncryptedPayload);

  // Verify Decryption
  const decrypted = await getRollbackPlan(deploymentId);
  assert.deepStrictEqual(decrypted, plan);
});

test.after(() => {
  databaseConfig.pgPool = originalPgPool;
  databaseConfig.redisClient = originalRedisClient;
  
  if (originalPgPool && typeof originalPgPool.end === 'function') {
    originalPgPool.end().catch(() => {});
  }
  if (originalRedisClient) {
    originalRedisClient.disconnect();
  }
});
