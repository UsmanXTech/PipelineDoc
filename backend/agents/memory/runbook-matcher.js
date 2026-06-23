const databaseConfig = require('../../config/database');

async function matchRunbook(rootCause, rawLogs) {
  const pgPool = databaseConfig.pgPool;
  if (!pgPool) return null;

  try {
    const query = 'SELECT id, title, trigger_pattern, steps FROM runbooks';
    const result = await pgPool.query(query);

    for (const rb of result.rows) {
      if (rb.trigger_pattern) {
        try {
          const regex = new RegExp(rb.trigger_pattern, 'i');
          if ((rootCause && regex.test(rootCause)) || (rawLogs && regex.test(rawLogs))) {
            return rb;
          }
        } catch (regexErr) {
          // Ignore invalid regex patterns
        }
      }
    }
  } catch (err) {
    console.error('Error in matchRunbook:', err.message);
  }

  return null;
}

async function incrementRunbookSuccess(runbookId) {
  const pgPool = databaseConfig.pgPool;
  if (!pgPool) return false;

  try {
    const query = 'UPDATE runbooks SET success_count = success_count + 1 WHERE id = $1 RETURNING success_count';
    const result = await pgPool.query(query, [runbookId]);
    return result.rows.length > 0;
  } catch (err) {
    console.error('Error in incrementRunbookSuccess:', err.message);
    return false;
  }
}

module.exports = {
  matchRunbook,
  incrementRunbookSuccess
};
