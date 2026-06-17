const githubClient = require('../../integrations/github/client');
const { pgPool } = require('../../config/database');

/**
 * Checks if a PR qualifies for a gate override:
 * 1. Has the label "gate-override"
 * 2. Has at least 2 APPROVED reviews
 */
async function checkGateOverride({ owner, repo, prNumber }) {
  try {
    // 1. Get PR details to inspect labels
    const prDetails = await githubClient.getPRDetails(owner, repo, prNumber);
    const labels = prDetails.labels || [];
    const hasOverrideLabel = labels.some(label => label.name === 'gate-override');

    if (!hasOverrideLabel) {
      return { allowed: false, reason: 'PR does not have the "gate-override" label.' };
    }

    // 2. Fetch PR reviews
    const reviews = await githubClient.getPRReviews(owner, repo, prNumber);
    
    // We want to count distinct authors with APPROVED reviews
    const approvers = new Set();
    for (const r of reviews) {
      if (r.state === 'APPROVED') {
        approvers.add(r.user.login);
      }
    }

    const approvalCount = approvers.size;
    const allowed = approvalCount >= 2;

    if (allowed) {
      // Log the override incident in the DB
      if (pgPool) {
        try {
          const query = `
            INSERT INTO incidents (type, root_cause, raw_logs, resolution)
            VALUES ($1, $2, $3, $4);
          `;
          const values = [
            'gate_override',
            `PR #${prNumber} gate-override applied with ${approvalCount} approval(s).`,
            JSON.stringify({ prNumber, approvers: Array.from(approvers) }),
            'Manual override allowed by team approval'
          ];
          await pgPool.query(query, values);
        } catch (dbErr) {
          console.error('Failed to log gate override incident:', dbErr.message);
        }
      }
      
      return {
        allowed: true,
        reason: `Override approved: PR #${prNumber} has "gate-override" label and ${approvalCount} approved review(s).`
      };
    } else {
      return {
        allowed: false,
        reason: `PR has override label but only has ${approvalCount} approved review(s) (requires at least 2).`
      };
    }
  } catch (error) {
    console.error('Error checking gate override:', error.message);
    return { allowed: false, reason: `Override verification error: ${error.message}` };
  }
}

module.exports = {
  checkGateOverride
};
