const fs = require('fs').promises;
const path = require('path');
const databaseConfig = require('../../config/database');
const slackClient = require('../../integrations/slack/client');

/**
 * Checks all defined SLOs against collected metrics in Redis.
 * Computes compliance rate, error budget exhaustion trend, and burn rate.
 * Alerts Slack when threshold parameters are violated.
 * 
 * @returns {Object} List of SLO compliance metrics and any fired alerts
 */
async function checkSLOs() {
  const redis = databaseConfig.redisClient;
  const sloFilePath = path.join(__dirname, '../../config/slos.json');
  const rawData = await fs.readFile(sloFilePath, 'utf8');
  const slos = JSON.parse(rawData);

  const results = [];
  const alerts = [];

  for (const slo of slos) {
    const { name, target, window_days } = slo;
    const window_minutes = window_days * 24 * 60;
    const error_budget_total_mins = (1 - target / 100) * window_minutes;

    let compliance_percent = 100;
    let error_budget_remaining_percent = 100;
    let error_budget_remaining_mins = error_budget_total_mins;
    let burn_rate = 0;
    let hours_to_exhaust = Infinity;
    let total_samples = 0;
    let compliant_samples = 0;

    if (redis) {
      try {
        let key = '';
        let complianceThreshold = 0;
        let isUptime = false;

        if (name.toLowerCase().includes('uptime')) {
          key = 'metrics:http_error_rate';
          complianceThreshold = 0.01; // error rate < 1% represents healthy/up uptime state
          isUptime = true;
        } else if (name.toLowerCase().includes('latency')) {
          key = 'metrics:p99_latency';
          complianceThreshold = 500; // p99 latency < 500ms
        }

        const rawSamples = await redis.lrange(key, 0, -1);
        if (rawSamples && rawSamples.length > 0) {
          total_samples = rawSamples.length;
          const parsedSamples = rawSamples.map(s => JSON.parse(s));

          compliant_samples = parsedSamples.filter(s => s.value < complianceThreshold).length;

          const compliance_rate = compliant_samples / total_samples;
          compliance_percent = compliance_rate * 100;

          const downtime_fraction = 1 - compliance_rate;
          const downtime_minutes = downtime_fraction * window_minutes;
          error_budget_remaining_mins = Math.max(0, error_budget_total_mins - downtime_minutes);
          error_budget_remaining_percent = (error_budget_remaining_mins / error_budget_total_mins) * 100;

          // Calculate recent 1 hour burn rate (up to 120 samples of 30s)
          const recentSamples = parsedSamples.slice(0, 120);
          const recent_total = recentSamples.length;
          const recent_compliant = recentSamples.filter(s => s.value < complianceThreshold).length;
          const compliance_rate_recent = recent_total > 0 ? recent_compliant / recent_total : compliance_rate;
          const downtime_fraction_recent = 1 - compliance_rate_recent;

          burn_rate = downtime_fraction_recent / (1 - target / 100);
          if (downtime_fraction_recent > 0) {
            hours_to_exhaust = error_budget_remaining_mins / (downtime_fraction_recent * 60);
          }
        }
      } catch (err) {
        console.warn(`Failed to compute compliance for SLO ${name}:`, err.message);
      }
    }

    const report = {
      name,
      target,
      window_days,
      compliance_percent,
      error_budget_total_mins,
      error_budget_remaining_mins,
      error_budget_remaining_percent,
      burn_rate,
      hours_to_exhaust
    };
    results.push(report);

    // Alert Conditions:
    // 1. remaining error budget < 20%
    // 2. burn rate > 14.4x
    // 3. exhaustion in < 2 hours (hours_to_exhaust < 2)
    const budgetLow = error_budget_remaining_percent < 20;
    const highBurn = burn_rate > 14.4;
    const fastExhaust = hours_to_exhaust < 2;

    if (budgetLow || highBurn || fastExhaust) {
      let reason = '';
      if (budgetLow) {
        reason += `Remaining error budget is low (${error_budget_remaining_percent.toFixed(1)}% < 20%). `;
      }
      if (highBurn) {
        reason += `High burn rate (${burn_rate.toFixed(1)}x > 14.4x). `;
      }
      if (fastExhaust && hours_to_exhaust !== Infinity) {
        reason += `Projected error budget exhaustion in ${hours_to_exhaust.toFixed(1)} hours (< 2 hours).`;
      }

      const alertLockKey = `alert_lock:slo:${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      let isDeduplicated = false;

      if (redis) {
        try {
          const lock = await redis.get(alertLockKey);
          if (lock) {
            isDeduplicated = true;
          } else {
            await redis.set(alertLockKey, 'fired', 'EX', 900); // 15-minute lock
          }
        } catch (e) {}
      }

      if (!isDeduplicated) {
        alerts.push({
          type: 'slo_breach',
          slo: name,
          reason,
          report
        });

        try {
          await slackClient.sendSlackMessage({
            text: `⚠️ SLO ALERT: ${name} is breaching targets.`,
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '🚨 SLO Target Breach Warning',
                  emoji: true
                }
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*SLO:* \`${name}\`\n*Target:* \`${target}%\` | *Window:* \`${window_days} days\`\n*Current Compliance:* \`${compliance_percent.toFixed(2)}%\`\n*Remaining Budget:* \`${error_budget_remaining_percent.toFixed(1)}%\` (${error_budget_remaining_mins.toFixed(0)} mins)\n*Burn Rate:* \`${burn_rate.toFixed(1)}x\`\n*Hours to Exhaust:* \`${hours_to_exhaust === Infinity ? 'N/A' : hours_to_exhaust.toFixed(1)}h\`\n*Reason:* ${reason}`
                }
              }
            ]
          });
        } catch (slackErr) {
          console.warn('Failed to send SLO alert to Slack:', slackErr.message);
        }
      }
    }
  }

  return { results, alerts };
}

module.exports = {
  checkSLOs
};
