const test = require('node:test');
const assert = require('node:assert');
const databaseConfig = require('../../config/database');
const slackClient = require('../../integrations/slack/client');
const { generateRollbackPlan } = require('../../agents/planner/rollback-planner');

const originalPgPool = databaseConfig.pgPool;
const originalRedisClient = databaseConfig.redisClient;
const originalSendSlackMessage = slackClient.sendSlackMessage;

// Test state mocks
let dbQueries = [];
let slackMessages = [];
let rollbackStepsSaved = null;

databaseConfig.pgPool = {
  query: async (sql, params) => {
    dbQueries.push({ sql, params });
    if (sql.includes('pgp_sym_encrypt')) {
      rollbackStepsSaved = params[0];
    }
    if (sql.includes('pgp_sym_decrypt')) {
      return { rows: [{ plan_json: rollbackStepsSaved }] };
    }
    return { rows: [] };
  }
};

slackClient.sendSlackMessage = async (msg) => {
  slackMessages.push(msg);
  return { ok: true };
};

const { executeDeployment } = require('../../agents/planner/deploy-coordinator');

test('Deploy Coordinator - runs successful deployment and logs stages', async () => {
  dbQueries = [];
  slackMessages = [];

  const deploymentId = '550e8400-e29b-41d4-a716-446655440001';
  const strategyPlan = {
    strategy: 'canary',
    stages: [
      { name: 'canary_5', traffic_percent: 5, wait_minutes: 10, health_checks: ['latency'] },
      { name: 'production_100', traffic_percent: 100, wait_minutes: 0, health_checks: [] }
    ]
  };

  const success = await executeDeployment(deploymentId, strategyPlan, {
    pollIntervalMs: 5
  });

  assert.strictEqual(success, true);
  assert.ok(slackMessages.some(m => m.text.includes('Stage *canary_5* is now *running*')));
  assert.ok(slackMessages.some(m => m.text.includes('Stage *canary_5* is now *success*')));
  assert.ok(slackMessages.some(m => m.text.includes('Stage *completed* is now *success*')));
});

test('Deploy Coordinator - triggers rollback if stage health check fails', async () => {
  dbQueries = [];
  slackMessages = [];

  const deploymentId = '550e8400-e29b-41d4-a716-446655440002';
  
  await generateRollbackPlan({
    deploymentId,
    repo: 'payment-service',
    previousCommitSha: 'sha777',
    hasDbMigration: false
  });

  const strategyPlan = {
    strategy: 'canary',
    stages: [
      { name: 'canary_5', traffic_percent: 5, wait_minutes: 10, health_checks: ['error_rate'] }
    ]
  };

  const success = await executeDeployment(deploymentId, strategyPlan, {
    pollIntervalMs: 5,
    simulateHealthFailure: true
  });

  assert.strictEqual(success, false);
  assert.ok(slackMessages.some(m => m.text.includes('Stage *rollback* is now *rolling_back*')));
  assert.ok(slackMessages.some(m => m.text.includes('Stage *rollback* is now *rolled_back*')));
});

test.after(() => {
  databaseConfig.pgPool = originalPgPool;
  databaseConfig.redisClient = originalRedisClient;
  slackClient.sendSlackMessage = originalSendSlackMessage;

  if (originalPgPool && typeof originalPgPool.end === 'function') {
    originalPgPool.end().catch(() => {});
  }
  if (originalRedisClient) {
    originalRedisClient.disconnect();
  }
});
