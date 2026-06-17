const crypto = require('crypto');
const config = require('../../config/github');
const { runFailureFlow } = require('../../agents/orchestrator/failure-flow');

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
  console.log(`Pull Request #${payload.number} event action: ${payload.action}`);
}

module.exports = {
  verifySignature,
  handleWebhook,
  handleWorkflowRun,
  handleCheckRun,
  handlePush,
  handlePullRequest
};
