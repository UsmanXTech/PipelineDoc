const test = require('node:test');
const assert = require('node:assert');
const { scanSecrets } = require('../../agents/gatekeeper/secret-detector');

test('Secret Detector - flags hardcoded GitHub personal access tokens', () => {
  const diff = `diff --git a/app.js b/app.js
--- a/app.js
+++ b/app.js
@@ -10,3 +10,4 @@
+const token = "ghp_mYqP4w7Z1nK2L9x8J7h6g5f4e3d2c1b0a9z8";
 `;

  const report = scanSecrets(diff);

  assert.strictEqual(report.secrets_found, true);
  assert.strictEqual(report.findings.length, 1);
  assert.strictEqual(report.findings[0].pattern_type, 'GitHub Token');
});

test('Secret Detector - flags OpenAI/Anthropic API keys', () => {
  const diff = `diff --git a/app.js b/app.js
--- a/app.js
+++ b/app.js
@@ -10,3 +10,4 @@
+const apiKey = 'sk-proj-a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6';
 `;

  const report = scanSecrets(diff);

  assert.strictEqual(report.secrets_found, true);
  assert.strictEqual(report.findings[0].pattern_type, 'Anthropic/OpenAI API Key');
});

test('Secret Detector - flags password string values', () => {
  const diff = `diff --git a/app.js b/app.js
--- a/app.js
+++ b/app.js
@@ -10,3 +10,4 @@
+const config = { password: "admin_super_secret_pwd_123" };
 `;

  const report = scanSecrets(diff);

  assert.strictEqual(report.secrets_found, true);
  assert.strictEqual(report.findings[0].pattern_type, 'Password/Secret Assignment');
});

test('Secret Detector - ignores placeholder strings and test files', () => {
  const diff = `diff --git a/tests/test.js b/tests/test.js
--- a/tests/test.js
+++ b/tests/test.js
+const token = "ghp_mYqP4w7Z1nK2L9x8J7h6g5f4e3d2c1b0a9z8"; // mock secret in tests is skipped
+const apiKey = "your_key_here"; // placeholder is skipped
 `;

  const report = scanSecrets(diff);

  assert.strictEqual(report.secrets_found, false);
});
