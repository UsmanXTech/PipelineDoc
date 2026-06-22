const test = require('node:test');
const assert = require('node:assert');
const databaseConfig = require('../../config/database');
const anthropic = require('../../config/anthropic');
const axios = require('axios');

const originalPgPool = databaseConfig.pgPool;
const originalRedisClient = databaseConfig.redisClient;
const originalAnthropicCreate = anthropic.messages.create;
const originalAxiosPost = axios.post;

// Test state mocks
let dbQueries = [];
let axiosPosts = [];
let anthropicMessagesCreated = [];
let mockMessages = [];

const mockPgPool = {
  query: async (sql, params) => {
    dbQueries.push({ sql, params });
    const sqlLower = sql.toLowerCase().trim();

    if (sqlLower.includes('from deployments')) {
      return {
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            repo: 'payment-service',
            branch: 'main',
            commit_sha: 'sha123',
            status: 'success',
            strategy: 'rolling',
            created_at: new Date()
          }
        ]
      };
    }
    if (sqlLower.includes('from incidents')) {
      return {
        rows: [
          {
            id: '51922729-b42f-470c-bcbf-3a84dbe4fbe6',
            type: 'test_failure',
            root_cause: 'connect ECONNREFUSED 127.0.0.1:5432',
            resolution: 'Restart PostgreSQL container',
            created_at: new Date()
          }
        ]
      };
    }
    if (sqlLower.includes('insert into deployments')) {
      return {
        rows: [{ id: 'mock-inserted-deploy-id' }]
      };
    }
    if (sqlLower.includes('insert into conversations')) {
      return {
        rows: [{ id: 'mock-conversation-id' }]
      };
    }
    if (sqlLower.includes('insert into messages')) {
      mockMessages.push({
        role: params[1],
        content: params[2],
        thought_signature: params[3] || null
      });
      return { rows: [] };
    }
    if (sqlLower.includes('from messages')) {
      return { rows: [...mockMessages] };
    }
    return { rows: [] };
  }
};

databaseConfig.pgPool = mockPgPool;
databaseConfig.redisClient = null; // Mocked out to prevent connection

anthropic.messages.create = async ({ model, max_tokens, system, messages, tools }) => {
  anthropicMessagesCreated.push({ model, system, messages, tools });

  const lastMessage = messages[messages.length - 1];
  const lastMessageContent = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

  if (lastMessageContent.includes('trigger_deploy_tool') || lastMessageContent.includes('Deploy main branch')) {
    return {
      content: [
        {
          type: 'tool_use',
          id: 'tool_u_1',
          name: 'trigger_deploy',
          input: { repo: 'payment-service', branch: 'main', strategy: 'canary' }
        }
      ]
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: 'I am PipelineDoc Assistant. Let me check that for you.'
      }
    ]
  };
};

axios.post = async (url, data) => {
  axiosPosts.push({ url, data });
  return { data: { ok: true } };
};

