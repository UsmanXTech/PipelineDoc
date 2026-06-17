const anthropic = require('../../config/anthropic');
const { pgPool } = require('../../config/database');
const { ingestLogs } = require('./log-ingester');
const { parseDiff } = require('./diff-parser');

/**
 * Retries a promise-returning function with exponential backoff.
 */
async function retryWithBackoff(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    console.warn(`RCA API Call failed. Retrying in ${delay}ms... (Error: ${error.message})`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

/**
 * Analyzes the CI failure logs and code changes using Claude API.
 */
async function analyzeFailure({ logs, diff, commitMessage, previousRuns = [], deploymentId = null }) {
  // 1. Ingest logs and diffs
  const parsedLogs = ingestLogs(logs);
  const parsedDiff = parseDiff(diff);

  const systemPrompt = `You are PipelineDoc Failure Doctor, an expert CI/CD diagnostic agent.
Given CI failure logs and a code diff, you must:
1. Identify the ROOT CAUSE of the failure (be specific — file, line, function if possible).
2. Classify the failure type: build_error | test_failure | dependency_issue | config_error | flaky_test | environment_issue
3. Assign a confidence score 0-100.
4. Suggest 1-3 specific fixes.
5. Check if this error appeared in previous runs (flakiness signal).
Respond in JSON only. No explanation text outside JSON.`;

  const userContent = `
Commit Message: ${commitMessage || 'No commit message provided'}

--- LOGS (EXTRACTED CONTEXT) ---
${parsedLogs.errorContext || 'No error logs captured.'}

--- GIT DIFF ---
${diff || 'No code changes (diff is empty).'}
`;

  // 2. Query Claude API with retry logic
  const responseText = await retryWithBackoff(async () => {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });
    return message.content[0].text;
  });

  // 3. Parse JSON response
  let diagnosis;
  try {
    // Clean response text in case Claude adds markdown code block ticks ```json
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    diagnosis = JSON.parse(cleanedText);
  } catch (parseError) {
    console.error('Error parsing Claude RCA JSON response:', responseText);
    throw new Error('Failed to parse RCA response from AI doctor: ' + parseError.message);
  }

  // 4. Save to incidents table in Postgres (if database is connected)
  let incidentId = null;
  if (pgPool) {
    try {
      const query = `
        INSERT INTO incidents (deployment_id, type, root_cause, raw_logs, resolution)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `;
      const values = [
        deploymentId,
        diagnosis.failure_type || 'unknown_failure',
        diagnosis.root_cause || 'No root cause specified.',
        logs,
        diagnosis.fixes ? diagnosis.fixes.join('\n') : null
      ];
      const dbResult = await pgPool.query(query, values);
      if (dbResult.rows.length > 0) {
        incidentId = dbResult.rows[0].id;
      }
    } catch (dbError) {
      console.error('Failed to log incident to database:', dbError.message);
    }
  }

  return {
    incidentId,
    ...diagnosis
  };
}

module.exports = {
  analyzeFailure
};
