const test = require('node:test');
const assert = require('node:assert');
const databaseConfig = require('../../backend/config/database');
const { setupPipeline } = require('../../backend/src/services/github');

test('GitHub Pipeline Setup Service - connects successfully in Mock mode', async () => {
  // Mock PG Pool query returning a mock github access token
  databaseConfig.pgPool = {
    query: async (sql, params) => {
      if (sql.toLowerCase().includes('select github_access_token')) {
        return { rows: [{ github_access_token: 'mock-github-access-token-12345' }] };
      }
      return { rows: [] };
    }
  };

  const userId = '00000000-0000-0000-0000-000000000000';
  const repo = 'UsmanXTech/payment-service';

  const result = await setupPipeline(userId, repo, databaseConfig.pgPool);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.branch, 'pipelinedoc-ci');
  assert.ok(result.message.includes('Sandbox Mode'));
});

test('GitHub Pipeline Setup Service - throws error if repo formatting is invalid', async () => {
  const userId = '00000000-0000-0000-0000-000000000000';
  const repo = 'invalid_format';

  await assert.rejects(
    async () => {
      await setupPipeline(userId, repo, databaseConfig.pgPool);
    },
    /Invalid repository name/
  );
});
