const test = require('node:test');
const assert = require('node:assert');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const databaseConfig = require('../../backend/config/database');
const slackClient = require('../../backend/integrations/slack/client');
const anthropic = require('../../backend/config/anthropic');
const axios = require('axios');

const originalPgPool = databaseConfig.pgPool;
const originalRedisClient = databaseConfig.redisClient;
const originalSendSlackMessage = slackClient.sendSlackMessage;
const originalAnthropicCreate = anthropic.messages.create;
const originalAxiosPost = axios.post;

// Set mocks to avoid actual database or API triggers
databaseConfig.pgPool = {
  query: async () => ({ rows: [] })
};
databaseConfig.redisClient = null;

slackClient.sendSlackMessage = async () => ({ ok: true });
anthropic.messages.create = async () => ({
  content: [{ text: '{"root_cause":"Connection refused","failure_type":"environment_issue","fixes":[]}' }]
});

const maestro = require('../../backend/integrations/uipath/maestro');

test('Maestro - startOrchestration in non-prod returns mock job details', async () => {
  const result = await maestro.startOrchestration('FailureDoctorFlow', { repo: 'payment-service' });
  assert.strictEqual(result.mocked, true);
  assert.strictEqual(result.status, 'Pending');
  assert.ok(result.jobId.includes('mock-maestro-job-FailureDoctorFlow'));
});

test('Maestro - getOrchestrationStatus in non-prod returns mock status details', async () => {
  const result = await maestro.getOrchestrationStatus('mock-maestro-job-12345');
  assert.strictEqual(result.mocked, true);
  assert.strictEqual(result.status, 'Successful');
});

test('Maestro - runFailureDoctorFlow executes sequence successfully', async () => {
  // Mock githubClient methods
  const githubClient = require('../../backend/integrations/github/client');
  const originalGetWorkflowLogs = githubClient.getWorkflowLogs;
  const originalGetCommitDiff = githubClient.getCommitDiff;
  const originalGetCommit = githubClient.getCommit;
  const originalCreatePRComment = githubClient.createPRComment;

  githubClient.getWorkflowLogs = async () => 'Error connect ECONNREFUSED';
  githubClient.getCommitDiff = async () => 'diff';
  githubClient.getCommit = async () => ({ commit: { author: { email: 'dev@example.com' } } });
  githubClient.createPRComment = async () => ({});

  const inputs = {
    owner: 'test-owner',
    repo: 'test-repo',
    runId: 101,
    commitSha: 'sha123',
    branch: 'main',
    commitMessage: 'fix bug',
    prNumber: 45,
    slackChannel: 'general',
    incidentId: 'incident-abc'
  };

  const status = await maestro.runFailureDoctorFlow(inputs);
  assert.strictEqual(status.success, true);
  assert.ok(status.result.diagnosis !== undefined);

  // Restore githubClient
  githubClient.getWorkflowLogs = originalGetWorkflowLogs;
  githubClient.getCommitDiff = originalGetCommitDiff;
  githubClient.getCommit = originalGetCommit;
  githubClient.createPRComment = originalCreatePRComment;
});

test('Maestro - runDeployFlow executes sequence and reports success', async () => {
  // Mock dependency calls
  const gatekeeper = require('../../backend/agents/gatekeeper/gate-decision');
  const originalEvaluateGate = gatekeeper.evaluateGate;
  gatekeeper.evaluateGate = async () => ({
    decision: 'PASS',
    risk_score: 10,
    details: { secrets: { secrets_found: false }, breaking: { has_breaking_changes: false }, dependencies: { vulnerabilities: [] } }
  });

  const inputs = {
    deploymentId: 'mock-deploy-uuid-maestro',
    rawDiff: 'diff',
    files: [{ path: 'app.js' }],
    authorEmail: 'dev@example.com',
    hasDbMigration: false
  };

  const status = await maestro.runDeployFlow(inputs);
  assert.strictEqual(status.success, true);
  assert.strictEqual(status.details.gateResult.decision, 'PASS');

  // Restore gatekeeper
  gatekeeper.evaluateGate = originalEvaluateGate;
});

test('Maestro - runHealingFlow triggers evaluation successfully', async () => {
  const inputs = {};
  const status = await maestro.runHealingFlow(inputs);
  assert.strictEqual(status.success, true);
  assert.strictEqual(status.rollbackResult.triggered, false); // No deploy simulated
});

test('CLI Script - run-uipath-tests.js executes successfully in mock mode', async () => {
  const { stdout } = await execPromise('node scripts/run-uipath-tests.js', {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      UIPATH_SUITE_ID: 'pass-suite-id'
    }
  });
  assert.match(stdout, /completed with status: Passed/);
  assert.match(stdout, /passed successfully/);
});

test('Autopilot - queryChat queries the chat endpoint and streams successfully', async () => {
  const autopilot = require('../../scripts/uipath-autopilot-agent');
  
  const originalPost = axios.post;
  
  const { Readable } = require('stream');
  const mockStream = new Readable();
  mockStream.push('data: {"type": "text", "text": "Hello from Autopilot"}\n');
  mockStream.push('data: {"type": "tool_start", "name": "get_slo_status", "input": {}}\n');
  mockStream.push('data: {"type": "tool_result", "name": "get_slo_status", "result": []}\n');
  mockStream.push('data: [DONE]\n');
  mockStream.push(null);
  
  axios.post = async () => ({
    data: mockStream
  });
  
  const originalWrite = process.stdout.write;
  let stdoutData = '';
  process.stdout.write = (chunk) => {
    stdoutData += chunk;
  };
  
  await autopilot.queryChat("What's our SLO status?");
  
  process.stdout.write = originalWrite;
  axios.post = originalPost;
  
  assert.match(stdoutData, /Hello from Autopilot/);
});

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
