const express = require('express');
const router = express.Router();

// POST /api/analysis/gate - Evaluate Gatekeeper risk score before deployment
router.post('/gate', async (req, res) => {
  try {
    const { rawDiff, files, authorEmail } = req.body;
    if (!rawDiff) {
      return res.status(400).json({ error: 'Missing required parameters: rawDiff' });
    }

    const { evaluateGate } = require('../../agents/gatekeeper/gate-decision');
    const report = await evaluateGate({
      rawDiff,
      files: files || [],
      authorEmail: authorEmail || 'developer@example.com'
    });

    res.json({
      success: true,
      risk_score: report.risk_score,
      decision: report.decision,
      reason: report.reason,
      details: {
        secretsFound: report.secretsFound || false,
        breakingChanges: report.breakingChanges || false,
        highRiskFiles: report.highRiskFiles || []
      }
    });
  } catch (error) {
    console.error('Error evaluating Gatekeeper:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/analysis/rca - Trigger direct Failure Doctor root cause diagnostics
router.post('/rca', async (req, res) => {
  try {
    const { logs, diff, commitMessage, repo, branch, commitSha } = req.body;
    if (!logs) {
      return res.status(400).json({ error: 'Missing required parameters: logs' });
    }

    const { analyzeFailure } = require('../../agents/analysis/rca-engine');
    const rcaReport = await analyzeFailure({
      logs,
      diff: diff || '',
      commitMessage: commitMessage || 'Unknown commit failure',
      deploymentId: 'manual-rca-' + Date.now()
    });

    // Option to attribute blame
    let blameReport = null;
    if (repo && commitSha) {
      try {
        const { attributeBlame } = require('../../agents/analysis/blame-attribution');
        blameReport = await attributeBlame({
          owner: 'generic',
          repo,
          commitSha,
          affectedFile: rcaReport.affected_file
        });
      } catch (err) {
        console.warn('Blame attribution failed:', err.message);
      }
    }

    res.json({
      success: true,
      incidentId: rcaReport.incidentId,
      failure_type: rcaReport.failure_type,
      confidence: rcaReport.confidence,
      affected_file: rcaReport.affected_file,
      root_cause: rcaReport.root_cause,
      suggested_fix: rcaReport.suggested_fix,
      blame: blameReport
    });
  } catch (error) {
    console.error('Error performing RCA:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
