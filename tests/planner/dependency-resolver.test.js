const test = require('node:test');
const assert = require('node:assert');
const { resolveDependencies } = require('../../backend/agents/planner/dependency-resolver');

test('Dependency Resolver - sorts dependencies correctly (auth-service first)', () => {
  const result = resolveDependencies(['frontend-app', 'auth-service', 'payment-service']);
  assert.deepStrictEqual(result.deploy_order, ['auth-service', 'payment-service', 'frontend-app']);
});

test('Dependency Resolver - throws error on circular dependency', () => {
  const fs = require('fs');
  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;

  // Mock circular dependency config
  fs.existsSync = (p) => p.includes('services.json');
  fs.readFileSync = () => JSON.stringify({
    'service-a': ['service-b'],
    'service-b': ['service-a']
  });

  assert.throws(() => {
    resolveDependencies();
  }, /Circular dependency/);

  fs.existsSync = originalExistsSync;
  fs.readFileSync = originalReadFileSync;
});
