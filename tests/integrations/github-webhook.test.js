const test = require('node:test');
const assert = require('node:assert');

// Mock components
const webhook = require('../../integrations/github/webhook');

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

test.after(() => {
  const { pgPool, redisClient } = require('../../config/database');
  if (pgPool && typeof pgPool.end === 'function') {
    pgPool.end().catch(() => {});
  }
  if (redisClient) {
    redisClient.disconnect();
  }
});
