const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { ingestLogs, stripAnsi, stripTimestamp } = require('../../agents/analysis/log-ingester');
const { parseDiff } = require('../../agents/analysis/diff-parser');

test('Log Ingester - Strips ANSI Escape Sequences', () => {
  const input = '\u001b[31mFAIL\u001b[0m tests/api.test.js';
  const clean = stripAnsi(input);
  assert.strictEqual(clean, 'FAIL tests/api.test.js');
});

test('Log Ingester - Strips Timestamps from line starts', () => {
  const input = '2026-06-17T15:58:46.1234567Z  Error: something went wrong';
  const clean = stripTimestamp(input);
  assert.strictEqual(clean, ' Error: something went wrong');
});

test('Log Ingester - Parses failure logs and extracts errors with context', () => {
  const filePath = path.join(__dirname, '../fixtures/sample-failure.log');
  const rawLogs = fs.readFileSync(filePath, 'utf8');

  const result = ingestLogs(rawLogs);

  // Assertions
  assert.ok(result.sections.length > 0);
  assert.ok(result.errors.length > 0);
  
  // Checks if specific error phrases were captured
  const errMessages = result.errors.map(e => e.content);
  assert.ok(errMessages.some(m => m.includes('FAIL tests/api.test.js')));
  assert.ok(errMessages.some(m => m.includes('Error: connect ECONNREFUSED')));
  assert.ok(errMessages.some(m => m.includes('npm ERR!')));

  // Check if warning was captured
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings[0].content.includes('deprecated library-a'));

  // Checks context mapping
  assert.match(result.errorContext, /Line 9/); // FAIL line context
  assert.match(result.errorContext, /Line 18/); // ECONNREFUSED line context
});

test('Diff Parser - Parses Git Diff correctly', () => {
  const rawDiff = `diff --git a/api/src/index.js b/api/src/index.js
index 1234567..89abcde 100644
--- a/api/src/index.js
+++ b/api/src/index.js
@@ -10,3 +10,4 @@
-const port = 3000;
+const port = process.env.PORT || 3000;
+async function bootstrapApp() {
+  console.log('bootstrapping');
+}
diff --git a/tests/new.test.js b/tests/new.test.js
new file mode 100644
index 0000000..9999999
--- /dev/null
+++ b/tests/new.test.js
@@ -0,0 +1,1 @@
+test('new', () => {});
`;

  const parsed = parseDiff(rawDiff);

  assert.strictEqual(parsed.files.length, 2);
  
  // Check index.js
  const file1 = parsed.files.find(f => f.path === 'api/src/index.js');
  assert.ok(file1);
  assert.strictEqual(file1.additions, 4);
  assert.strictEqual(file1.deletions, 1);
  assert.ok(!file1.isNew);
  assert.ok(!file1.isDeleted);
  assert.deepStrictEqual(file1.newFunctions, ['bootstrapApp']);

  // Check new.test.js
  const file2 = parsed.files.find(f => f.path === 'tests/new.test.js');
  assert.ok(file2);
  assert.strictEqual(file2.additions, 1);
  assert.strictEqual(file2.deletions, 0);
  assert.ok(file2.isNew);
});
