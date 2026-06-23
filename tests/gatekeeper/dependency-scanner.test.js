const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { extractNewDependencies, scanDependencies } = require('../../backend/agents/gatekeeper/dependency-scanner');

// Mock axios
const originalPost = axios.post;

test('Dependency Scanner - extracts newly added dependencies from package.json', () => {
  const diff = `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -20,2 +20,4 @@
   "dependencies": {
-    "lodash": "^4.17.15"
+    "lodash": "^4.17.21",
+    "express": "^4.18.2"
   }
 `;

  const deps = extractNewDependencies(diff);

  assert.strictEqual(deps.length, 2);
  assert.strictEqual(deps[0].name, 'lodash');
  assert.strictEqual(deps[0].version, '4.17.21');
  assert.strictEqual(deps[1].name, 'express');
  assert.strictEqual(deps[1].version, '4.18.2');
});

test('Dependency Scanner - extracts python dependencies from requirements.txt', () => {
  const diff = `diff --git a/requirements.txt b/requirements.txt
--- a/requirements.txt
+++ b/requirements.txt
@@ -5,1 +5,2 @@
-requests==2.28.0
+requests==2.31.0
+flask==2.2.3
 `;

  const deps = extractNewDependencies(diff);

  assert.strictEqual(deps.length, 2);
  assert.strictEqual(deps[0].name, 'requests');
  assert.strictEqual(deps[0].version, '2.31.0');
  assert.strictEqual(deps[1].name, 'flask');
  assert.strictEqual(deps[1].version, '2.2.3');
});

test('Dependency Scanner - scans dependencies for vulnerabilities (mock OSV API)', async () => {
  // Mock OSV response with a vulnerability
  axios.post = async (url, data) => {
    if (data.package.name === 'lodash') {
      return {
        data: {
          vulns: [
            {
              id: 'GHSA-35jh-874p-xv43',
              aliases: ['CVE-2021-23337'],
              summary: 'Prototype Pollution in lodash',
              database_specific: { severity: 'HIGH' },
              affected: [{ ranges: [{ events: [{ fixed: '4.17.21' }] }] }]
            }
          ]
        }
      };
    }
    return { data: {} };
  };

  const diff = `diff --git a/package.json b/package.json
+++ b/package.json
+    "lodash": "^4.17.20"
`;

  const report = await scanDependencies(diff);

  assert.strictEqual(report.packagesScanned, 1);
  assert.strictEqual(report.vulnerabilities.length, 1);
  assert.strictEqual(report.vulnerabilities[0].package, 'lodash');
  assert.strictEqual(report.vulnerabilities[0].severity, 'HIGH');
  assert.strictEqual(report.vulnerabilities[0].cve_id, 'CVE-2021-23337');
  assert.strictEqual(report.vulnerabilities[0].fix_version, '4.17.21');

  // Restore
  axios.post = originalPost;
});
