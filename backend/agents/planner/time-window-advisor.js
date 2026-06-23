const db = require('../../config/database');

/**
 * Recommends the lowest-traffic 2-hour windows for deployments in the next 48 hours.
 * Output format: { recommended_windows: [{ start, end, risk_level, reason }] }
 */
async function getRecommendedWindows() {
  const recommended_windows = [];
  
  // Define default hourly traffic profile (0 = lowest, 100 = peak)
  const defaultTrafficProfile = {
    0: 15, 1: 10, 2: 5, 3: 5, 4: 10, 5: 15,
    6: 30, 7: 50, 8: 75, 9: 90, 10: 100, 11: 95,
    12: 80, 13: 85, 14: 90, 15: 95, 16: 90, 17: 80,
    18: 70, 19: 60, 20: 50, 21: 40, 22: 30, 23: 20
  };

  const trafficProfile = { ...defaultTrafficProfile };

  // Query deployments to factor in historical deployment frequency or incidents
  if (db.pgPool) {
    try {
      const query = `
        SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as deploy_count
        FROM deployments
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY hour;
      `;
      const result = await db.pgPool.query(query);
      for (const row of result.rows) {
        const hour = parseInt(row.hour, 10);
        const count = parseInt(row.deploy_count, 10);
        // Factor this into trafficProfile: assume hours with more deployments are active working hours
        if (trafficProfile[hour] !== undefined) {
          trafficProfile[hour] += count * 2; // Increase weight of active deployment hours
        }
      }
    } catch (err) {
      console.warn('Failed to query deployments for traffic analysis:', err.message);
    }
  }

  // Start evaluating windows from the next hour
  const now = new Date();
  const startHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);

  const windowsEvaluated = [];
  // Evaluate 2-hour windows for the next 48 hours (up to offset 46)
  for (let offset = 0; offset < 46; offset++) {
    const windowStart = new Date(startHour.getTime() + offset * 60 * 60 * 1000);
    const windowEnd = new Date(windowStart.getTime() + 2 * 60 * 60 * 1000);
    
    const h1 = windowStart.getHours();
    const h2 = windowEnd.getHours();
    
    const day = windowStart.getDay();
    const isWeekend = (day === 0 || day === 6);
    
    const baseTraffic = (trafficProfile[h1] + trafficProfile[h2]) / 2;
    const trafficScore = isWeekend ? baseTraffic * 0.4 : baseTraffic;

    windowsEvaluated.push({
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      trafficScore,
      hour: h1,
      isWeekend
    });
  }

  // Sort by lowest traffic score
  windowsEvaluated.sort((a, b) => a.trafficScore - b.trafficScore);

  // Take top 3 low-traffic windows
  const topWindows = windowsEvaluated.slice(0, 3);

  for (const win of topWindows) {
    let risk_level = 'low';
    if (win.trafficScore > 75) {
      risk_level = 'high';
    } else if (win.trafficScore > 40) {
      risk_level = 'medium';
    }

    let reason = `Off-peak traffic hour (${win.hour}:00 - ${(win.hour + 2) % 24}:00)`;
    if (win.isWeekend) {
      reason += ' on weekend';
    }

    recommended_windows.push({
      start: win.start,
      end: win.end,
      risk_level,
      reason
    });
  }

  return {
    recommended_windows
  };
}

module.exports = {
  getRecommendedWindows
};
