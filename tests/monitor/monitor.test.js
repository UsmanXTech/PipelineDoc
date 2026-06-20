const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');

const databaseConfig = require('../../config/database');
const slackClient = require('../../integrations/slack/client');

// Save original configurations
const originalPgPool = databaseConfig.pgPool;
const originalRedisClient = databaseConfig.redisClient;
const originalSendSlackMessage = slackClient.sendSlackMessage;

// In-memory Redis Mock
class RedisMock {
  constructor() {
    this.data = {};
    this.lists = {};
    this.hashes = {};
    this.sets = {};
  }

  async get(key) {
    return this.data[key] || null;
  }

  async set(key, val, exOpt, exVal) {
    this.data[key] = val;
    return 'OK';
  }

  async lrange(key, start, stop) {
    const list = this.lists[key] || [];
    if (stop === -1) {
      return list.slice(start);
    }
    return list.slice(start, stop + 1);
  }

  async sismember(key, member) {
    const set = this.sets[key];
    return set && set.has(member) ? 1 : 0;
  }

  async sadd(key, member) {
    if (!this.sets[key]) {
      this.sets[key] = new Set();
    }
    this.sets[key].add(member);
    return 1;
  }

  async expire(key, seconds) {
    return 1;
  }

  pipeline() {
    const self = this;
    const chain = {
      lpush: (key, val) => {
        if (!self.lists[key]) {
          self.lists[key] = [];
        }
        self.lists[key].unshift(val);
        return chain;
      },
      ltrim: (key, start, stop) => {
        if (self.lists[key]) {
          self.lists[key] = self.lists[key].slice(start, stop + 1);
        }
        return chain;
      },
      expire: (key, seconds) => {
        return chain;
      },
      hincrby: (key, field, inc) => {
        if (!self.hashes[key]) {
          self.hashes[key] = {};
        }
        const current = self.hashes[key][field] || 0;
        self.hashes[key][field] = current + inc;
        return chain;
      },
      exec: async () => {
        return [];
      }
    };
    return chain;
  }
}

// In-memory Postgres Mock
const incidentsDb = {};
const mockPgPool = {
  query: async (sql, params) => {
    if (sql.includes('INSERT INTO incidents')) {
      const [id, type, root_cause, raw_logs, resolution] = params;
      incidentsDb[id] = { id, type, root_cause, raw_logs, resolution };
      return { rowCount: 1 };
    }
    if (sql.includes('SELECT raw_logs, root_cause FROM incidents')) {
      const [id] = params;
      const row = incidentsDb[id];
      return { rows: row ? [row] : [] };
    }
    if (sql.includes('UPDATE incidents')) {
      const [raw_logs, root_cause, id] = params;
      if (incidentsDb[id]) {
        incidentsDb[id].raw_logs = raw_logs;
        incidentsDb[id].root_cause = root_cause;
      }
      return { rowCount: 1 };
    }
    return { rows: [] };
  }
};

// Setup Mocks
const redisMockInstance = new RedisMock();
databaseConfig.redisClient = redisMockInstance;
databaseConfig.pgPool = mockPgPool;

let slackMessagesSent = [];
slackClient.sendSlackMessage = async (msg) => {
  slackMessagesSent.push(msg);
  return { ok: true };
};

// Require modules to test
const { collectMetrics, generateMockMetrics } = require('../../agents/monitor/metrics-collector');
const { parseErrorLogLine, processLogs } = require('../../agents/monitor/log-streamer');
const { checkAnomalies, checkNewErrors } = require('../../agents/monitor/anomaly-detector');
const { performRegression, checkPredictions } = require('../../agents/monitor/predictive-analyzer');
const { correlateAlerts, getAlertSeverity } = require('../../agents/monitor/correlated-alerter');
const { checkSLOs } = require('../../agents/monitor/slo-tracker');

// Clean up mocks after all tests are done
test.after(() => {
  databaseConfig.pgPool = originalPgPool;
  databaseConfig.redisClient = originalRedisClient;
  slackClient.sendSlackMessage = originalSendSlackMessage;

  if (originalPgPool && typeof originalPgPool.end === 'function') {
    originalPgPool.end().catch(() => {});
  }
  if (originalRedisClient) {
    originalRedisClient.disconnect();
  }
});

