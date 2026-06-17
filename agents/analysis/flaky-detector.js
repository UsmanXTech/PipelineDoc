const { pgPool } = require('../../config/database');

/**
 * Detects if a failure is likely flaky by checking past incident patterns in Postgres.
 */
async function detectFlakiness({ rootCause, failureType }) {
  const result = {
    is_flaky: false,
    flaky_confidence: 0,
    historical_occurrences: 0
  };

  if (!pgPool) {
    return result;
  }

  try {
    // 1. Fetch last 10 incidents of the same failure type
    const query = `
      SELECT root_cause, created_at
      FROM incidents
      WHERE type = $1
      ORDER BY created_at DESC
      LIMIT 10;
    `;
    const dbResult = await pgPool.query(query, [failureType]);
    const incidents = dbResult.rows;

    if (incidents.length === 0) {
      return result;
    }

    // 2. Count occurrences of similar error messages (simple substring / token overlap checks)
    let similarCount = 0;
    const cleanRootCause = (rootCause || '').toLowerCase();

    for (const inc of incidents) {
      const pastRootCause = (inc.root_cause || '').toLowerCase();
      
      // Compute simple word overlap as similarity metric
      const tokens1 = new Set(cleanRootCause.split(/\s+/));
      const tokens2 = new Set(pastRootCause.split(/\s+/));
      
      if (tokens1.size === 0 || tokens2.size === 0) continue;
      
      let intersection = 0;
      tokens1.forEach(token => {
        if (tokens2.has(token)) intersection++;
      });
      
      const similarity = intersection / Math.max(tokens1.size, tokens2.size);

      if (similarity > 0.6 || cleanRootCause.includes(pastRootCause) || pastRootCause.includes(cleanRootCause)) {
        similarCount++;
      }
    }

    result.historical_occurrences = similarCount;

    // 3. Apply flakiness classification rules
    if (failureType === 'flaky_test') {
      result.is_flaky = true;
      result.flaky_confidence = 90;
    } else if (similarCount >= 3) {
      // If the same error appears repeatedly (>3 times in the last 10 runs)
      result.is_flaky = true;
      result.flaky_confidence = 80;
    } else if (similarCount > 0) {
      result.flaky_confidence = Math.min(70, similarCount * 25);
    }

    return result;
  } catch (error) {
    console.error('Error in flaky test detection:', error.message);
    return result;
  }
}

module.exports = {
  detectFlakiness
};
