const databaseConfig = require('../../config/database');

/**
 * Parses a single log line to identify ERROR or FATAL strings and extracts context.
 * 
 * @param {string} line - Raw log line
 * @returns {Object|null} File, message, and severity level or null if not an error
 */
function parseErrorLogLine(line) {
  const upperLine = line.toUpperCase();
  const isError = upperLine.includes('ERROR') || upperLine.includes('FATAL');
  
  if (!isError) {
    return null;
  }

  const level = upperLine.includes('FATAL') ? 'FATAL' : 'ERROR';
  
  // Regex to extract file name (e.g. "routes/users.js:25" or "app.js")
  let file = 'unknown-file';
  const fileRegex = /([a-zA-Z0-9_\-\/]+\.(js|ts|py|go|sql|java|cs|yml|json))(:[0-9]+)?/;
  const match = line.match(fileRegex);
  if (match) {
    file = match[1];
  }

  // Extract clean message after severity indicator
  let message = line;
  const levelIndex = upperLine.indexOf(level);
  if (levelIndex !== -1) {
    message = line.substring(levelIndex + level.length).replace(/^[:\s\-]+/, '').trim();
  }

  return { level, file, message };
}

/**
 * Processes log chunks, aggregates ERROR/FATAL counts, and logs to Redis in 5-minute buckets.
 * 
 * @param {string} logData - Raw logs content (possibly multiline)
 * @returns {Object} Statistics of parsed errors
 */
async function processLogs(logData) {
  const redis = databaseConfig.redisClient;
  const lines = logData.split('\n');
  const processed = [];

  const now = new Date();
  const coeff = 1000 * 60 * 5; // 5-minute intervals
  const roundedTime = new Date(Math.floor(now.getTime() / coeff) * coeff);
  const windowKey = roundedTime.toISOString();

  const redisKey = `logs:errors:${windowKey}`;
  const pipeline = redis ? redis.pipeline() : null;

  for (const line of lines) {
    const errorInfo = parseErrorLogLine(line);
    if (errorInfo) {
      processed.push(errorInfo);
      
      if (pipeline) {
        const fieldKey = `${errorInfo.level}:${errorInfo.file}:${errorInfo.message}`;
        pipeline.hincrby(redisKey, fieldKey, 1);
      }
    }
  }

  if (pipeline && processed.length > 0) {
    pipeline.expire(redisKey, 24 * 60 * 60); // 24-hour retention
    await pipeline.exec();
  }

  return {
    window: windowKey,
    processedCount: processed.length,
    errors: processed
  };
}

module.exports = {
  parseErrorLogLine,
  processLogs
};
