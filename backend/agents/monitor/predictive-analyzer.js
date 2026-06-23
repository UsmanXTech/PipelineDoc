const databaseConfig = require('../../config/database');
const slackClient = require('../../integrations/slack/client');

/**
 * Fits a linear regression trend line Y = slope * X + intercept over metric samples.
 * 
 * @param {Array<string>} samples - Array of serialized metric objects {"value", "timestamp"}
 * @returns {Object|null} Regression slope, intercept, R2 fit score, and base timestamp
 */
function performRegression(samples) {
  if (samples.length < 5) {
    return null; // Require at least 5 samples for a meaningful trend line
  }

  const N = samples.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  // Use the earliest sample's time as the origin (X = 0)
  const firstTime = new Date(JSON.parse(samples[N - 1]).timestamp).getTime();

  const points = samples.map(s => {
    const data = JSON.parse(s);
    const x = (new Date(data.timestamp).getTime() - firstTime) / 1000; // time in seconds
    const y = data.value;
    return { x, y };
  });

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }

  const meanX = sumX / N;
  const meanY = sumY / N;

  const numerator = sumXY - N * meanX * meanY;
  const denominator = sumXX - N * meanX * meanX;

  if (denominator === 0) {
    return null;
  }

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;

  // Compute R2 (Coefficient of Determination)
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    ssTot += Math.pow(p.y - meanY, 2);
    const predictedY = slope * p.x + intercept;
    ssRes += Math.pow(p.y - predictedY, 2);
  }

  const r2 = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);
  
  return { slope, intercept, r2, firstTime };
}

/**
 * Checks trend trajectories for resource usage metrics to forecast exhaustion events.
 */
async function checkPredictions() {
  const redis = databaseConfig.redisClient;
  const alerts = [];

  if (!redis) {
    return alerts;
  }

  const metricsToCheck = ['memory_usage', 'disk_usage'];

  for (const metric of metricsToCheck) {
    try {
      const key = `metrics:${metric}`;
      // Fetch past 240 samples (last 2 hours of 30-sec polling)
      const samples = await redis.lrange(key, 0, 239);
      if (samples.length < 5) {
        continue;
      }

      const regression = performRegression(samples);
      if (!regression) {
        continue;
      }

      const { slope, intercept, r2, firstTime } = regression;

      // Positive slope indicates increasing resource usage
      if (slope > 0) {
        const breachXSeconds = (100 - intercept) / slope;
        const breachTimeMs = firstTime + breachXSeconds * 1000;
        const nowMs = Date.now();
        const secondsToBreach = (breachTimeMs - nowMs) / 1000;

        // Trigger alarm if breach is projected within 4 hours (14,400 seconds)
        if (secondsToBreach > 0 && secondsToBreach <= 4 * 60 * 60) {
          const projected_breach_at = new Date(breachTimeMs).toISOString();
          const confidence = Math.round(r2 * 100);
          
          const alertLockKey = `alert_lock:predictive:${metric}`;
          let isDeduplicated = false;

          const lock = await redis.get(alertLockKey);
          if (lock) {
            isDeduplicated = true;
          } else {
            await redis.set(alertLockKey, 'fired', 'EX', 900); // 15-minute alert block
          }

          if (!isDeduplicated) {
            const currentVal = JSON.parse(samples[0]).value;
            const minutesToBreach = Math.round(secondsToBreach / 60);
            
            const alertPayload = {
              type: 'predictive',
              metric,
              current_value: currentVal,
              projected_breach_at,
              confidence
            };
            alerts.push(alertPayload);

            const text = `⚠️ PREDICTIVE ALERT: ${metric} is projected to hit 100% in ${minutesToBreach} minutes (at ${projected_breach_at}) with ${confidence}% confidence.`;
            try {
              await slackClient.sendSlackMessage({
                text,
                blocks: [
                  {
                    type: 'header',
                    text: {
                      type: 'plain_text',
                      text: '🔮 Predictive Alert Fired',
                      emoji: true
                    }
                  },
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `*Metric:* \`${metric}\`\n*Current Value:* \`${currentVal.toFixed(1)}%\`\n*Projected Breach:* \`${projected_breach_at}\` (${minutesToBreach} mins away)\n*Confidence:* \`${confidence}%\` (R²: ${r2.toFixed(3)})`
                    }
                  }
                ]
              });
            } catch (slackErr) {
              console.warn('Failed to send predictive alert to Slack:', slackErr.message);
            }
          }
        }
      }
    } catch (err) {
      console.error(`Predictive trend analysis failed for ${metric}:`, err.message);
    }
  }

  return alerts;
}

module.exports = {
  checkPredictions,
  performRegression
};