test.beforeEach(() => {
  // Reset mocks state before each test
  redisMockInstance.data = {};
  redisMockInstance.lists = {};
  redisMockInstance.hashes = {};
  redisMockInstance.sets = {};
  slackMessagesSent = [];
  for (const k of Object.keys(incidentsDb)) {
    delete incidentsDb[k];
  }
});

// --- Metrics Collector Tests ---
test('Metrics Collector - collectMetrics writes to Redis lists', async () => {
  const metrics = await collectMetrics();
  assert.ok(metrics.http_error_rate !== undefined);
  assert.ok(metrics.cpu_usage !== undefined);

  // Check that metrics list entries are added to Redis
  const cpuSamples = redisMockInstance.lists['metrics:cpu_usage'];
  assert.ok(cpuSamples && cpuSamples.length > 0);
  const latestSample = JSON.parse(cpuSamples[0]);
  assert.ok(latestSample.value !== undefined);
  assert.ok(latestSample.timestamp !== undefined);
});

// --- Log Streamer Tests ---
test('Log Streamer - parseErrorLogLine detects errors and contexts', () => {
  const normalLine = '2026-06-18 10:00:00 INFO application started successfully';
  const errorLine = '2026-06-18 10:01:00 ERROR in routes/users.js: connection pool exhausted';
  const fatalLine = '2026-06-18 10:02:00 FATAL in server.js: out of memory exception';

  assert.strictEqual(parseErrorLogLine(normalLine), null);

  const errorResult = parseErrorLogLine(errorLine);
  assert.ok(errorResult);
  assert.strictEqual(errorResult.level, 'ERROR');
  assert.strictEqual(errorResult.file, 'routes/users.js');
  assert.strictEqual(errorResult.message, 'in routes/users.js: connection pool exhausted');

  const fatalResult = parseErrorLogLine(fatalLine);
  assert.ok(fatalResult);
  assert.strictEqual(fatalResult.level, 'FATAL');
  assert.strictEqual(fatalResult.file, 'server.js');
});

test('Log Streamer - processLogs counts error aggregates in Redis', async () => {
  const logData = [
    '2026-06-18 10:00:00 routes/users.js ERROR failed to query',
    '2026-06-18 10:00:05 INFO standard logging message',
    '2026-06-18 10:00:10 routes/users.js ERROR failed to query'
  ].join('\n');

  const stats = await processLogs(logData);
  assert.strictEqual(stats.processedCount, 2);
  assert.strictEqual(stats.errors.length, 2);

  const key = `logs:errors:${stats.window}`;
  const field = 'ERROR:routes/users.js:failed to query';
  assert.strictEqual(redisMockInstance.hashes[key][field], 2);
});

// --- Anomaly Detector Tests ---
test('Anomaly Detector - checkAnomalies fires when metric exceeds baseline', async () => {
  // Seed baseline
  const baselineKey = 'metrics:p99_latency';
  const samples = Array.from({ length: 10 }, (_, i) => 
    JSON.stringify({ value: 100, timestamp: new Date(Date.now() - i * 30000).toISOString() })
  );
  redisMockInstance.lists[baselineKey] = samples;

  // Run anomaly check on high latency (250ms is > 2x baseline of 100ms)
  const alerts = await checkAnomalies({ p99_latency: 250 });
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].type, 'anomaly');
  assert.strictEqual(alerts[0].metric, 'p99_latency');
  assert.ok(alerts[0].reason.includes('higher than baseline'));

  // Slack notification was sent
  assert.strictEqual(slackMessagesSent.length, 1);
  assert.ok(slackMessagesSent[0].text.includes('P99 Latency'));

  // Ensure deduplication lock is set in Redis
  const lock = await redisMockInstance.get('alert_lock:anomaly:p99_latency');
  assert.strictEqual(lock, 'fired');
});

