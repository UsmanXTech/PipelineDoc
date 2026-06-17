const test = require('node:test');
const assert = require('node:assert');

// Mock dependecies
const githubClient = require('../../integrations/github/client');
const rcaEngine = require('../../agents/analysis/rca-engine');
const blameAttribution = require('../../agents/analysis/blame-attribution');
const flakyDetector = require('../../agents/analysis/flaky-detector');
const slackClient = require('../../integrations/slack/client');
const prCommenter = require('../../integrations/github/pr-commenter');

// Store original methods
const originalGetWorkflowLogs = githubClient.getWorkflowLogs;
const originalGetCommitDiff = githubClient.getCommitDiff;
const originalAnalyzeFailure = rcaEngine.analyzeFailure;
const originalAttributeBlame = blameAttribution.attributeBlame;
const originalDetectFlakiness = flakyDetector.detectFlakiness;
const originalSendDiagnosisAlert = slackClient.sendDiagnosisAlert;
const originalPostPRDiagnosisComment = prCommenter.postPRDiagnosisComment;

// Set up mocks
githubClient.getWorkflowLogs = async () => 'mock raw logs';
githubClient.getCommitDiff = async () => 'diff --git a/file.js';
rcaEngine.analyzeFailure = async () => ({
  root_cause: 'Postgres connection error',
  failure_type: 'environment_issue',
  confidence: 90,
  affected_file: 'database.js',
  fixes: ['Check DB'],
  summary: 'DB disconnect.'
});
blameAttribution.attributeBlame = async () => ({
  author_name: 'Jane Smith',
  author_email: 'jane@example.com',
  blame_confidence: 85
});
flakyDetector.detectFlakiness = async () => ({
  is_flaky: false,
  flaky_confidence: 0,
  historical_occurrences: 0
});

let slackCallCount = 0;
slackClient.sendDiagnosisAlert = async () => {
  slackCallCount++;
  return { ok: true };
};

let prCommentCallCount = 0;
prCommenter.postPRDiagnosisComment = async () => {
  prCommentCallCount++;
  return { id: 1122 };
};

const { runFailureFlow } = require('../../agents/orchestrator/failure-flow');

test('Orchestrator - runFailureFlow executes entire failure flow successfully', async () => {
  const result = await runFailureFlow({
    owner: 'test-owner',
    repo: 'test-repo',
    runId: 1002,
    commitSha: 'commit_sha_xyz',
    branch: 'dev',
    commitMessage: 'Fix logic',
    prNumber: 42,
    slackChannel: 'alert-channel'
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.diagnosis.root_cause, 'Postgres connection error');
  assert.strictEqual(result.blame.author_name, 'Jane Smith');
  assert.strictEqual(result.slackPosted, true);
  assert.strictEqual(result.prCommented, true);
  assert.strictEqual(slackCallCount, 1);
  assert.strictEqual(prCommentCallCount, 1);
});

// Cleanup mocks
test.after(() => {
  githubClient.getWorkflowLogs = originalGetWorkflowLogs;
  githubClient.getCommitDiff = originalGetCommitDiff;
  rcaEngine.analyzeFailure = originalAnalyzeFailure;
  blameAttribution.attributeBlame = originalAttributeBlame;
  flakyDetector.detectFlakiness = originalDetectFlakiness;
  slackClient.sendDiagnosisAlert = originalSendDiagnosisAlert;
  prCommenter.postPRDiagnosisComment = originalPostPRDiagnosisComment;

  const { pgPool, redisClient } = require('../../config/database');
  if (pgPool && typeof pgPool.end === 'function') {
    pgPool.end().catch(() => {});
  }
  if (redisClient) {
    redisClient.disconnect();
  }
});
