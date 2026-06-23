const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const databaseConfig = require('../../backend/config/database');
const slackClient = require('../../backend/integrations/slack/client');
const anthropic = require('../../backend/config/anthropic');

// Save original objects
const originalPgPool = databaseConfig.pgPool;
const originalRedisClient = databaseConfig.redisClient;
const originalSendSlackMessage = slackClient.sendSlackMessage;
const originalAnthropicCreate = anthropic.messages.create;
const originalAxiosPost = axios.post;

// Globally mock anthropic messages create by default
anthropic.messages.create = async () => {
  return {
    content: [{ text: '{}' }]
  };
};

// Mock Redis
class RedisMock {
  constructor() {
    this.data = {};
    this.lists = {};
  }

  async get(key) {
    return this.data[key] || null;
  }

  async set(key, val, exOpt, exVal) {
    this.data[key] = val;
    return 'OK';
  }

  async lrange(key, start, stop) {
    const list = this.lists[key] || [];
    if (stop === -1) {
      return list.slice(start);
    }
    return list.slice(start, stop + 1);
  }
}

// Mock Postgres
const deploymentsDb = {};
const incidentsDb = {};
const mockPgPool = {
  query: async (sql, params) => {
    const sqlNormalized = sql.toLowerCase().replace(/\s+/g, ' ');
    
    // INSERT INTO incidents
    if (sqlNormalized.includes('insert into incidents')) {
      const [id, deployment_id, type, root_cause, raw_logs, resolution] = params;
      incidentsDb[id] = { id, deployment_id, type, root_cause, raw_logs, resolution };
      return { rowCount: 1 };
    }
    // SELECT from incidents
    if (sqlNormalized.includes('from incidents') && sqlNormalized.includes('select')) {
      const deploymentId = params.find(p => typeof p === 'string' && p.length === 36);
      const rows = Object.entries(incidentsDb)
        .filter(([id, i]) => i.deployment_id === deploymentId)
        .map(([id, i]) => ({ id, ...i }));
      return { rows };
    }
    if (sqlNormalized.includes('from deployments') && sqlNormalized.includes('select') && !sqlNormalized.includes('pgp_sym_decrypt')) {
      const rows = Object.values(deploymentsDb)
        .filter(d => d.status === 'success')
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
      return { rows };
    }
    if (sqlNormalized.includes('pgp_sym_decrypt')) {
      console.log('DEBUG decrypt SQL:', sql);
      console.log('DEBUG decrypt params:', params);
      const deploymentId = params.find(p => typeof p === 'string' && p.length === 36);
      console.log('DEBUG decrypt found id:', deploymentId, 'exists:', !!deploymentsDb[deploymentId]);
      const deploy = deploymentsDb[deploymentId];
      return { rows: deploy ? [{ plan_json: deploy.rollback_plan }] : [] };
    }
    // UPDATE deployments SET status
    if (sqlNormalized.includes('update deployments set status')) {
      let status = 'rolled_back';
      if (sql.includes("'rolling_back'")) {
        status = 'rolling_back';
      } else if (sql.includes("'rollback_failed'")) {
        status = 'rollback_failed';
      }
      const id = params.find(p => typeof p === 'string' && p.length === 36);
      if (deploymentsDb[id]) {
        deploymentsDb[id].status = status;
      }
      return { rowCount: 1 };
    }
    // UPDATE incidents SET resolution
    if (sqlNormalized.includes('update incidents set resolution')) {
      let resolution = 'resolved';
      if (sql.includes("'cancelled_by_user'") || (params && params.includes('cancelled_by_user'))) {
        resolution = 'cancelled_by_user';
      } else if (sql.includes("'rolled_back_successfully'") || (params && params.includes('rolled_back_successfully'))) {
        resolution = 'rolled_back_successfully';
      } else if (sql.includes("'rollback_failed_verification'") || (params && params.includes('rollback_failed_verification'))) {
        resolution = 'rollback_failed_verification';
      } else if (sql.includes("'healer_failed'") || (params && params.includes('healer_failed'))) {
        resolution = 'healer_failed';
      }
      const idOrDeploymentId = params[1] || params.find(p => typeof p === 'string' && p !== resolution);
      const incident = incidentsDb[idOrDeploymentId] || Object.values(incidentsDb).find(i => i.deployment_id === idOrDeploymentId || i.id === idOrDeploymentId);
      if (incident) {
        incident.resolution = resolution;
      }
      return { rowCount: 1, rows: incident ? [incident] : [] };
    }
    return { rows: [] };
  }
};

