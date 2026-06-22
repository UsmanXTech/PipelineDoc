const test = require('node:test');
const assert = require('node:assert');
const databaseConfig = require('../../config/database');
const anthropic = require('../../config/anthropic');

// Mock PG Pool queries
let dbQueries = [];
databaseConfig.pgPool = {
  query: async (sql, params) => {
    dbQueries.push({ sql, params });
    const sqlLower = sql.toLowerCase().trim();
    if (sqlLower.includes('insert into deployments')) {
      return { rows: [{ id: 'mock-inserted-deploy-id' }] };
    }
    if (sqlLower.includes('update deployments')) {
      return { rows: [{ id: 'mock-inserted-deploy-id', repo: 'payment-service', branch: 'main', commit_sha: 'sha123' }] };
    }
    if (sqlLower.includes('select deploy_history')) {
      return { rows: [{ deploy_history: [] }] };
    }
    return { rows: [{ total_incidents: '0' }] };
  }
};

// Mock Anthropic / AI client
anthropic.messages.create = async () => {
  return {
    content: [
      {
        text: JSON.stringify({
          risk_score: 15,
          decision: 'approve',
          reason: 'Safe deploy',
          root_cause: 'Database Refused',
          failure_type: 'environment_issue',
          confidence: 90,
          suggested_fix: 'Restart container'
        })
      }
    ]
  };
};

const deploymentsRouter = require('../../api/src/routes/deployments');
const analysisRouter = require('../../api/src/routes/analysis');

test('REST API Endpoints - POST /api/deployments creates deployment session', async () => {
  dbQueries = [];
  const req = {
    body: {
      repo: 'payment-service',
      branch: 'main',
      strategy: 'canary'
    }
  };
  let jsonSent = null;
  let statusSent = 200;
  const res = {
    status: (code) => {
      statusSent = code;
      return res;
    },
    json: (data) => {
      jsonSent = data;
    }
  };

  const postRoute = deploymentsRouter.stack.find(s => s.route && s.route.path === '/' && s.route.methods.post);
  const postHandler = postRoute.route.stack[0].handle;
  await postHandler(req, res);

  assert.strictEqual(statusSent, 201);
  assert.strictEqual(jsonSent.success, true);
  assert.strictEqual(jsonSent.deploymentId, 'mock-inserted-deploy-id');
  assert.strictEqual(jsonSent.status, 'running');
  assert.strictEqual(jsonSent.strategy, 'canary');
  assert.ok(dbQueries.length >= 1);
  assert.ok(dbQueries[0].sql.toLowerCase().includes('insert into deployments'));
});

test('REST API Endpoints - PATCH /api/deployments/:id updates status', async () => {
  dbQueries = [];
  const req = {
    params: { id: 'mock-inserted-deploy-id' },
    body: {
      status: 'success',
      current_stage: 'Completed'
    }
  };
  let jsonSent = null;
  const res = {
    json: (data) => {
      jsonSent = data;
    }
  };

  const patchRoute = deploymentsRouter.stack.find(s => s.route && s.route.path === '/:id' && s.route.methods.patch);
  const patchHandler = patchRoute.route.stack[0].handle;
  await patchHandler(req, res);

  assert.strictEqual(jsonSent.success, true);
  assert.strictEqual(dbQueries.length > 0, true);
});

test('REST API Endpoints - POST /api/analysis/gate evaluates Gatekeeper risk score', async () => {
  const req = {
    body: {
      rawDiff: 'diff --git a/file b/file\n+console.log("ok");',
      files: [{ path: 'file' }],
      authorEmail: 'dev@example.com'
    }
  };
  let jsonSent = null;
  const res = {
    json: (data) => {
      jsonSent = data;
    }
  };

  const gateRoute = analysisRouter.stack.find(s => s.route && s.route.path === '/gate' && s.route.methods.post);
  const gateHandler = gateRoute.route.stack[0].handle;
  await gateHandler(req, res);

  assert.strictEqual(jsonSent.success, true);
  assert.strictEqual(jsonSent.decision, 'PASS');
  assert.strictEqual(jsonSent.risk_score, 0);
});

test('REST API Endpoints - POST /api/analysis/rca executes diagnostics', async () => {
  const req = {
    body: {
      logs: 'ECONNREFUSED database',
      repo: 'payment-service',
      commitSha: 'sha123'
    }
  };
  let jsonSent = null;
  const res = {
    json: (data) => {
      jsonSent = data;
    }
  };

  const rcaHandler = analysisRouter.stack.find(s => s.route && s.route.path === '/rca').route.stack[0].handle;
  await rcaHandler(req, res);

  assert.strictEqual(jsonSent.success, true);
  assert.strictEqual(jsonSent.failure_type, 'environment_issue');
  assert.strictEqual(jsonSent.confidence, 90);
});

const healthRouter = require('../../api/src/routes/health');
const axios = require('axios');

test('Health Endpoints - GET /db returns connected when pgPool query succeeds', async () => {
  const dbHealthRoute = healthRouter.stack.find(s => s.route && s.route.path === '/db' && s.route.methods.get);
  const dbHealthHandler = dbHealthRoute.route.stack[0].handle;

  let jsonSent = null;
  let statusSent = 200;
  const res = {
    status: (code) => {
      statusSent = code;
      return res;
    },
    json: (data) => {
      jsonSent = data;
    }
  };

  await dbHealthHandler({}, res);
  assert.strictEqual(statusSent, 200);
  assert.deepStrictEqual(jsonSent, { db: 'connected' });
});

test('Health Endpoints - GET /redis returns connected when ping succeeds', async () => {
  const originalRedis = databaseConfig.redisClient;
  databaseConfig.redisClient = {
    ping: async () => 'PONG'
  };

  const redisHealthRoute = healthRouter.stack.find(s => s.route && s.route.path === '/redis' && s.route.methods.get);
  const redisHealthHandler = redisHealthRoute.route.stack[0].handle;

  let jsonSent = null;
  let statusSent = 200;
  const res = {
    status: (code) => {
      statusSent = code;
      return res;
    },
    json: (data) => {
      jsonSent = data;
    }
  };

  await redisHealthHandler({}, res);
  databaseConfig.redisClient = originalRedis;

  assert.strictEqual(statusSent, 200);
  assert.deepStrictEqual(jsonSent, { redis: 'connected' });
});

test('Health Endpoints - GET /qdrant returns connected when axios check succeeds', async () => {
  const originalGet = axios.get;
  axios.get = async (url) => {
    return { data: { collections: [] } };
  };

  const qdrantHealthRoute = healthRouter.stack.find(s => s.route && s.route.path === '/qdrant' && s.route.methods.get);
  const qdrantHealthHandler = qdrantHealthRoute.route.stack[0].handle;

  let jsonSent = null;
  let statusSent = 200;
  const res = {
    status: (code) => {
      statusSent = code;
      return res;
    },
    json: (data) => {
      jsonSent = data;
    }
  };

  await qdrantHealthHandler({}, res);
  axios.get = originalGet;

  assert.strictEqual(statusSent, 200);
  assert.deepStrictEqual(jsonSent, { qdrant: 'connected' });
});
