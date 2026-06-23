const test = require('node:test');
const assert = require('node:assert');

// 1. Mock config/anthropic
const anthropic = require('../../backend/config/anthropic');
const originalCreate = anthropic.messages.create;
const mockClaudeResponse = {
  content: [
    {
      text: JSON.stringify({
        root_cause: "Cannot connect to PostgreSQL database because port 5432 is refused",
        failure_type: "environment_issue",
        confidence: 95,
        affected_file: "config/database.js",
        affected_line: 12,
        is_flaky: false,
        fixes: ["Start PostgreSQL docker container", "Verify port 5432 is exposed"],
        summary: "Database connection refused on port 5432."
      })
    }
  ]
};

// Mock Anthropic call
anthropic.messages.create = async () => {
  return mockClaudeResponse;
};

// 2. Mock config/database pgPool
const databaseConfig = require('../../backend/config/database');
const mockIncidents = [];
databaseConfig.pgPool = {
  query: async (sql, params) => {
    if (sql.trim().startsWith('INSERT INTO incidents')) {
      mockIncidents.push({ id: 'mock-incident-uuid', params });
      return { rows: [{ id: 'mock-incident-uuid' }] };
    }
    if (sql.trim().startsWith('SELECT root_cause')) {
      return {
        rows: [
          { root_cause: 'Database connection refused on port 5432.', created_at: new Date() },
          { root_cause: 'Database connection refused on port 5432.', created_at: new Date() }
        ]
      };
    }
    return { rows: [] };
  }
};

// 3. Mock GitHub client methods for blame
const githubClient = require('../../backend/integrations/github/client');
const originalGetCommit = githubClient.getCommit;
const originalGetFileCommits = githubClient.getFileCommits;

githubClient.getCommit = async (owner, repo, sha) => {
  return {
    sha,
    commit: {
      author: {
        name: 'John Doe',
        email: 'john@example.com'
      },
      message: 'Fix api config'
    }
  };
};

githubClient.getFileCommits = async (owner, repo, path, limit) => {
  return [
    {
      sha: 'commit123',
      commit: {
        author: { name: 'John Doe', email: 'john@example.com' },
        message: 'Broken edit'
      }
    },
    {
      sha: 'commit999',
      commit: { author: { name: 'Jane Smith', email: 'jane@example.com' }, message: 'Prior edit' }
    }
  ];
};

const { analyzeFailure } = require('../../backend/agents/analysis/rca-engine');
const { attributeBlame } = require('../../backend/agents/analysis/blame-attribution');
const { detectFlakiness } = require('../../backend/agents/analysis/flaky-detector');

test('RCA Engine - analyzeFailure runs Claude diagnosis and inserts to DB', async () => {
  const result = await analyzeFailure({
    logs: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
    diff: 'diff --git a/config/database.js',
    commitMessage: 'Broken database config',
    deploymentId: 'mock-deploy-uuid'
  });

  assert.strictEqual(result.incidentId, 'mock-uuid-incident' ? 'mock-incident-uuid' : result.incidentId);
  assert.strictEqual(result.failure_type, 'environment_issue');
  assert.strictEqual(result.confidence, 95);
  assert.strictEqual(result.affected_file, 'config/database.js');
  
  // Verify it saved to mock database
  assert.strictEqual(mockIncidents.length, 1);
  assert.strictEqual(mockIncidents[0].params[1], 'environment_issue');
});

test('Blame Attribution - attributeBlame identifies triggering author and confidence', async () => {
  const blame = await attributeBlame({
    owner: 'test-owner',
    repo: 'test-repo',
    commitSha: 'commit123',
    affectedFile: 'config/database.js'
  });

  assert.strictEqual(blame.author_name, 'John Doe');
  assert.strictEqual(blame.author_email, 'john@example.com');
  assert.strictEqual(blame.blame_confidence, 90); // 90 because sha matches last editor in history mock
});

test('Flaky Detector - detectFlakiness counts historical matches', async () => {
  const flakiness = await detectFlakiness({
    rootCause: 'Database connection refused on port 5432.',
    failureType: 'environment_issue'
  });

  assert.strictEqual(flakiness.historical_occurrences, 2);
  assert.ok(flakiness.flaky_confidence > 0);
});

// Cleanup mocks
test.after(() => {
  anthropic.messages.create = originalCreate;
  githubClient.getCommit = originalGetCommit;
  githubClient.getFileCommits = originalGetFileCommits;

  const { pgPool, redisClient } = require('../../backend/config/database');
  if (pgPool && typeof pgPool.end === 'function') {
    pgPool.end().catch(() => {});
  }
  if (redisClient) {
    redisClient.disconnect();
  }
});