const redisMockInstance = new RedisMock();
databaseConfig.redisClient = redisMockInstance;
databaseConfig.pgPool = mockPgPool;

let slackMessages = [];
slackClient.sendSlackMessage = async (msg) => {
  slackMessages.push(msg);
  return { ok: true };
};

let axiosPosts = [];
axios.post = async (url, data, options) => {
  axiosPosts.push({ url, data });
  return { data: { ok: true } };
};

test.after(() => {
  databaseConfig.pgPool = originalPgPool;
  databaseConfig.redisClient = originalRedisClient;
  slackClient.sendSlackMessage = originalSendSlackMessage;
  anthropic.messages.create = originalAnthropicCreate;
  axios.post = originalAxiosPost;

  if (originalPgPool && typeof originalPgPool.end === 'function') {
    originalPgPool.end().catch(() => {});
  }
  if (originalRedisClient) {
    originalRedisClient.disconnect();
  }
});

test.beforeEach(() => {
  redisMockInstance.data = {};
  redisMockInstance.lists = {};
  slackMessages = [];
  axiosPosts = [];
  for (const k of Object.keys(deploymentsDb)) delete deploymentsDb[k];
  for (const k of Object.keys(incidentsDb)) delete incidentsDb[k];
});

// Import Healer files
const { evaluateAutoRollback, cancelRollback, approveRollbackNow, executeRollbackSteps, activeTimeouts } = require('../../backend/agents/healer/auto-rollback');
const { HEALING_ACTIONS } = require('../../backend/agents/healer/healing-actions');
const { executeHealingAction } = require('../../backend/agents/healer/action-executor');
const { suggestHotfix } = require('../../backend/agents/healer/hotfix-suggester');
const { triggerMappedHealing, HEALING_PROCESS_MAP } = require('../../backend/integrations/uipath/healing-agent');
const { handleSlackAction } = require('../../backend/integrations/slack/actions');

// --- Auto-Rollback Tests ---
test('Auto-Rollback - evaluateAutoRollback returns false if no recent deploy', async () => {
  const res = await evaluateAutoRollback();
  assert.strictEqual(res.triggered, false);
});

test('Auto-Rollback - triggers rollback on 10x error rate spike', async () => {
  const deploymentId = '550e8400-e29b-41d4-a716-446655449999';
  deploymentsDb[deploymentId] = {
    id: deploymentId,
    repo: 'auth-service',
    status: 'success',
    completed_at: new Date().toISOString(),
    rollback_plan: JSON.stringify({
      deployment_id: deploymentId,
      rollback_steps: [
        { order: 1, type: 'kubernetes_rollout', command: 'kubectl rollout undo deployment/auth-service', verify_command: 'kubectl rollout status deployment/auth-service' }
      ]
    })
  };

  // Set high error rate spike (0.06) for the last 6 samples and low baseline (0.001) for 200 historical samples
  const recentHigh = Array.from({ length: 6 }, () => 
    JSON.stringify({ value: 0.06, timestamp: new Date().toISOString() })
  );
  const historicalLow = Array.from({ length: 200 }, () => 
    JSON.stringify({ value: 0.001, timestamp: new Date().toISOString() })
  );
  redisMockInstance.lists['metrics:http_error_rate'] = [...recentHigh, ...historicalLow];

  const res = await evaluateAutoRollback();
  console.log('DEBUG evaluateAutoRollback result:', res);
  assert.strictEqual(res.triggered, true);
  assert.strictEqual(res.deploymentId, deploymentId);
  assert.ok(incidentsDb[res.incidentId]);

  // Slack buttons are posted
  assert.strictEqual(slackMessages.length, 1);
  assert.ok(slackMessages[0].blocks[2].elements.length === 2); // Cancel and Approve buttons

  // Cleanup timeout
  if (activeTimeouts[deploymentId]) {
    clearTimeout(activeTimeouts[deploymentId]);
    delete activeTimeouts[deploymentId];
  }
});

test('Auto-Rollback - cancelRollback cancels pending rollback status', async () => {
  const deploymentId = '550e8400-e29b-41d4-a716-446655449999';
  await redisMockInstance.set(`rollback:pending:${deploymentId}`, 'pending');
  incidentsDb['inc-123'] = { deployment_id: deploymentId, type: 'auto_rollback', resolution: 'pending_override' };

  const success = await cancelRollback(deploymentId);
  assert.strictEqual(success, true);
  assert.strictEqual(await redisMockInstance.get(`rollback:pending:${deploymentId}`), 'cancelled');
  assert.strictEqual(incidentsDb['inc-123'].resolution, 'cancelled_by_user');
});

