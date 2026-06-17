const { calculateRiskScore } = require('./risk-scorer');
const { detectBreakingChanges } = require('./breaking-change-detector');
const { scanDependencies } = require('./dependency-scanner');
const { scanSecrets } = require('./secret-detector');

/**
 * Evaluates the PR gate decision based on risk, breaking changes, vulnerabilities, and secrets.
 */
async function evaluateGate({ rawDiff, files = [], authorEmail = '' }) {
  // 1. Run scanners
  const risk = await calculateRiskScore({ files, authorEmail });
  const breaking = detectBreakingChanges(rawDiff);
  const depScan = await scanDependencies(rawDiff);
  const secrets = scanSecrets(rawDiff);

  // 2. Decision Logic
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

  return {
    decision,
    reason: reasonSummary,
    risk_score: risk.score,
    details: {
      risk,
      breaking,
      dependencies: depScan,
      secrets
    }
  };
}

module.exports = {
  evaluateGate
};
