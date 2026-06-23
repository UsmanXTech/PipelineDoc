const test = require('node:test');
const assert = require('node:assert');
const { detectBreakingChanges } = require('../../backend/agents/gatekeeper/breaking-change-detector');

test('Breaking Change Detector - detects database column drops', () => {
  const diff = `diff --git a/migrations/v2.sql b/migrations/v2.sql
index 12345..67890 100644
--- a/migrations/v2.sql
+++ b/migrations/v2.sql
@@ -1,3 +1,2 @@
-ALTER TABLE users DROP COLUMN phone_number;
+ALTER TABLE users ADD COLUMN phone TEXT;
 `;

  const result = detectBreakingChanges(diff);

  assert.strictEqual(result.has_breaking_changes, true);
  assert.strictEqual(result.changes.length, 1);
  assert.strictEqual(result.changes[0].type, 'db_breaking_change');
  assert.match(result.changes[0].description, /DROP COLUMN/);
});

test('Breaking Change Detector - detects API route removals', () => {
  const diff = `diff --git a/api/src/routes/users.js b/api/src/routes/users.js
--- a/api/src/routes/users.js
+++ b/api/src/routes/users.js
@@ -10,3 +10,1 @@
-router.delete('/:id', async (req, res) => {
-  db.delete(req.params.id);
-});
+console.log('route removed');
 `;

  const result = detectBreakingChanges(diff);

  assert.strictEqual(result.has_breaking_changes, true);
  assert.strictEqual(result.changes[0].type, 'api_breaking_change');
});

test('Breaking Change Detector - detects environment variable deletions', () => {
  const diff = `diff --git a/.env.example b/.env.example
--- a/.env.example
+++ b/.env.example
-JWT_SECRET=your_secret_here
+TOKEN_SECRET=your_secret_here
 `;

  const result = detectBreakingChanges(diff);

  assert.strictEqual(result.has_breaking_changes, true);
  assert.strictEqual(result.changes[0].type, 'env_breaking_change');
  assert.match(result.changes[0].description, /JWT_SECRET/);
});
