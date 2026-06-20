const databaseConfig = require('../../config/database');
const slackClient = require('../../integrations/slack/client');
const crypto = require('crypto');

// Default metric baselines if DB is empty
const DEFAULT_BASELINES = {
  http_error_rate: 0.005, // 0.5%
  p99_latency: 200,       // 200ms
  p95_latency: 120,       // 120ms
  memory_usage: 70,       // 70%
  cpu_usage: 50           // 50%
};

/**
 * Calculates rolling average baseline for a given metric.
 */
async function getMetricBaseline(metricName) {
  const redis = databaseConfig.redisClient;
  if (redis) {
    try {
      // Read past metrics to compute a rolling baseline average
      const key = `metrics:${metricName}`;
      const samples = await redis.lrange(key, 0, -1);
      if (samples && samples.length > 0) {
        const sum = samples.reduce((acc, s) => acc + JSON.parse(s).value, 0);
        return sum / samples.length;
      }
    } catch (err) {
      console.warn(`Failed to calculate baseline for ${metricName}:`, err.message);
    }
  }
  return DEFAULT_BASELINES[metricName] || 50;
}

/**
 * Evaluates current metrics against baseline thresholds for anomaly alerts.
 */
async function checkAnomalies(currentMetrics) {
  const redis = databaseConfig.redisClient;
  const alerts = [];

  for (const [metricName, currentVal] of Object.entries(currentMetrics)) {
    const baseline = await getMetricBaseline(metricName);
    let alertFired = false;
    let reason = '';

    // Rule 1: HTTP Error Rate > Baseline x 3
    if (metricName === 'http_error_rate' && currentVal > baseline * 3) {
      alertFired = true;
      reason = `HTTP error rate (${(currentVal * 100).toFixed(2)}%) is 3x higher than baseline (${(baseline * 100).toFixed(2)}%)`;
    }

    // Rule 2: P99 Latency > Baseline x 2
    if (metricName === 'p99_latency' && currentVal > baseline * 2) {
      alertFired = true;
      reason = `P99 Latency (${currentVal.toFixed(0)}ms) is 2x higher than baseline (${baseline.toFixed(0)}ms)`;
    }

    // Rule 3: Memory > 90%
    if (metricName === 'memory_usage' && currentVal > 90) {
      alertFired = true;
      reason = `Memory usage (${currentVal.toFixed(1)}%) exceeds critical threshold of 90%`;
    }

    // Rule 4: CPU > 95% for > 5 minutes
    if (metricName === 'cpu_usage' && currentVal > 95) {
      let isCPUAnomaly = true;
      if (redis) {
        try {
          // Fetch past 10 samples (representing last 5 minutes of 30-sec polling)
          const pastSamples = await redis.lrange('metrics:cpu_usage', 0, 9);
          if (pastSamples.length >= 10) {
            for (const sample of pastSamples) {
              const data = JSON.parse(sample);
              if (data.value <= 95) {
                isCPUAnomaly = false;
                break;
              }
            }
          } else {
            isCPUAnomaly = false; // Insufficient history
          }
        } catch (err) {
          isCPUAnomaly = false;
        }
      }
      if (isCPUAnomaly) {
        alertFired = true;
        reason = `CPU usage is consistently above 95% for > 5 minutes (current: ${currentVal.toFixed(1)}%)`;
      }
    }

    if (alertFired) {
      // Deduplicate: same alert not re-fired within 15 minutes
      const alertLockKey = `alert_lock:anomaly:${metricName}`;
      let isDeduplicated = false;

      if (redis) {
        try {
          const lock = await redis.get(alertLockKey);
          if (lock) {
            isDeduplicated = true;
          } else {
            await redis.set(alertLockKey, 'fired', 'EX', 900); // 15-minute lock
          }
        } catch (err) {
          console.warn('Deduplication check failed:', err.message);
        }
      }

      if (!isDeduplicated) {
        alerts.push({
          type: 'anomaly',
          metric: metricName,
          value: currentVal,
          baseline,
          reason
        });

        // Slack alert
        try {
          await slackClient.sendSlackMessage({
            text: `⚠️ ANOMALY ALERT: ${reason}`,
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '🚨 Production Anomaly Detected',
                  emoji: true
                }
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Metric:* \`${metricName}\`\n*Current Value:* \`${currentVal.toFixed(2)}\`\n*Reason:* ${reason}`
                }
              }
            ]
          });
        } catch (slackErr) {
          console.warn('Failed to send anomaly alert to Slack:', slackErr.message);
        }
      }
    }
  }

  return alerts;
}

/**
 * Checks if processed logs contain errors not seen before, and alerts.
 */
async function checkNewErrors(processedErrors = []) {
  const redis = databaseConfig.redisClient;
  const newErrorsAlerts = [];

  for (const err of processedErrors) {
    const errorSignature = `${err.level}:${err.file}:${err.message}`;
    const seenSetKey = 'logs:seen_errors';
    let isNew = false;

    if (redis) {
      try {
        const member = await redis.sismember(seenSetKey, errorSignature);
        if (member === 0) {
          isNew = true;
          await redis.sadd(seenSetKey, errorSignature);
        }
      } catch (redisErr) {
        console.warn('Seen errors Set query failed:', redisErr.message);
      }
    } else {
      isNew = true;
    }

    if (isNew) {
      const reason = `New error signature in logs: "${err.message}" inside ${err.file}`;
      const errorHash = crypto.createHash('sha256').update(errorSignature).digest('hex');
      const alertLockKey = `alert_lock:new_error:${errorHash}`;
      let isDeduplicated = false;

      if (redis) {
        try {
          const lock = await redis.get(alertLockKey);
          if (lock) {
            isDeduplicated = true;
          } else {
            await redis.set(alertLockKey, 'fired', 'EX', 900);
          }
        } catch (e) {}
      }

      if (!isDeduplicated) {
        newErrorsAlerts.push({
          type: 'new_error',
          signature: errorSignature,
          reason
        });

        try {
          await slackClient.sendSlackMessage({
            text: `⚠️ NEW ERROR ALERT: ${reason}`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*🚨 New Production Error Detected*\n*File:* \`${err.file}\`\n*Severity:* \`${err.level}\`\n*Message:* \`${err.message}\``
                }
              }
            ]
          });
        } catch (slackErr) {
          console.warn('Slack error notification failed:', slackErr.message);
        }
      }
    }
  }

  return newErrorsAlerts;
}

module.exports = {
  checkAnomalies,
  checkNewErrors,
  getMetricBaseline,
  DEFAULT_BASELINES
};
