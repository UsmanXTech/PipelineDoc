const test = require('node:test');
const assert = require('node:assert');

// Mock components
const webhook = require('../../backend/integrations/github/webhook');

test('GitHub Webhook Handler - rejects invalid signature with 401', async () => {
  let statusResult = null;
  let jsonResult = null;

  const mockReq = {
    headers: {
      'x-github-event': 'workflow_run',
      'x-hub-signature-256': 'sha256=invalid-signature-hash'
    },
    body: {
      action: 'completed',
      workflow_run: { id: 1234, status: 'completed', conclusion: 'failure' }
    },
    rawBody: Buffer.from(JSON.stringify({}))
  };

  const mockRes = {
    status: (code) => {
      statusResult = code;
      return mockRes;
    },
    json: (data) => {
      jsonResult = data;
      return mockRes;
    }
  };

  await webhook.handleWebhook(mockReq, mockRes);

  assert.strictEqual(statusResult, 401);
  assert.deepStrictEqual(jsonResult, { error: 'Invalid signature' });
});

test('GitHub Webhook Handler - bypasses signature in test and processes event', async () => {
  let statusResult = null;
  let jsonResult = null;
  let workflowRunTriggered = false;

  // Mock handleWorkflowRun to verify it gets called
  const originalHandleWorkflowRun = webhook.handleWorkflowRun;
  webhook.handleWorkflowRun = async () => {
    workflowRunTriggered = true;
  };

  const mockReq = {
    headers: {
      'x-github-event': 'workflow_run',
      'x-bypass-signature': 'true' // test header to skip signature verification
    },
    body: {
      action: 'completed',
      workflow_run: { id: 1234, status: 'completed', conclusion: 'failure' }
    }
  };

  const mockRes = {
    status: (code) => {
      statusResult = code;
      return mockRes;
    },
    json: (data) => {
      jsonResult = data;
      return mockRes;
    }
  };

  await webhook.handleWebhook(mockReq, mockRes);

  assert.ok(statusResult === null || statusResult === 200); // should be successful status code
  assert.strictEqual(jsonResult.received, true);
  assert.strictEqual(workflowRunTriggered, true);

  // Restore
  webhook.handleWorkflowRun = originalHandleWorkflowRun;
});

test('GitHub Webhook Handler - handlePullRequest triggers gate evaluation and creates check run', async () => {
  const githubClient = require('../../backend/integrations/github/client');
  const originalGetCommit = githubClient.getCommit;
  const originalCreateCheckRun = githubClient.createCheckRun;
  const originalUpdateCheckRun = githubClient.updateCheckRun;
  const originalGetPRDiff = githubClient.getPRDiff;
  const originalGetPRFiles = githubClient.getPRFiles;
  const originalCreatePRComment = githubClient.createPRComment;

  let checkRunCreated = false;
  let checkRunUpdated = false;
  let checkRunData = null;

  githubClient.getCommit = async () => ({
    commit: { author: { email: 'test-author@example.com' } }
  });

  githubClient.createCheckRun = async (owner, repo, data) => {
    checkRunCreated = true;
    checkRunData = data;
    return { id: 777 };
  };

  githubClient.updateCheckRun = async (owner, repo, checkRunId, data) => {
    checkRunUpdated = true;
    checkRunData = { ...checkRunData, ...data };
    return {};
  };

  githubClient.getPRDiff = async () => `
diff --git a/src/index.js b/src/index.js
+++ b/src/index.js
+console.log("clean change");
`;

  githubClient.getPRFiles = async () => [
    { filename: 'src/index.js' }
  ];

  githubClient.createPRComment = async () => ({});

  await webhook.runGateEvaluation('test-owner', 'test-repo', 123, 'abcdef123456', 'test-author@example.com');

  assert.strictEqual(checkRunCreated, true);
  assert.strictEqual(checkRunUpdated, true);
  assert.strictEqual(checkRunData.status, 'completed');
  assert.strictEqual(checkRunData.conclusion, 'success');
  assert.match(checkRunData.output.title, /Gate Decision: PASS/);

  // Restore mocks
  githubClient.getCommit = originalGetCommit;
  githubClient.createCheckRun = originalCreateCheckRun;
  githubClient.updateCheckRun = originalUpdateCheckRun;
  githubClient.getPRDiff = originalGetPRDiff;
  githubClient.getPRFiles = originalGetPRFiles;
  githubClient.createPRComment = originalCreatePRComment;
});

test('GitHub Webhook Handler - handlePullRequest blocks PR containing secrets and checks override', async () => {
  const githubClient = require('../../backend/integrations/github/client');
  const originalGetCommit = githubClient.getCommit;
  const originalCreateCheckRun = githubClient.createCheckRun;
  const originalUpdateCheckRun = githubClient.updateCheckRun;
  const originalGetPRDiff = githubClient.getPRDiff;
  const originalGetPRFiles = githubClient.getPRFiles;
  const originalCreatePRComment = githubClient.createPRComment;
  const originalGetPRDetails = githubClient.getPRDetails;
  const originalGetPRReviews = githubClient.getPRReviews;

  let checkRunCreated = false;
  let checkRunUpdated = false;
  let checkRunData = null;
  let prCommentPosted = false;

  githubClient.getCommit = async () => ({
    commit: { author: { email: 'test-author@example.com' } }
  });

  githubClient.createCheckRun = async (owner, repo, data) => {
    checkRunCreated = true;
    checkRunData = data;
    return { id: 888 };
  };

  githubClient.updateCheckRun = async (owner, repo, checkRunId, data) => {
    checkRunUpdated = true;
    checkRunData = { ...checkRunData, ...data };
    return {};
  };

  githubClient.getPRDiff = async () => `
diff --git a/src/index.js b/src/index.js
+++ b/src/index.js
+const token = "ghp_mYqP4w7Z1nK2L9x8J7h6g5f4e3d2c1b0a9z8";
`;

  githubClient.getPRFiles = async () => [
    { filename: 'src/index.js' }
  ];

  githubClient.createPRComment = async () => {
    prCommentPosted = true;
    return {};
  };

  githubClient.getPRDetails = async () => ({
    labels: [{ name: 'bug' }]
  });
  githubClient.getPRReviews = async () => [];

  await webhook.runGateEvaluation('test-owner', 'test-repo', 123, 'abcdef123456', 'test-author@example.com');

  assert.strictEqual(checkRunCreated, true);
  assert.strictEqual(checkRunUpdated, true);
  assert.strictEqual(checkRunData.status, 'completed');
  assert.strictEqual(checkRunData.conclusion, 'failure');
  assert.match(checkRunData.output.title, /Gate Decision: BLOCK/);
  assert.strictEqual(prCommentPosted, true);

  // Restore mocks
  githubClient.getCommit = originalGetCommit;
  githubClient.createCheckRun = originalCreateCheckRun;
  githubClient.updateCheckRun = originalUpdateCheckRun;
  githubClient.getPRDiff = originalGetPRDiff;
  githubClient.getPRFiles = originalGetPRFiles;
  githubClient.createPRComment = originalCreatePRComment;
  githubClient.getPRDetails = originalGetPRDetails;
  githubClient.getPRReviews = originalGetPRReviews;
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
