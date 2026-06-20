const { calculateRiskScore } = require('./risk-scorer');
const { detectBreakingChanges } = require('./breaking-change-detector');
const { scanDependencies } = require('./dependency-scanner');
const { scanSecrets } = require('./secret-detector');
const { triggerTestSuite, pollTestResults } = require('../../integrations/uipath/test-cloud');

/**
 * Evaluates the PR gate decision based on risk, breaking changes, vulnerabilities, and secrets.
 */
async function evaluateGate({ rawDiff, files = [], authorEmail = '', uipathSuiteId = null }) {
  // 1. Run static scanners
  const risk = await calculateRiskScore({ files, authorEmail });
  const breaking = detectBreakingChanges(rawDiff);
  const depScan = await scanDependencies(rawDiff);
  const secrets = scanSecrets(rawDiff);

  // 2. Run UiPath Test Cloud if suite ID is provided
  let uipathReport = null;
  const suiteId = uipathSuiteId || process.env.UIPATH_SUITE_ID;
  if (suiteId) {
    try {
      const triggerResult = await triggerTestSuite(suiteId);
      if (triggerResult && triggerResult.executionId) {
        uipathReport = await pollTestResults(triggerResult.executionId);
        if (uipathReport) {
          if (uipathReport.status === 'Failed') {
            risk.score += 40;
            risk.breakdown.push({ rule: 'UiPath Test Suite failed', points: 40 });
          }
          if (uipathReport.flaky > 0) {
            risk.score += 15;
            risk.breakdown.push({ rule: 'Flaky tests detected by UiPath Test Cloud', points: 15 });
          }
          // Clamp score and recalculate risk level
          risk.score = Math.min(100, Math.max(0, risk.score));
          if (risk.score >= 81) {
            risk.level = 'critical';
          } else if (risk.score >= 61) {
            risk.level = 'high';
          } else if (risk.score >= 31) {
            risk.level = 'medium';
          } else {
            risk.level = 'low';
          }
        }
      }
    } catch (err) {
      console.error('Failed to run UiPath Test Cloud during gate evaluation:', err.message);
    }
  }

  // 3. Decision Logic
  let decision = 'PASS';
  const reasons = [];

  // Rules:
  // - secrets_found = true -> BLOCK (critical)
  if (secrets.secrets_found) {
    decision = 'BLOCK';
    const secretTypes = Array.from(new Set(secrets.findings.map(f => f.pattern_type)));
    reasons.push(`Secrets found in codebase: ${secretTypes.join(', ')}`);
  }

  // - risk_score >= 81 -> BLOCK
  if (risk.score >= 81) {
    decision = 'BLOCK';
    reasons.push(`Critical risk score of ${risk.score}/100 exceeds block threshold (81+)`);
  }

  // - vulnerability severity = critical -> BLOCK
  const criticalVulns = depScan.vulnerabilities.filter(v => v.severity.toUpperCase() === 'CRITICAL');
  if (criticalVulns.length > 0) {
    decision = 'BLOCK';
    reasons.push(`Critical vulnerability detected in dependency: ${criticalVulns.map(v => v.package).join(', ')}`);
  }

  // - If not blocked, check warning conditions
  if (decision !== 'BLOCK') {
    // - risk_score 61-80 -> WARN
    if (risk.score >= 61) {
      decision = 'WARN';
      reasons.push(`High risk score of ${risk.score}/100 (threshold 61-80)`);
    }

    // - breaking changes found -> WARN
    if (breaking.has_breaking_changes) {
      decision = 'WARN';
      reasons.push(`${breaking.changes.length} potential breaking change(s) detected`);
    }

    // - high/medium vulnerabilities -> WARN
    const warnVulns = depScan.vulnerabilities.filter(v => v.severity.toUpperCase() === 'HIGH' || v.severity.toUpperCase() === 'MEDIUM');
    if (warnVulns.length > 0) {
      decision = 'WARN';
      reasons.push(`${warnVulns.length} high/medium severity dependency vulnerabilities detected`);
    }
  }

  const reasonSummary = reasons.length > 0 ? reasons.join('; ') : 'All gates passed successfully.';

  try {
    const metricsStore = require('../../api/src/services/metrics-store');
    metricsStore.incrementGate(decision);
  } catch (err) {
    // Ignore metrics failure
  }

  return {
    decision,
    reason: reasonSummary,
    risk_score: risk.score,
    details: {
      risk,
      breaking,
      dependencies: depScan,
      secrets,
      uipath: uipathReport
    }
  };
}

module.exports = {
  evaluateGate
};

