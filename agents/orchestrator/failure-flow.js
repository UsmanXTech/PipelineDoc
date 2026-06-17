const githubClient = require('../../integrations/github/client');
const rcaEngine = require('../analysis/rca-engine');
const blameAttribution = require('../analysis/blame-attribution');
const flakyDetector = require('../analysis/flaky-detector');
const slackClient = require('../../integrations/slack/client');
const prCommenter = require('../../integrations/github/pr-commenter');

/**
 * Runs the end-to-end failure diagnosis flow when a workflow run fails.
 */
async function runFailureFlow({ owner, repo, runId, commitSha, branch, commitMessage, prNumber, slackChannel, deploymentId = null }) {
  console.log(`Starting Failure Doctor Orchestration Flow for run ${runId}...`);
  
  try {
    // 1. Fetch failure logs from GitHub Actions
    console.log('Fetching failed workflow logs...');
    const logs = await githubClient.getWorkflowLogs(owner, repo, runId);
    
    // 2. Fetch git diff associated with the triggering commit
    console.log('Fetching commit diff...');
    let diff = '';
    try {
      diff = await githubClient.getCommitDiff(owner, repo, commitSha);
    } catch (diffErr) {
      console.warn(`Could not fetch diff for commit ${commitSha}:`, diffErr.message);
    }

    // 3. Perform Root Cause Analysis via Claude Sonnet
    console.log('Running Root Cause Analysis Engine...');
    const diagnosis = await rcaEngine.analyzeFailure({
      logs,
      diff,
      commitMessage,
      deploymentId
    });

    // 4. Attribute blame using commit history
    console.log('Attributing blame for the failure...');
    const blame = await blameAttribution.attributeBlame({
      owner,
      repo,
      commitSha,
      affectedFile: diagnosis.affected_file
    });

    // 5. Detect if failure is flaky by cross-referencing DB
    console.log('Running flaky test detector...');
    const flakiness = await flakyDetector.detectFlakiness({
      rootCause: diagnosis.root_cause,
      failureType: diagnosis.failure_type
    });

    // 6. Post diagnosis alert to Slack
    console.log('Posting alert to Slack...');
    let slackResult = null;
    try {
      slackResult = await slackClient.sendDiagnosisAlert({
        channel: slackChannel,
        repo: `${owner}/${repo}`,
        branch,
        commitSha,
        diagnosis,
        blame,
        flakiness,
        runId
      });
    } catch (slackErr) {
      console.error('Slack alert skipped or failed:', slackErr.message);
    }

    // 7. Post PR Comment if PR number is provided
    let prCommentResult = null;
    if (prNumber) {
      console.log(`Posting diagnosis to Pull Request #${prNumber}...`);
      try {
        prCommentResult = await prCommenter.postPRDiagnosisComment({
          owner,
          repo,
          prNumber,
          diagnosis,
          blame,
          flakiness
        });
      } catch (prErr) {
        console.error(`PR comment skipped or failed for PR #${prNumber}:`, prErr.message);
      }
    }

    console.log('Failure Doctor Flow completed successfully.');
    
    return {
      success: true,
      diagnosis,
      blame,
      flakiness,
      slackPosted: !!slackResult,
      prCommented: !!prCommentResult
    };

  } catch (flowError) {
    console.error('Failure Doctor flow aborted due to error:', flowError);
    return {
      success: false,
      error: flowError.message
    };
  }
}

module.exports = {
  runFailureFlow
};
