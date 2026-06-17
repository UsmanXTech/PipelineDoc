const test = require('node:test');
const assert = require('node:assert');

// Mock githubClient
const githubClient = require('../../integrations/github/client');
const originalGetPRDetails = githubClient.getPRDetails;
const originalGetPRReviews = githubClient.getPRReviews;

// Mock databaseConfig
const databaseConfig = require('../../config/database');
const mockIncidents = [];
databaseConfig.pgPool = {
  query: async (sql, params) => {
    mockIncidents.push({ sql, params });
    return { rows: [] };
  }
};

const { checkGateOverride } = require('../../agents/gatekeeper/override-check');

test('Override Check - returns false if label is missing', async () => {
  githubClient.getPRDetails = async () => ({
    labels: [{ name: 'bug' }] // No gate-override label
  });

  const result = await checkGateOverride({ owner: 'owner', repo: 'repo', prNumber: 1 });

  assert.strictEqual(result.allowed, false);
  assert.match(result.reason, /does not have the "gate-override" label/);
});

test('Override Check - returns false if override label present but insufficient approvals', async () => {
  githubClient.getPRDetails = async () => ({
    labels: [{ name: 'gate-override' }]
  });

  githubClient.getPRReviews = async () => [
    { state: 'APPROVED', user: { login: 'approver1' } } // Only 1 approval
  ];

  const result = await checkGateOverride({ owner: 'owner', repo: 'repo', prNumber: 2 });

  assert.strictEqual(result.allowed, false);
  assert.match(result.reason, /only has 1 approved review/);
});

test('Override Check - returns true and logs incident if override label present and >=2 approvals', async () => {
  githubClient.getPRDetails = async () => ({
    labels: [{ name: 'gate-override' }]
  });

  githubClient.getPRReviews = async () => [
    { state: 'APPROVED', user: { login: 'approver1' } },
    { state: 'APPROVED', user: { login: 'approver2' } } // 2 approvals
  ];

  const result = await checkGateOverride({ owner: 'owner', repo: 'repo', prNumber: 3 });

  assert.strictEqual(result.allowed, true);
  assert.match(result.reason, /Override approved/);

  // Check database log
  assert.strictEqual(mockIncidents.length, 1);
  assert.strictEqual(mockIncidents[0].params[0], 'gate_override');
});

// Restore mocks
test.after(() => {
  githubClient.getPRDetails = originalGetPRDetails;
  githubClient.getPRReviews = originalGetPRReviews;
  databaseConfig.pgPool = null;

  const { pgPool, redisClient } = require('../../config/database');
  if (pgPool && typeof pgPool.end === 'function') {
    pgPool.end().catch(() => {});
  }
  if (redisClient) {
    redisClient.disconnect();
  }
});
