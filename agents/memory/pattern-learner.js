const databaseConfig = require('../../config/database');

async function learnPattern(authorEmail, failureType) {
  const pgPool = databaseConfig.pgPool;
  if (!authorEmail || !failureType) {
    return { success: false, reason: 'Invalid parameters: authorEmail and failureType are required' };
  }

  if (!pgPool) {
    return { success: false, reason: 'Database pool not initialized' };
  }

  try {
    const selectQuery = 'SELECT id, frequency FROM team_patterns WHERE author_email = $1 AND failure_type = $2';
    const result = await pgPool.query(selectQuery, [authorEmail, failureType]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const newFrequency = (row.frequency || 0) + 1;
      const updateQuery = 'UPDATE team_patterns SET frequency = $1, last_seen = NOW() WHERE id = $2 RETURNING frequency';
      const updateResult = await pgPool.query(updateQuery, [newFrequency, row.id]);
      
      console.log(`Updated team pattern: ${authorEmail} has caused ${newFrequency} ${failureType} incidents.`);
      return { success: true, action: 'update', frequency: newFrequency };
    } else {
      const insertQuery = 'INSERT INTO team_patterns (author_email, failure_type, frequency, last_seen) VALUES ($1, $2, 1, NOW()) RETURNING frequency';
      const insertResult = await pgPool.query(insertQuery, [authorEmail, failureType]);
      
      console.log(`Created new team pattern: ${authorEmail} has caused 1 ${failureType} incident.`);
      return { success: true, action: 'insert', frequency: 1 };
    }
  } catch (err) {
    console.error('Failed to update team patterns:', err.message);
    return { success: false, error: err.message };
  }
}

async function getTeamInsights(authorEmail) {
  const pgPool = databaseConfig.pgPool;
  if (!pgPool) return [];

  try {
    let query = 'SELECT author_email, failure_type, frequency, last_seen FROM team_patterns';
    let params = [];
    if (authorEmail) {
      query += ' WHERE author_email = $1';
      params.push(authorEmail);
    }
    query += ' ORDER BY frequency DESC';
    const result = await pgPool.query(query, params);
    return result.rows;
  } catch (err) {
    console.error('Failed to fetch team insights:', err.message);
    return [];
  }
}

module.exports = {
  learnPattern,
  getTeamInsights
};
