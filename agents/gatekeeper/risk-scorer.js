const db = require('../../config/database');

/**
 * Calculates a risk score (0-100) for a set of code changes.
 */
async function calculateRiskScore({ files = [], authorEmail = '' }) {
  let score = 0;
  const breakdown = [];

  // 1. Files changed > 20: +20 points
  if (files.length > 20) {
    score += 20;
    breakdown.push({ rule: 'Large change size (>20 files)', points: 20 });
  }

  let dbMigrationTouched = false;
  let authTouched = false;
  let apiTouched = false;
  let packageManifestTouched = false;
  let configTouched = false;
  let codeFilesTouched = false;
  let testFilesTouched = false;

  for (const file of files) {
    const filePath = file.path.toLowerCase();

    // Check code vs test files
    if (filePath.endsWith('.js') || filePath.endsWith('.ts') || filePath.endsWith('.py') || filePath.endsWith('.go')) {
      if (filePath.includes('test') || filePath.includes('spec')) {
        testFilesTouched = true;
      } else {
        codeFilesTouched = true;
      }
    }

    // DB migration files touched: +30 points
    if (filePath.includes('migration') || filePath.includes('schema') || filePath.endsWith('.sql')) {
      dbMigrationTouched = true;
    }

    // Auth/security files touched (auth/, middleware/, jwt, password): +25 points
    if (
      filePath.includes('auth/') ||
      filePath.includes('middleware/') ||
      filePath.includes('jwt') ||
      filePath.includes('password') ||
      filePath.includes('security')
    ) {
      authTouched = true;
    }

    // API contract files changed (openapi.yml, routes/): +20 points
    if (
      filePath.includes('openapi') ||
      filePath.includes('swagger') ||
      filePath.includes('routes/') ||
      filePath.includes('api/src/routes/')
    ) {
      apiTouched = true;
    }

    // package.json or requirements.txt changed: +15 points
    if (
      filePath.endsWith('package.json') ||
      filePath.endsWith('requirements.txt') ||
      filePath.endsWith('go.mod') ||
      filePath.endsWith('cargo.toml')
    ) {
      packageManifestTouched = true;
    }

    // Config files changed (.env, docker-compose, terraform): +20 points
    if (
      filePath.includes('.env') ||
      filePath.includes('docker-compose') ||
      filePath.includes('terraform') ||
      filePath.endsWith('.tf')
    ) {
      configTouched = true;
    }
  }

  if (dbMigrationTouched) {
    score += 30;
    breakdown.push({ rule: 'Database migration files touched', points: 30 });
  }
  if (authTouched) {
    score += 25;
    breakdown.push({ rule: 'Auth/security modules touched', points: 25 });
  }
  if (apiTouched) {
    score += 20;
    breakdown.push({ rule: 'API routes or contract modified', points: 20 });
  }
  if (packageManifestTouched) {
    score += 15;
    breakdown.push({ rule: 'Dependency manifest modified', points: 15 });
  }
  if (configTouched) {
    score += 20;
    breakdown.push({ rule: 'System config/infrastructure files modified', points: 20 });
  }

  // No test files changed alongside code files: +15 points
  if (codeFilesTouched && !testFilesTouched) {
    score += 15;
    breakdown.push({ rule: 'Code changed without matching test files', points: 15 });
  }

  // 2. Query author incident history from DB
  // Author has >2 incidents in last 30 days: +10 points
  if (db.pgPool && authorEmail) {
    try {
      const query = `
        SELECT COALESCE(SUM(frequency), 0) as total_incidents
        FROM team_patterns
        WHERE author_email = $1 AND last_seen >= NOW() - INTERVAL '30 days';
      `;
      const dbResult = await db.pgPool.query(query, [authorEmail]);
      const totalIncidents = parseInt(dbResult.rows[0].total_incidents, 10);
      
      if (totalIncidents > 2) {
        score += 10;
        breakdown.push({ rule: `Author has high recent failure rate (${totalIncidents} incidents)`, points: 10 });
      }
    } catch (error) {
      console.error('Failed to query author pattern for risk scoring:', error.message);
    }
  }

  // Clamp score between 0 and 100
  score = Math.min(100, Math.max(0, score));

  // Determine Risk Level
  let level = 'low';
  if (score >= 81) {
    level = 'critical';
  } else if (score >= 61) {
    level = 'high';
  } else if (score >= 31) {
    level = 'medium';
  }

  return {
    score,
    level,
    breakdown
  };
}

module.exports = {
  calculateRiskScore
};