test('Auto-Rollback - executeRollbackSteps runs command verification successfully', async () => {
  const deploymentId = '550e8400-e29b-41d4-a716-446655449999';
  deploymentsDb[deploymentId] = {
    id: deploymentId,
    repo: 'auth-service',
    status: 'success',
    rollback_plan: JSON.stringify({
      deployment_id: deploymentId,
      rollback_steps: [
        { order: 1, type: 'kubernetes_rollout', command: 'kubectl rollout undo deployment/auth-service', verify_command: 'kubectl rollout status deployment/auth-service' }
      ]
    })
  };
  await redisMockInstance.set(`rollback:pending:${deploymentId}`, 'pending');
  incidentsDb['inc-123'] = { deployment_id: deploymentId, type: 'auto_rollback', resolution: 'pending_override' };

  const success = await executeRollbackSteps(deploymentId);
  console.log('DEBUG executeRollbackSteps result:', success);
  assert.strictEqual(success, true);
  assert.strictEqual(deploymentsDb[deploymentId].status, 'rolled_back');
  assert.strictEqual(incidentsDb['inc-123'].resolution, 'rolled_back_successfully');
});

// --- Healing Actions Test ---
test('Healing Actions - HEALING_ACTIONS library defines standard templates', () => {
  assert.ok(HEALING_ACTIONS.pod_oom);
  assert.ok(HEALING_ACTIONS.disk_full);
  assert.ok(HEALING_ACTIONS.connection_pool_exhausted);
  assert.ok(HEALING_ACTIONS.service_unhealthy);
});

// --- Action Executor Test ---
test('Action Executor - executeHealingAction executes and logs remediation', async () => {
  const context = { name: 'payment-service', current_mem_limit: '100Mi' };
  const res = await executeHealingAction('pod_oom', context);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, 'resolved');
  assert.ok(slackMessages.some(m => m.text.includes('succeeded')));
});

// --- Hotfix Suggester Test ---
test('Hotfix Suggester - suggestHotfix calls Claude and generates patch info', async () => {
  // Mock Claude API response
  const mockSuggestion = {
    title: 'Fix null reference in payment controller',
    explanation: 'Added guard condition checking if user profile is null.',
    original: 'const profile = user.profile;\n  return profile.id;',
    replacement: 'const profile = user.profile;\n  return profile ? profile.id : null;',
    verification_steps: 'Run npm test'
  };
  anthropic.messages.create = async () => {
    return {
      content: [{ text: JSON.stringify(mockSuggestion) }]
    };
  };

  const res = await suggestHotfix({
    owner: 'acme',
    repo: 'payment-app',
    filePath: 'routes/payments.js',
    line: 15,
    errorMessage: 'Cannot read properties of null (reading id)'
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.prTitle, '[PipelineDoc Hotfix] Fix null reference in payment controller');
  assert.strictEqual(res.suggestion.title, mockSuggestion.title);
  assert.ok(res.prUrl);
});

// --- UiPath Healing Agent Test ---
test('UiPath Integration - triggerMappedHealing maps process names correctly', async () => {
  const result = await triggerMappedHealing('service_admin_restart', { serviceName: 'payment-service' });
  assert.ok(result.jobId.includes('UiPath_RestartServiceProcess'));
  assert.strictEqual(result.mocked, true);
});

// --- Slack actions webhook handler Test ---
test('Slack actions webhook - handles Cancel Rollback click', async () => {
  const deploymentId = '550e8400-e29b-41d4-a716-446655449999';
  incidentsDb['inc-123'] = { deployment_id: deploymentId, type: 'auto_rollback', resolution: 'pending_override' };

  const req = {
    body: {
      payload: JSON.stringify({
        actions: [{ action_id: 'cancel_rollback', value: deploymentId }],
        user: { id: 'U12345' },
        response_url: 'https://hooks.slack.com/actions/mock'
      })
    }
  };

  let statusSent = 0;
  const res = {
    status: (code) => {
      statusSent = code;
      return {
        send: () => {}
      };
    }
  };

  await handleSlackAction(req, res);
  assert.strictEqual(statusSent, 200);

  // Status gets cancelled
  assert.strictEqual(incidentsDb['inc-123'].resolution, 'cancelled_by_user');
  assert.strictEqual(await redisMockInstance.get(`rollback:pending:${deploymentId}`), 'cancelled');

  // response_url post is made
  assert.strictEqual(axiosPosts.length, 1);
  assert.ok(axiosPosts[0].data.text.includes('Cancelled'));
});
