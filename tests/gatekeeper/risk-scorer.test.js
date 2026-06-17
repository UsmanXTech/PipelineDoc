const test = require('node:test');
const assert = require('node:assert');
const { calculateRiskScore } = require('../../agents/gatekeeper/risk-scorer');
const databaseConfig = require('../../config/database');

test('Risk Scorer - Low risk changes', async () => {
  const files = [
    { path: 'src/components/Button.js' },
    { path: 'tests/components/Button.test.js' }
  ];

  const result = await calculateRiskScore({ files, authorEmail: 'john@example.com' });

  assert.strictEqual(result.level, 'low');
  assert.ok(result.score <= 30);
  assert.strictEqual(result.breakdown.length, 0);
});

test('Risk Scorer - High risk changes (DB migration, API contract, config)', async () => {
  const files = [
    { path: 'scripts/db-migration-v2.sql' },
    { path: 'api/src/routes/payments.js' },
    { path: '.env.example' },
    { path: 'src/payments-logic.js' } // Code changed without tests
  ];

  const result = await calculateRiskScore({ files, authorEmail: 'john@example.com' });

  assert.strictEqual(result.level, 'critical');
  assert.ok(result.score >= 81);
  assert.ok(result.breakdown.some(b => b.rule.includes('Database migration')));
  assert.ok(result.breakdown.some(b => b.rule.includes('API routes')));
  assert.ok(result.breakdown.some(b => b.rule.includes('matching test files')));
});

test('Risk Scorer - Author with high recent failure rate increases score', async () => {
  // Mock DB query for incident patterns
  databaseConfig.pgPool = {
    query: async () => ({
      rows: [{ total_incidents: '4' }] // author has 4 incidents
    })
  };

  const files = [{ path: 'src/index.js' }];
  const result = await calculateRiskScore({ files, authorEmail: 'bad-pusher@example.com' });

  assert.ok(result.breakdown.some(b => b.rule.includes('Author has high recent failure rate')));
  
  // Clean up
  databaseConfig.pgPool = null;
});