test('Anomaly Detector - checkNewErrors registers first-seen signatures', async () => {
  const processedErrors = [
    { level: 'ERROR', file: 'auth.js', message: 'JWT verification failed' }
  ];

  // First time seen, alerts
  const alerts1 = await checkNewErrors(processedErrors);
  assert.strictEqual(alerts1.length, 1);
  assert.strictEqual(alerts1[0].type, 'new_error');
  assert.ok(slackMessagesSent.length > 0);

  // Second time seen, is not new, shouldn't alert
  const alerts2 = await checkNewErrors(processedErrors);
  assert.strictEqual(alerts2.length, 0);
});

// --- Predictive Analyzer Tests ---
test('Predictive Analyzer - performs linear regression and detects memory exhaustion', async () => {
  const metricKey = 'metrics:memory_usage';
  // Linear trend: starts at 70% and increases by 1% every 30 seconds
  const now = Date.now();
  const samples = Array.from({ length: 10 }, (_, i) => {
    const index = 9 - i; // earliest sample is firstTime (index 9)
    const val = 70 + index;
    const timestamp = new Date(now - (9 - index) * 30000).toISOString();
    return JSON.stringify({ value: val, timestamp });
  });

  redisMockInstance.lists[metricKey] = samples;

  const regressionResult = performRegression(samples);
  assert.ok(regressionResult);
  assert.ok(regressionResult.slope > 0);

  const alerts = await checkPredictions();
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].type, 'predictive');
  assert.strictEqual(alerts[0].metric, 'memory_usage');
  assert.ok(slackMessagesSent.length > 0);
});

// --- Correlated Alerter Tests ---
test('Correlated Alerter - groups concurrent alerts into incident', async () => {
  const alert1 = { type: 'anomaly', metric: 'http_error_rate', value: 0.04, reason: 'High error rate' };
  const alert2 = { type: 'anomaly', metric: 'p99_latency', value: 300, reason: 'High latency' };

  // 1. Initial alert creates incident
  const res1 = await correlateAlerts([alert1]);
  assert.ok(res1);
  assert.strictEqual(res1.isNewIncident, true);
  assert.strictEqual(res1.severity, 'P2');
  const initialId = res1.incidentId;
  assert.ok(incidentsDb[initialId]);

  // 2. Secondary alert within 2 minutes correlates to the same incident ID
  const res2 = await correlateAlerts([alert2]);
  assert.ok(res2);
  assert.strictEqual(res2.isNewIncident, false);
  assert.strictEqual(res2.incidentId, initialId);

  // 3. Verify logs in DB got appended
  const dbIncident = incidentsDb[initialId];
  const logs = JSON.parse(dbIncident.raw_logs);
  assert.strictEqual(logs.alerts.length, 2);
});

// --- SLO Tracker Tests ---
test('SLO Tracker - calculates compliance and burn rate, alerts when breached', async () => {
  // Let's seed Redis with a high HTTP error rate to trigger Uptime breach
  // Config has API Uptime with 99.9% target. We put 10 samples of error rate = 0.05 (5%), which means compliance is 0%
  const now = Date.now();
  const uptimeKey = 'metrics:http_error_rate';
  const badSamples = Array.from({ length: 10 }, (_, i) => 
    JSON.stringify({ value: 0.05, timestamp: new Date(now - i * 30000).toISOString() })
  );
  redisMockInstance.lists[uptimeKey] = badSamples;

  // And seed normal latency
  const latencyKey = 'metrics:p99_latency';
  const goodSamples = Array.from({ length: 10 }, (_, i) => 
    JSON.stringify({ value: 150, timestamp: new Date(now - i * 30000).toISOString() })
  );
  redisMockInstance.lists[latencyKey] = goodSamples;

  const result = await checkSLOs();
  assert.strictEqual(result.results.length, 2);

  const uptimeSLO = result.results.find(r => r.name === 'API Uptime');
  assert.ok(uptimeSLO);
  assert.strictEqual(uptimeSLO.compliance_percent, 0);
  assert.strictEqual(uptimeSLO.error_budget_remaining_percent, 0);
  assert.ok(uptimeSLO.burn_rate > 14.4);

  // Verify that an alert was fired
  assert.ok(result.alerts.length > 0);
  assert.strictEqual(result.alerts[0].slo, 'API Uptime');
  assert.ok(slackMessagesSent.length > 0);
});
