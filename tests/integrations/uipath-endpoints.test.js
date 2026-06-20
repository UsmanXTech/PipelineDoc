const test = require('node:test');
const assert = require('node:assert');

const databaseConfig = require('../../config/database');
const originalPgPool = databaseConfig.pgPool;

// Setup a global mock pool that delegates query calls dynamically
let currentQueryMock = null;
databaseConfig.pgPool = {
  query: async (sql, params) => {
    if (currentQueryMock) {
      return currentQueryMock(sql, params);
    }
    return { rows: [] };
  }
};

// Now import the router after mocking the pool configuration
const router = require('../../api/src/routes/uipath');

test('UiPath Router - GET / returns connection metadata', async () => {
  const route = router.stack.find(s => s.route && s.route.path === '/' && s.route.methods.get);
  assert.ok(route);
  
  let jsonResult = null;
  const mockReq = {};
  const mockRes = {
    json: (data) => {
      jsonResult = data;
      return mockRes;
    }
  };

  await route.route.stack[0].handle(mockReq, mockRes);

  assert.strictEqual(jsonResult.status, 'Connected');
  assert.strictEqual(jsonResult.folderPath, 'Shared/Orchestrator_Unit_1');
  assert.ok(jsonResult.mappedProcesses.length > 0);
});

test('UiPath Router - GET /jobs queries database and returns row list', async () => {
  const mockJobs = [
    { id: 'uuid-1', job_id: 'job-101', process_name: 'UiPath_DeployFlowProcess', state: 'Successful' }
  ];

  currentQueryMock = async (sql) => {
    assert.ok(sql.includes('uipath_jobs'));
    return { rows: mockJobs };
  };

  const route = router.stack.find(s => s.route && s.route.path === '/jobs' && s.route.methods.get);
  assert.ok(route);

  let jsonResult = null;
  const mockReq = {};
  const mockRes = {
    json: (data) => {
      jsonResult = data;
      return mockRes;
    }
  };

  await route.route.stack[0].handle(mockReq, mockRes);
  assert.deepStrictEqual(jsonResult, mockJobs);
});

test('UiPath Router - GET /queues queries database and returns queue list', async () => {
  const mockQueues = [
    { id: 'uuid-q1', queue_name: 'Deployment_Artifact_Verification_Queue', status: 'Successful' }
  ];

  currentQueryMock = async (sql) => {
    assert.ok(sql.includes('uipath_queue_items'));
    return { rows: mockQueues };
  };

  const route = router.stack.find(s => s.route && s.route.path === '/queues' && s.route.methods.get);
  assert.ok(route);

  let jsonResult = null;
  const mockReq = {};
  const mockRes = {
    json: (data) => {
      jsonResult = data;
      return mockRes;
    }
  };

  await route.route.stack[0].handle(mockReq, mockRes);
  assert.deepStrictEqual(jsonResult, mockQueues);
});

test('UiPath Router - GET /summary calculates and aggregates metrics', async () => {
  currentQueryMock = async (sql) => {
    if (sql.includes('uipath_jobs')) {
      return { rows: [{ total: '10', success: '8', faulted: '2' }] };
    }
    if (sql.includes('avg(processing_duration_ms)')) {
      return { rows: [{ avg_duration: '1500.5' }] };
    }
    return { rows: [{ total: '15', success: '13', failed: '2', business_exceptions: '1', app_exceptions: '1' }] };
  };

  const route = router.stack.find(s => s.route && s.route.path === '/summary' && s.route.methods.get);
  assert.ok(route);

  let jsonResult = null;
  const mockReq = {};
  const mockRes = {
    json: (data) => {
      jsonResult = data;
      return mockRes;
    }
  };

  await route.route.stack[0].handle(mockReq, mockRes);
  
  assert.strictEqual(jsonResult.jobs.total, 10);
  assert.strictEqual(jsonResult.jobs.success, 8);
  assert.strictEqual(jsonResult.queues.total, 15);
  assert.strictEqual(jsonResult.queues.avgDurationMs, 1501);
});

test('UiPath Router - POST /jobs/trigger inserts manual run record', async () => {
  let insertQueryTriggered = false;
  currentQueryMock = async (sql, params) => {
    insertQueryTriggered = true;
    assert.ok(sql.includes('INSERT INTO uipath_jobs'));
    assert.strictEqual(params[1], 'UiPath_RestartServiceProcess');
    assert.strictEqual(params[3], 'Successful');
    return { rows: [] };
  };

  const route = router.stack.find(s => s.route && s.route.path === '/jobs/trigger' && s.route.methods.post);
  assert.ok(route);

  let jsonResult = null;
  const mockReq = {
    body: {
      processName: 'UiPath_RestartServiceProcess',
      inputArguments: { serviceName: 'payment-service' }
    }
  };
  const mockRes = {
    json: (data) => {
      jsonResult = data;
      return mockRes;
    }
  };

  await route.route.stack[0].handle(mockReq, mockRes);
  
  assert.strictEqual(jsonResult.success, true);
  assert.strictEqual(jsonResult.state, 'Successful');
  assert.strictEqual(insertQueryTriggered, true);
});

test.after(() => {
  databaseConfig.pgPool = originalPgPool;
  if (originalPgPool && typeof originalPgPool.end === 'function') {
    originalPgPool.end().catch(() => {});
  }
  const originalRedisClient = databaseConfig.redisClient;
  if (originalRedisClient) {
    originalRedisClient.disconnect();
  }
});
