const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');

// Mock data
const mockJobsResponse = {
  data: {
    jobs: [
      { id: 101, name: 'Build Job', conclusion: 'success' },
      { id: 102, name: 'Test Job', conclusion: 'failure' }
    ]
  }
};

const mockLogText = 'Error: Test failed at line 42\nExpected true but got false';
const mockDiffText = 'diff --git a/index.js b/index.js\n+ const a = 1;';
const mockPRDetails = { number: 12, title: 'Fix bug', user: { login: 'octocat' } };
const mockCommentResponse = { id: 999, body: 'Hello' };

// Store the original axios.create method
const originalCreate = axios.create;

// Mock implementation of axios.create
axios.create = function() {
  return {
    get: async (url, options) => {
      if (url.includes('/actions/runs/') && url.includes('/jobs')) {
        return mockJobsResponse;
      }
      if (url.includes('/actions/jobs/') && url.includes('/logs')) {
        return { data: mockLogText };
      }
      if (url.includes('/commits/')) {
        return { data: mockDiffText };
      }
      if (url.includes('/pulls/')) {
        return { data: mockPRDetails };
      }
      throw new Error(`Unhandled mock GET url: ${url}`);
    },
    post: async (url, body) => {
      if (url.includes('/issues/') && url.includes('/comments')) {
        return { data: mockCommentResponse };
      }
      throw new Error(`Unhandled mock POST url: ${url}`);
    }
  };
};

const client = require('../../integrations/github/client');

test('GitHub Client - getWorkflowLogs fetches and compiles logs for failed jobs', async () => {
  const logs = await client.getWorkflowLogs('owner', 'repo', 123);
  assert.match(logs, /Failed Job: Test Job/);
  assert.match(logs, /Error: Test failed/);
  assert.ok(!logs.includes('Build Job')); // success job log should not be fetched
});

test('GitHub Client - getCommitDiff fetches commit diff text', async () => {
  const diff = await client.getCommitDiff('owner', 'repo', 'sha123');
  assert.strictEqual(diff, mockDiffText);
});

test('GitHub Client - getPRDetails fetches PR metadata', async () => {
  const pr = await client.getPRDetails('owner', 'repo', 12);
  assert.deepStrictEqual(pr, mockPRDetails);
});

test('GitHub Client - createPRComment posts comment body', async () => {
  const comment = await client.createPRComment('owner', 'repo', 12, 'Test Comment');
  assert.strictEqual(comment.id, 999);
});

// Restore axios.create after tests (optional but good practice)
test.after(() => {
  axios.create = originalCreate;
});
