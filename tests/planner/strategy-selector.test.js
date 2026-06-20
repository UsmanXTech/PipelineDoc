const test = require('node:test');
const assert = require('node:assert');
const { selectStrategy } = require('../../agents/planner/strategy-selector');

test('Strategy Selector - selects maintenance window when DB migration is present', () => {
  const result = selectStrategy({ riskScore: 10, hasDbMigration: true });
  assert.strictEqual(result.strategy, 'maintenance window');
  assert.strictEqual(result.stages.length, 4);
  assert.strictEqual(result.stages[0].name, 'drain_traffic');
});

test('Strategy Selector - selects canary when risk score >= 61 and no DB migration', () => {
  const result = selectStrategy({ riskScore: 70, hasDbMigration: false });
  assert.strictEqual(result.strategy, 'canary');
  assert.strictEqual(result.stages.length, 3);
  assert.strictEqual(result.stages[0].name, 'canary_5');
});

test('Strategy Selector - selects blue/green when risk score 31-60 and no DB migration', () => {
  const result = selectStrategy({ riskScore: 45, hasDbMigration: false });
  assert.strictEqual(result.strategy, 'blue/green');
  assert.strictEqual(result.stages.length, 3);
  assert.strictEqual(result.stages[0].name, 'deploy_green');
});

test('Strategy Selector - selects rolling when risk score 0-30 and no DB migration', () => {
  const result = selectStrategy({ riskScore: 25, hasDbMigration: false });
  assert.strictEqual(result.strategy, 'rolling');
  assert.strictEqual(result.stages.length, 1);
  assert.strictEqual(result.stages[0].name, 'rolling_update');
});
