const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const databaseConfig = require('../../backend/config/database');

// Mock Redis client
const originalRedisClient = databaseConfig.redisClient;
const mockCache = {};
databaseConfig.redisClient = {
  get: async (key) => mockCache[key],
  set: async (key, val, mode, ttl) => {
    mockCache[key] = val;
    return 'OK';
  },
  disconnect: () => {}
};

// Mock axios
const originalPost = axios.post;
const originalGet = axios.get;

test('UiPath Test Cloud - Access Token retrieves and caches token in Redis', async () => {
  let oauthCalled = false;

  axios.post = async (url) => {
    if (url.includes('/oauth/token')) {
      oauthCalled = true;
      return {
        data: {
          access_token: 'uipath-valid-access-token',
          expires_in: 3600
        }
      };
    }
  };

  const { getAccessToken } = require('../../backend/integrations/uipath/test-cloud');

  // First call should query OAuth and store token in Redis
  const token1 = await getAccessToken();
  assert.strictEqual(token1, 'uipath-valid-access-token');
  assert.strictEqual(oauthCalled, true);
  assert.strictEqual(mockCache['uipath:access_token'], 'uipath-valid-access-token');

  // Second call should fetch directly from mock Redis cache (without triggering OAuth again)
  oauthCalled = false;
  const token2 = await getAccessToken();
  assert.strictEqual(token2, 'uipath-valid-access-token');
  assert.strictEqual(oauthCalled, false);
});

test('UiPath Test Cloud - triggerTestSuite falls back to mock in non-prod', async () => {
  const { triggerTestSuite } = require('../../backend/integrations/uipath/test-cloud');
  const result = await triggerTestSuite(111, 'Production');
  assert.ok(result.executionId.startsWith('mock-exec-'));
  assert.strictEqual(result.status, 'pending');
});

test('UiPath Test Cloud - getTestReport processes mock results correctly', async () => {
  const { getTestReport } = require('../../backend/integrations/uipath/test-cloud');
  
  const reportPass = await getTestReport('mock-exec-pass');
  assert.strictEqual(reportPass.status, 'Passed');
  assert.strictEqual(reportPass.failed, 0);

  const reportFail = await getTestReport('mock-exec-fail');
  assert.strictEqual(reportFail.status, 'Failed');
  assert.strictEqual(reportFail.failed, 2);
});

// Restore mocks
test.after(() => {
  axios.post = originalPost;
  axios.get = originalGet;
  databaseConfig.redisClient = originalRedisClient;

  const { pgPool } = require('../../backend/config/database');
  if (pgPool && typeof pgPool.end === 'function') {
    pgPool.end().catch(() => {});
  }
  if (originalRedisClient) {
    originalRedisClient.disconnect();
  }
});
