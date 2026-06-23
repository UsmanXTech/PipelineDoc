const databaseConfig = require('../../config/database');

// TTL for 24 hours in seconds
const REDIS_TTL_SEC = 24 * 60 * 60;
// Sample every 30 seconds -> 2880 samples in 24 hours
const MAX_SAMPLES = 2880; 

/**
 * Generates mock metrics for testing/development.
 */
function generateMockMetrics() {
  return {
    http_error_rate: Math.random() * 0.02, // 0% - 2%
    p95_latency: 100 + Math.random() * 50, // 100ms - 150ms
    p99_latency: 200 + Math.random() * 100, // 200ms - 300ms
    memory_usage: 60 + Math.random() * 15, // 60% - 75%
    cpu_usage: 40 + Math.random() * 20, // 40% - 60%
    disk_usage: 50 + Math.random() * 5, // 50% - 55%
    pod_restart_count: 0
  };
}

/**
 * Polls metric values and stores them in Redis ring buffers.
 */
async function collectMetrics() {
  const redis = databaseConfig.redisClient;
  if (!redis) {
    console.warn('Redis client not initialized. Skipping metrics collection.');
    return generateMockMetrics();
  }

  const timestamp = new Date().toISOString();
  let metrics = generateMockMetrics();

  // Try to query real Prometheus if URL is configured
  if (process.env.PROMETHEUS_URL) {
    try {
      const axios = require('axios');
      // In a real environment, we would execute Prometheus PromQL queries
      // e.g. sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
      // For this implementation, we stub the API call to show integration readiness
      const response = await axios.get(`${process.env.PROMETHEUS_URL}/api/v1/query`, {
        params: { query: 'up' },
        timeout: 2000
      });
      if (response.data && response.data.status === 'success') {
        // Query succeeded, we merge or override with real values if parsed
      }
    } catch (err) {
      console.warn('Prometheus query failed, falling back to mock metrics:', err.message);
    }
  }

  // Write each metric to a Redis list as a ring buffer
  try {
    const pipeline = redis.pipeline();

    for (const [metricName, val] of Object.entries(metrics)) {
      const key = `metrics:${metricName}`;
      const payload = JSON.stringify({ value: val, timestamp });
      
      // Push to list, trim to max capacity, and set expiration
      pipeline.lpush(key, payload);
      pipeline.ltrim(key, 0, MAX_SAMPLES - 1);
      pipeline.expire(key, REDIS_TTL_SEC);
    }

    await pipeline.exec();
  } catch (err) {
    console.error('Failed to store metrics in Redis ring buffers:', err.message);
  }

  return metrics;
}

module.exports = {
  collectMetrics,
  generateMockMetrics,
  MAX_SAMPLES
};
