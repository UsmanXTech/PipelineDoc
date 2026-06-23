const crypto = require('crypto');
const config = require('../../config/github');
const { runFailureFlow } = require('../../agents/orchestrator/failure-flow');
const githubClient = require('./client');
const { evaluateGate } = require('../../agents/gatekeeper/gate-decision');
const { checkGateOverride } = require('../../agents/gatekeeper/override-check');

/**
 * Verifies the signature of the incoming GitHub webhook payload.
 */
function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return false;
  }

  const secret = config.webhookSecret || 'dummy-webhook-secret';
  const hmac = crypto.createHmac('sha256', secret);
  
  // Use rawBody buffer captured by express.json middleware
  const bodyBuffer = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const digest = 'sha256=' + hmac.update(bodyBuffer).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (e) {
    return false;
  }
}

/**
 * Main handler for GitHub webhook POST requests.
 */
async function handleWebhook(req, res) {
  // In development/test mode without webhook signature verification enabled, we can optionally bypass verification
  const isTest = process.env.NODE_ENV === 'test' || req.headers['x-bypass-signature'] === 'true';
  
  if (!isTest && !verifySignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`Received GitHub webhook event: ${event} (Action: ${payload.action || 'none'})`);

  try {
    // Basic routing skeleton
    switch (event) {
      case 'workflow_run':
        await module.exports.handleWorkflowRun(payload);
        break;
      case 'check_run':
        await module.exports.handleCheckRun(payload);
        break;
      case 'push':
        await module.exports.handlePush(payload);
        break;
      case 'pull_request':
        await module.exports.handlePullRequest(payload);
        break;
      case 'pull_request_review':
        await module.exports.handlePullRequestReview(payload);
        break;
      default:
        console.log(`Unhandled GitHub event: ${event}`);
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error(`Error handling GitHub event ${event}:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Handler Stubs
async function handleWorkflowRun(payload) {
  const run = payload.workflow_run;
  console.log(`Workflow Run #${run.run_number} for ${run.name} updated: Status = ${run.status}, Conclusion = ${run.conclusion}`);
  
  // Trigger failure doctor flow if a workflow run fails
  if (run.status === 'completed' && run.conclusion === 'failure') {
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const runId = run.id;
    const commitSha = run.head_commit.id;
    const branch = run.head_branch;
    const commitMessage = run.head_commit.message;
    const prNumber = run.pull_requests && run.pull_requests[0] ? run.pull_requests[0].number : null;

    // Run Failure Flow asynchronously so we return a response to GitHub immediately
    runFailureFlow({
      owner,
      repo,
      runId,
      commitSha,
      branch,
      commitMessage,
      prNumber
    }).catch(err => {
      console.error(`Error in background runFailureFlow for run ${runId}:`, err);
    });
  }
}

async function handleCheckRun(payload) {
  console.log(`Check Run updated: ${payload.check_run.name}`);
}

async function handlePush(payload) {
  console.log(`Push to branch ${payload.ref} by ${payload.pusher.name}`);
}

async function handlePullRequest(payload) {
  const action = payload.action;
  const prNumber = payload.pull_request ? payload.pull_request.number : payload.number;
  console.log(`Pull Request #${prNumber} event action: ${action}`);

  const activeActions = ['opened', 'synchronize', 'reopened', 'labeled', 'unlabeled'];
  if (activeActions.includes(action)) {
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const headSha = payload.pull_request.head.sha;
    
    let authorEmail = '';
    try {
      const commitDetails = await githubClient.getCommit(owner, repo, headSha);
      if (commitDetails && commitDetails.commit && commitDetails.commit.author) {
        authorEmail = commitDetails.commit.author.email || '';
      }
    } catch (e) {
      console.warn(`Could not fetch commit details to resolve author email: ${e.message}`);
    }

    // Run async in background
    runGateEvaluation(owner, repo, prNumber, headSha, authorEmail).catch(err => {
      console.error(`Error in runGateEvaluation for PR #${prNumber}:`, err);
    });
  }
}

async function handlePullRequestReview(payload) {
  const action = payload.action;
  const prNumber = payload.pull_request.number;
  console.log(`Pull Request Review for #${prNumber} action: ${action}`);

  if (action === 'submitted' || action === 'edited' || action === 'dismissed') {
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const headSha = payload.pull_request.head.sha;
    
    let authorEmail = '';
    try {
      const commitDetails = await githubClient.getCommit(owner, repo, headSha);
      if (commitDetails && commitDetails.commit && commitDetails.commit.author) {
        authorEmail = commitDetails.commit.author.email || '';
      }
    } catch (e) {
      console.warn(`Could not fetch commit details to resolve author email: ${e.message}`);
    }

    runGateEvaluation(owner, repo, prNumber, headSha, authorEmail).catch(err => {
      console.error(`Error in runGateEvaluation from review for PR #${prNumber}:`, err);
    });
  }
}

async function runGateEvaluation(owner, repo, prNumber, headSha, authorEmail) {
  // 1. Create check run with status in_progress
  let checkRun = null;
  try {
    checkRun = await githubClient.createCheckRun(owner, repo, {
      name: 'PipelineDoc / Gate',
      headSha,
      status: 'in_progress',
      output: {
        title: 'Gate Evaluation In Progress',
        summary: 'Evaluating pull request risk scoring, breaking changes, dependency vulnerabilities, secrets, and running UiPath Test Cloud suite.'
      }
    });
  } catch (err) {
    console.error('Failed to create initial check run:', err.message);
  }

  try {
    // 2. Fetch PR details (diff and files)
    const [diff, prFiles] = await Promise.all([
      githubClient.getPRDiff(owner, repo, prNumber),
      githubClient.getPRFiles(owner, repo, prNumber)
    ]);

    const files = prFiles.map(f => ({ path: f.filename }));

    // 3. Evaluate gate
    const evaluation = await evaluateGate({
      rawDiff: diff,
      files,
      authorEmail
    });

    let decision = evaluation.decision;
    let reason = evaluation.reason;
    let overrideUsed = false;

    // 4. Override Check:
    // If the decision is BLOCK, check if override requirements are met
    if (decision === 'BLOCK') {
      const overrideResult = await checkGateOverride({ owner, repo, prNumber });
      if (overrideResult.allowed) {
        decision = 'PASS';
        reason = `${evaluation.reason} (OVERRIDDEN: ${overrideResult.reason})`;
        overrideUsed = true;
      }
    }

    // 5. Determine Check Run Status & Conclusion
    let conclusion = 'success';
    if (decision === 'BLOCK') {
      conclusion = 'failure';
    } else if (decision === 'WARN') {
      conclusion = 'neutral';
    }

    // 6. Build summary output
    const title = `Gate Decision: ${decision}`;
    const summary = `### Summary of Gate Evaluation
* **Final Score**: ${evaluation.risk_score}/100
* **Decision**: **${decision}**
* **Reason**: ${reason}
${overrideUsed ? '\n> [!NOTE]\n> Manual override approved by 2 reviewers with the `gate-override` label.' : ''}

### Gate Verification Details
* **Secrets Scanned**: ${evaluation.details.secrets.secrets_found ? '❌ SECRETS DETECTED' : '✅ Clean'}
* **Breaking Changes**: ${evaluation.details.breaking.has_breaking_changes ? `❌ ${evaluation.details.breaking.changes.length} breaking changes found` : '✅ None'}
* **CVE Vulnerabilities**: ${evaluation.details.dependencies.vulnerabilities.length > 0 ? `❌ ${evaluation.details.dependencies.vulnerabilities.length} vulnerabilities found` : '✅ Clean'}
* **UiPath Test Run**: ${evaluation.details.uipath ? `${evaluation.details.uipath.status} (Total: ${evaluation.details.uipath.totalTests}, Passed: ${evaluation.details.uipath.passed}, Failed: ${evaluation.details.uipath.failed}, Flaky: ${evaluation.details.uipath.flaky})` : 'Skipped or Not Configured'}`;

    // 7. Update Check Run
    if (checkRun) {
      await githubClient.updateCheckRun(owner, repo, checkRun.id, {
        status: 'completed',
        conclusion,
        output: {
          title,
          summary
        }
      });
    } else {
      await githubClient.createCheckRun(owner, repo, {
        name: 'PipelineDoc / Gate',
        headSha,
        status: 'completed',
        conclusion,
        output: {
          title,
          summary
        }
      });
    }

    // Optionally post comment on PR if blocked or warned
    if (decision === 'BLOCK' || decision === 'WARN') {
      try {
        await githubClient.createPRComment(
          owner,
          repo,
          prNumber,
          `### ⚠️ PipelineDoc Gate Alert\n\n**Decision**: \`${decision}\`\n**Reason**: ${reason}\n\n*Please fix the flagged items above or request a reviewer to add the \`gate-override\` label and approve.*`
        );
      } catch (commentErr) {
        console.warn('Failed to post comment on PR:', commentErr.message);
      }
    }

  } catch (error) {
    console.error('Error running gate evaluation flow:', error);
    if (checkRun) {
      await githubClient.updateCheckRun(owner, repo, checkRun.id, {
        status: 'completed',
        conclusion: 'failure',
        output: {
          title: 'Gate Evaluation Error',
          summary: `An internal error occurred during risk gate evaluation: ${error.message}`
        }
      }).catch(err => console.error('Failed to mark check run as error:', err.message));
    }
  }
}

module.exports = {
  verifySignature,
  handleWebhook,
  handleWorkflowRun,
  handleCheckRun,
  handlePush,
  handlePullRequest,
  handlePullRequestReview,
  runGateEvaluation
};