// Helper for waiting for async Slack command responses to be posted to response_url
async function waitForResponsePost(url) {
  for (let i = 0; i < 20; i++) {
    const post = axiosPosts.find(p => p.url === url);
    if (post) return post;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

// Import code routes under test
const chatRouter = require('../../api/src/routes/chat');
const webhooksRouter = require('../../api/src/routes/webhooks');
const commands = require('../../integrations/slack/commands');

test('Chat Router - POST /api/chat returns SSE stream text', async () => {
  anthropicMessagesCreated = [];
  mockMessages = [];

  let headerSent = {};
  let bodySent = '';
  let ended = false;

  const req = {
    body: {
      message: 'Hello Assistant',
      conversation_history: []
    }
  };

  const res = {
    setHeader: (name, value) => {
      headerSent[name] = value;
    },
    write: (data) => {
      bodySent += data;
    },
    end: () => {
      ended = true;
    }
  };

  const postHandler = chatRouter.stack.find(s => s.route && s.route.path === '/').route.stack[0].handle;
  await postHandler(req, res);

  assert.strictEqual(headerSent['Content-Type'], 'text/event-stream');
  assert.strictEqual(ended, true);
  assert.match(bodySent, /PipelineDoc Assistant/);
  assert.match(bodySent, /\[DONE\]/);
});

test('Chat Router - POST /api/chat handles tool execution workflow', async () => {
  anthropicMessagesCreated = [];
  mockMessages = [];

  let bodySent = '';
  let ended = false;

  const req = {
    body: {
      message: 'Deploy main branch',
      conversation_history: []
    }
  };

  const res = {
    setHeader: () => {},
    write: (data) => {
      bodySent += data;
    },
    end: () => {
      ended = true;
    }
  };

  const postHandler = chatRouter.stack.find(s => s.route && s.route.path === '/').route.stack[0].handle;
  await postHandler(req, res);

  assert.strictEqual(ended, true);
  assert.match(bodySent, /tool_start/);
  assert.match(bodySent, /trigger_deploy/);
  assert.match(bodySent, /tool_result/);
  assert.match(bodySent, /\[DONE\]/);
});

test('Slack Command - status sub-command sends system status', async () => {
  dbQueries = [];
  axiosPosts = [];

  const req = {
    body: {
      command: '/pd',
      text: 'status',
      response_url: 'https://hooks.slack.com/commands/123/456',
      user_id: 'U123'
    }
  };

  let statusResult = null;
  let jsonResult = null;

  const res = {
    status: (code) => {
      statusResult = code;
      return res;
    },
    json: (data) => {
      jsonResult = data;
      return res;
    }
  };

  await commands.handleSlackCommand(req, res);

  assert.strictEqual(statusResult, 200);
  assert.strictEqual(jsonResult.text, 'Acknowledged. Processing your request...');

  const responseUrlPost = await waitForResponsePost('https://hooks.slack.com/commands/123/456');
  assert.ok(responseUrlPost !== null);
  assert.ok(dbQueries.length > 0);
  assert.match(responseUrlPost.data.text, /PipelineDoc System Status/);
});

test('Slack Command - deploy sub-command triggers deployment', async () => {
  dbQueries = [];
  axiosPosts = [];

  const req = {
    body: {
      command: '/pd',
      text: 'deploy payment-service main canary',
      response_url: 'https://hooks.slack.com/commands/123/456',
      user_id: 'U123'
    }
  };

  const res = {
    status: () => res,
    json: () => res
  };

  await commands.handleSlackCommand(req, res);

  const responseUrlPost = await waitForResponsePost('https://hooks.slack.com/commands/123/456');
  assert.ok(responseUrlPost !== null);
  assert.ok(dbQueries.some(q => q.sql.toLowerCase().includes('insert into deployments')));
  assert.match(responseUrlPost.data.text, /Deployment Started/);
});

test('Slack Command - rollback sub-command triggers rollback', async () => {
  dbQueries = [];
  axiosPosts = [];

  const req = {
    body: {
      command: '/pd',
      text: 'rollback 550e8400-e29b-41d4-a716-446655440001',
      response_url: 'https://hooks.slack.com/commands/123/456',
      user_id: 'U123'
    }
  };

  const res = {
    status: () => res,
    json: () => res
  };

  await commands.handleSlackCommand(req, res);

  const responseUrlPost = await waitForResponsePost('https://hooks.slack.com/commands/123/456');
  assert.ok(responseUrlPost !== null);
  assert.match(responseUrlPost.data.text, /Rollback Triggered/);
});

test('Slack Command - why sub-command retrieves last incident', async () => {
  dbQueries = [];
  axiosPosts = [];

  const req = {
    body: {
      command: '/pd',
      text: 'why',
      response_url: 'https://hooks.slack.com/commands/123/456',
      user_id: 'U123'
    }
  };

  const res = {
    status: () => res,
    json: () => res
  };

  await commands.handleSlackCommand(req, res);

  const responseUrlPost = await waitForResponsePost('https://hooks.slack.com/commands/123/456');
  assert.ok(responseUrlPost !== null);
  assert.ok(dbQueries.some(q => q.sql.toLowerCase().includes('from incidents')));
  assert.match(responseUrlPost.data.text, /Last Incident Details/);
});

test('Slack Command - fallback to natural language processing via Claude', async () => {
  anthropicMessagesCreated = [];
  axiosPosts = [];

  const req = {
    body: {
      command: '/pd',
      text: 'help me look at what went wrong',
      response_url: 'https://hooks.slack.com/commands/123/456',
      user_id: 'U123'
    }
  };

  const res = {
    status: () => res,
    json: () => res
  };

  await commands.handleSlackCommand(req, res);

  const responseUrlPost = await waitForResponsePost('https://hooks.slack.com/commands/123/456');
  assert.ok(responseUrlPost !== null);
  assert.strictEqual(anthropicMessagesCreated.length, 1);
  assert.strictEqual(anthropicMessagesCreated[0].messages[0].content, 'help me look at what went wrong');
  assert.match(responseUrlPost.data.text, /PipelineDoc Assistant/);
});

test.after(() => {
  databaseConfig.pgPool = originalPgPool;
  databaseConfig.redisClient = originalRedisClient;
  anthropic.messages.create = originalAnthropicCreate;
  axios.post = originalAxiosPost;

  if (originalPgPool && typeof originalPgPool.end === 'function') {
    originalPgPool.end().catch(() => {});
  }
  if (originalRedisClient) {
    originalRedisClient.disconnect();
  }
});
