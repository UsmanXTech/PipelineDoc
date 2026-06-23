const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');

// Mock OSV response for dependency-scanner when required
const originalPost = axios.post;
axios.post = async () => ({ data: {} });

const { evaluateGate } = require('../../backend/agents/gatekeeper/gate-decision');

test('Gate Decision - PASS status on low-risk clean PRs', async () => {
  const diff = `diff --git a/src/Button.js b/src/Button.js
+++ b/src/Button.js
+console.log("hello");
`;

  const files = [{ path: 'src/Button.js' }, { path: 'tests/Button.test.js' }];

  const report = await evaluateGate({ rawDiff: diff, files, authorEmail: 'john@example.com' });

  assert.strictEqual(report.decision, 'PASS');
  assert.strictEqual(report.risk_score, 0); // No heuristics triggered
  assert.strictEqual(report.details.secrets.secrets_found, false);
});

test('Gate Decision - BLOCK status on PR containing secrets', async () => {
  const diff = `diff --git a/app.js b/app.js
+++ b/app.js
+const secret = "ghp_mYqP4w7Z1nK2L9x8J7h6g5f4e3d2c1b0a9z8";
`;

  const files = [{ path: 'app.js' }];

  const report = await evaluateGate({ rawDiff: diff, files, authorEmail: 'john@example.com' });

  assert.strictEqual(report.decision, 'BLOCK');
  assert.match(report.reason, /Secrets found/);
});

test('Gate Decision - BLOCK status on critical vulnerability', async () => {
  // Mock critical vuln response
  axios.post = async () => ({
    data: {
      vulns: [
        {
          id: 'GHSA-xxx',
          summary: 'Critical vulnerability',
          database_specific: { severity: 'CRITICAL' }
        }
      ]
    }
  });

  const diff = `diff --git a/package.json b/package.json
+++ b/package.json
+ "lodash": "1.0.0"
`;
  const files = [{ path: 'package.json' }];

  const report = await evaluateGate({ rawDiff: diff, files, authorEmail: 'john@example.com' });

  assert.strictEqual(report.decision, 'BLOCK');
  assert.match(report.reason, /Critical vulnerability detected/);

  // Restore axios
  axios.post = originalPost;
});

test('Gate Decision - WARN status on breaking changes and warnings', async () => {
  const diff = `diff --git a/api/src/routes/users.js b/api/src/routes/users.js
--- a/api/src/routes/users.js
-router.get('/', (req, res) => {});
`;

  const files = [{ path: 'api/src/routes/users.js' }];

  const report = await evaluateGate({ rawDiff: diff, files, authorEmail: 'john@example.com' });

  assert.strictEqual(report.decision, 'WARN');
  assert.match(report.reason, /breaking change/);
});

test('Gate Decision - applies penalty (+40) if UiPath suite fails', async () => {
  const diff = `diff --git a/src/Button.js b/src/Button.js
+++ b/src/Button.js
+console.log("hello");
`;
  const files = [{ path: 'src/Button.js' }, { path: 'tests/Button.test.js' }];

  const report = await evaluateGate({
    rawDiff: diff,
    files,
    authorEmail: 'john@example.com',
    uipathSuiteId: 'fail' // triggers simulated failed run
  });

  assert.strictEqual(report.risk_score, 40);
  assert.strictEqual(report.details.uipath.status, 'Failed');
});

test('Gate Decision - applies penalty (+15) if UiPath suite is flaky', async () => {
  const diff = `diff --git a/src/Button.js b/src/Button.js
+++ b/src/Button.js
+console.log("hello");
`;
  const files = [{ path: 'src/Button.js' }, { path: 'tests/Button.test.js' }];

  const report = await evaluateGate({
    rawDiff: diff,
    files,
    authorEmail: 'john@example.com',
    uipathSuiteId: 'flaky' // triggers simulated flaky run
  });

  assert.strictEqual(report.risk_score, 15);
  assert.strictEqual(report.details.uipath.flaky, 1);
});

test.after(() => {
  const { pgPool, redisClient } = require('../../backend/config/database');
  if (pgPool && typeof pgPool.end === 'function') {
    pgPool.end().catch(() => {});
  }
  if (redisClient) {
    redisClient.disconnect();
  }
});

