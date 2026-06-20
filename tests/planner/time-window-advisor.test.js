const test = require('node:test');
const assert = require('node:assert');
const databaseConfig = require('../../config/database');

const originalPgPool = databaseConfig.pgPool;
const originalRedisClient = databaseConfig.redisClient;

// Mock database config pgPool.query
databaseConfig.pgPool = {
  query: async () => ({
    rows: [
      { hour: '9', deploy_count: '5' },
      { hour: '17', deploy_count: '12' }
    ]
  })
};

const { getRecommendedWindows } = require('../../agents/planner/time-window-advisor');

test('Time Window Advisor - returns top 3 recommended windows', async () => {
  const result = await getRecommendedWindows();
  assert.strictEqual(result.recommended_windows.length, 3);
  
  const window = result.recommended_windows[0];
  assert.ok(window.start);
  assert.ok(window.end);
  assert.ok(window.risk_level);
  assert.ok(window.reason);
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
