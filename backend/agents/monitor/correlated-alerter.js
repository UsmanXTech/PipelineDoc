const databaseConfig = require('../../config/database');
const slackClient = require('../../integrations/slack/client');
const crypto = require('crypto');

/**
 * Resolves the severity level (P1/P2/P3/P4) for a given alert based on system thresholds.
 */
function getAlertSeverity(alert) {
  if (alert.metric === 'http_error_rate') {
    return alert.value > 0.05 ? 'P1' : 'P2'; // >5% error rate is P1, otherwise P2
  }
  if (alert.metric === 'p99_latency' && alert.value > 1000) {
    return 'P1';
  }
  if (alert.metric === 'p99_latency' || alert.metric === 'p95_latency') {
    return 'P2';
  }
  if (alert.type === 'predictive' || alert.metric === 'memory_usage') {
    return 'P3';
  }
  return 'P4'; // Default warning severity
}

/**
 * Groups incoming alerts firing within 2 minutes of each other into one INCIDENT.
 * Updates Postgres incidents table and posts notifications to Slack.
 * 
 * @param {Array<Object>} alerts - List of newly triggered alerts
 * @returns {Object|null} Correlated incident summary
 */
async function correlateAlerts(alerts = []) {
  if (alerts.length === 0) {
    return null;
  }

  const redis = databaseConfig.redisClient;
  const db = databaseConfig.pgPool;
  const activeIncidentKey = 'incident:active:id';
  let incidentId = null;
  let isNewIncident = false;

  // 1. Fetch active incident UUID from Redis if exists
  if (redis) {
    try {
      incidentId = await redis.get(activeIncidentKey);
    } catch (err) {
      console.warn('Failed to read active incident ID from Redis:', err.message);
    }
  }

  // Compile aggregate metrics
  const affectedServices = Array.from(new Set(alerts.map(a => a.service || 'production-app')));
  const worstAlert = alerts.reduce((worst, cur) => {
    const worstSev = getAlertSeverity(worst);
    const curSev = getAlertSeverity(cur);
    // Compare severity levels: e.g. "P1" < "P2" alphabetically
    return curSev < worstSev ? cur : worst;
  }, alerts[0]);

  const severity = getAlertSeverity(worstAlert);
  const timestamp = new Date().toISOString();
  const rawLogs = JSON.stringify({ alerts, generated_at: timestamp });
  const rootCause = `Production anomalies: ${alerts.map(a => a.reason || a.signature || a.message).join('; ')}`;

  if (!incidentId) {
    // 2. Create a new incident bucket
    isNewIncident = true;
    incidentId = crypto.randomUUID();

    if (db) {
      try {
        const query = `
          INSERT INTO incidents (id, type, root_cause, raw_logs, resolution, created_at)
          VALUES ($1, $2, $3, $4, $5, NOW());
        `;
        const values = [
          incidentId,
          'prod_anomaly',
          rootCause,
          rawLogs,
          `Severity: ${severity} | Affected: ${affectedServices.join(', ')}`
        ];
        await db.query(query, values);
      } catch (dbErr) {
        console.error('Failed to create incident record in Postgres:', dbErr.message);
      }
    }

    // Lock incident path in Redis with 120-second (2-minute) window TTL
    if (redis) {
      try {
        await redis.set(activeIncidentKey, incidentId, 'EX', 120);
      } catch (err) {
        console.warn('Failed to lock active incident in Redis:', err.message);
      }
    }
  } else {
    // 3. Append alerts to the active incident in Postgres
    if (db) {
      try {
        const selectQuery = `SELECT raw_logs, root_cause FROM incidents WHERE id = $1;`;
        const selectResult = await db.query(selectQuery, [incidentId]);
        if (selectResult.rows.length > 0) {
          const oldLogs = JSON.parse(selectResult.rows[0].raw_logs || '{}');
          const oldAlerts = oldLogs.alerts || [];
          const updatedAlerts = [...oldAlerts, ...alerts];
          
          const updatedLogs = JSON.stringify({ alerts: updatedAlerts, updated_at: timestamp });
          const updatedRootCause = `${selectResult.rows[0].root_cause} | Addendum: ${alerts.map(a => a.reason || a.signature || a.message).join('; ')}`;
          
          const updateQuery = `
            UPDATE incidents
            SET raw_logs = $1, root_cause = $2
            WHERE id = $3;
          `;
          await db.query(updateQuery, [updatedLogs, updatedRootCause, incidentId]);
        }
      } catch (dbErr) {
        console.error('Failed to update incident in Postgres:', dbErr.message);
      }
    }

    // Refresh 120-second active window expiry
    if (redis) {
      try {
        await redis.expire(activeIncidentKey, 120);
      } catch (err) {
        console.warn('Failed to refresh active incident TTL in Redis:', err.message);
      }
    }
  }

  // 4. Alert Slack on new incident occurrence
  if (isNewIncident) {
    try {
      await slackClient.sendSlackMessage({
        text: `🚨 INCIDENT CREATED [${severity}]: ${rootCause}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🚨 Incident Started [${severity}]`,
              emoji: true
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*ID:* \`${incidentId}\`\n*Severity:* \`${severity}\`\n*Description:* ${rootCause}\n*Affected Services:* \`${affectedServices.join(', ')}\``
            }
          }
        ]
      });
    } catch (slackErr) {
      console.warn('Slack Incident notification failed:', slackErr.message);
    }
  }

  return {
    incidentId,
    isNewIncident,
    severity,
    affectedServices,
    rootCause
  };
}

module.exports = {
  correlateAlerts,
  getAlertSeverity
};
