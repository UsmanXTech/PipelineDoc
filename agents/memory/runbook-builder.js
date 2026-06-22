const aiClient = require('../../config/ai-client');
const databaseConfig = require('../../config/database');

async function checkAndBuildRunbook(rootCause) {
  const pgPool = databaseConfig.pgPool;
  if (!rootCause) {
    return { success: false, reason: 'No root cause provided' };
  }

  if (!pgPool) {
    return { success: false, reason: 'Database pool not initialized' };
  }

  try {
    // 1. Query incidents table for the count of the same root_cause
    const countQuery = 'SELECT COUNT(*) FROM incidents WHERE root_cause = $1';
    const countResult = await pgPool.query(countQuery, [rootCause]);
    const count = parseInt(countResult.rows[0].count, 10);

    // We build a runbook if the count is > 3 (meaning it appeared at least 4 times)
    if (count <= 3) {
      return { success: true, count, built: false, reason: `Occurrence count (${count}) is <= 3` };
    }

    // 2. Check if a runbook already exists that matches this rootCause via trigger_pattern regex
    const runbooksQuery = 'SELECT id, trigger_pattern FROM runbooks';
    const runbooksResult = await pgPool.query(runbooksQuery);
    
    for (const row of runbooksResult.rows) {
      if (row.trigger_pattern) {
        try {
          const regex = new RegExp(row.trigger_pattern, 'i');
          if (regex.test(rootCause)) {
            return {
              success: true,
              built: false,
              runbookId: row.id,
              alreadyExists: true,
              reason: `Runbook already exists with pattern: ${row.trigger_pattern}`
            };
          }
        } catch (regexErr) {
          // Ignore invalid regex patterns in the DB
          // e.g. unclosed brackets or wildcards
        }
      }
    }

    // 3. Generate runbook using LLM API
    const systemPrompt = `You are a runbook automation builder.
Given a recurring root cause, codify a step-by-step troubleshooting and remediation runbook.
Respond with JSON only, matching this structure:
{
  "title": "Descriptive title of the runbook",
  "trigger_pattern": "A simple regex pattern (string) to match similar errors/root causes in logs/root causes",
  "steps": ["Step 1...", "Step 2..."]
}`;

    const userContent = `Root Cause: ${rootCause}
Generate a runbook to remediate this recurring failure.`;

    const result = await aiClient.generateContent({
      system: systemPrompt,
      prompt: userContent,
      maxTokens: 1000
    });

    const responseText = result.text;
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const runbookData = JSON.parse(cleanedText);

    // 4. Save to runbooks table
    const insertQuery = `
      INSERT INTO runbooks (title, trigger_pattern, steps)
      VALUES ($1, $2, $3)
      RETURNING id;
    `;
    const insertResult = await pgPool.query(insertQuery, [
      runbookData.title || 'Auto-generated Runbook',
      runbookData.trigger_pattern || rootCause,
      JSON.stringify(runbookData.steps || [])
    ]);

    const runbookId = insertResult.rows[0].id;
    return {
      success: true,
      built: true,
      runbookId,
      title: runbookData.title,
      trigger_pattern: runbookData.trigger_pattern,
      steps: runbookData.steps
    };

  } catch (err) {
    console.error('Failed checking and building runbook:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  checkAndBuildRunbook
};
