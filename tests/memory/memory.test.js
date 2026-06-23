const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const databaseConfig = require('../../backend/config/database');
const slackClient = require('../../backend/integrations/slack/client');
const anthropic = require('../../backend/config/anthropic');

// Save original configurations/functions to restore them later
const originalPgPool = databaseConfig.pgPool;
const originalSlackSendMessage = slackClient.sendSlackMessage;
const originalAnthropicMessagesCreate = anthropic.messages.create;

// Memory databases
const incidentsDb = {};
const runbooksDb = {};
const teamPatternsDb = {};
const deploymentsDb = {};

// Configure database mock
databaseConfig.pgPool = {
  query: async (sql, params) => {
    const sqlLower = sql.toLowerCase().trim();

    // UPDATE incidents
    if (sqlLower.startsWith('update incidents')) {
      const [resolution, incidentId] = params;
      if (incidentsDb[incidentId]) {
        incidentsDb[incidentId].resolution = resolution;
        incidentsDb[incidentId].resolved_at = new Date();
      }
      return { rows: [incidentsDb[incidentId] || {}] };
    }

    // INSERT INTO incidents
    if (sqlLower.startsWith('insert into incidents')) {
      const id = params[0] || 'mock-incident-uuid';
      incidentsDb[id] = {
        id,
        deployment_id: params[1],
        type: params[2],
        root_cause: params[3],
        raw_logs: params[4],
        resolution: params[5],
        created_at: new Date()
      };
      return { rows: [{ id }] };
    }

    // SELECT * FROM incidents WHERE id = $1
    if (sqlLower.startsWith('select * from incidents where id =')) {
      const id = params[0];
      return { rows: incidentsDb[id] ? [incidentsDb[id]] : [] };
    }

    // SELECT COUNT(*) FROM incidents WHERE root_cause = $1
    if (sqlLower.includes('select count(*) from incidents') && sqlLower.includes('root_cause =')) {
      const rootCause = params[0];
      const count = Object.values(incidentsDb).filter(inc => inc.root_cause === rootCause).length;
      return { rows: [{ count }] };
    }

    // SELECT id, trigger_pattern FROM runbooks or SELECT * FROM runbooks
    if (sqlLower.includes('from runbooks')) {
      return { rows: Object.values(runbooksDb) };
    }

    // INSERT INTO runbooks
    if (sqlLower.startsWith('insert into runbooks')) {
      const id = 'mock-runbook-uuid-' + Math.random().toString(36).substr(2, 5);
      runbooksDb[id] = {
        id,
        title: params[0],
        trigger_pattern: params[1],
        steps: typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2],
        success_count: 0,
        created_at: new Date()
      };
      return { rows: [{ id }] };
    }

    // UPDATE runbooks SET success_count = success_count + 1
    if (sqlLower.startsWith('update runbooks set success_count')) {
      const id = params[0];
      if (runbooksDb[id]) {
        runbooksDb[id].success_count++;
      }
      return { rows: [{ success_count: runbooksDb[id]?.success_count || 0 }] };
    }

    // SELECT id, frequency FROM team_patterns WHERE author_email = $1 AND failure_type = $2
    if (sqlLower.includes('from team_patterns') && sqlLower.includes('author_email =')) {
      const email = params[0];
      const type = params[1];
      const found = Object.values(teamPatternsDb).filter(p => {
        const matchesEmail = p.author_email === email;
        const matchesType = type ? p.failure_type === type : true;
        return matchesEmail && matchesType;
      });
      return { rows: found };
    }

    // UPDATE team_patterns SET frequency
    if (sqlLower.startsWith('update team_patterns set frequency')) {
      const [frequency, id] = params;
      if (teamPatternsDb[id]) {
        teamPatternsDb[id].frequency = frequency;
        teamPatternsDb[id].last_seen = new Date();
      }
      return { rows: [teamPatternsDb[id] || {}] };
    }

    // INSERT INTO team_patterns
    if (sqlLower.startsWith('insert into team_patterns')) {
      const id = 'mock-pattern-uuid-' + Math.random().toString(36).substr(2, 5);
      teamPatternsDb[id] = {
        id,
        author_email: params[0],
        failure_type: params[1],
        frequency: 1,
        last_seen: new Date()
      };
      return { rows: [{ frequency: 1 }] };
    }

    // SELECT repo, started_at, completed_at FROM deployments WHERE id = $1
    if (sqlLower.includes('from deployments') && sqlLower.includes('id =')) {
      const id = params[0];
      return { rows: deploymentsDb[id] ? [deploymentsDb[id]] : [] };
    }

    return { rows: [] };
  }
};

// Configure Slack Mock
slackClient.sendSlackMessage = async ({ channel, text, blocks }) => {
  return { ok: true };
};

// Configure Claude Mock
anthropic.messages.create = async ({ model, max_tokens, system, messages }) => {
  if (system.includes('runbook automation builder')) {
    return {
      content: [{
        text: JSON.stringify({
          title: "Database Connection Refused",
          trigger_pattern: "connect ECONNREFUSED.*5432",
          steps: [
            "Check database service status",
            "Verify network security rules",
            "Restart PostgreSQL container"
          ]
        })
      }]
    };
  } else if (system.includes('Principal Reliability Engineer')) {
    return {
      content: [{
        text: `# Postmortem Report

## Timeline
- 10:00 Incident started
- 10:05 Identified database connection issue

## Root Cause
Port 5432 connection refused on DB host.

## Impact
Duration: 5 minutes. 100% of API requests failing.

## Resolution
Postgres container restarted.

## Action Items
1. Add health checks to Postgres container.
2. Configure alert notifications.
3. Document connection retry logic.`
      }]
    };
  }
  return { content: [{ text: '{}' }] };
};

// Import code modules to test
const indexer = require('../../backend/agents/memory/knowledge-indexer');
const retriever = require('../../backend/agents/memory/knowledge-retriever');
const runbookBuilder = require('../../backend/agents/memory/runbook-builder');
const runbookMatcher = require('../../backend/agents/memory/runbook-matcher');
const patternLearner = require('../../backend/agents/memory/pattern-learner');
const postmortemGenerator = require('../../backend/agents/memory/postmortem-generator');
const resolver = require('../../backend/agents/memory/incident-resolver');

test('Knowledge Indexer & Retriever - indexes text and performs local cosine similarity search', async () => {
  // Clear local vectors cache
  indexer.localVectors.length = 0;

  // Index two dummy incidents
  await indexer.indexIncident('inc-1', 'port 5432 is refused', 'restart db container', { failure_type: 'environment_issue' });
  await indexer.indexIncident('inc-2', 'out of memory error', 'scale limits up', { failure_type: 'build_error' });

  assert.strictEqual(indexer.localVectors.length, 2);

    // Search for something close to database connection refused
    const searchResult = await retriever.retrieveSimilarIncidents('port 5432 is refused restart db container');
    assert.ok(searchResult.similar_incidents.length > 0);
    
    // Highest similarity score should be the port 5432 one
    const topMatch = searchResult.similar_incidents[0];
    assert.ok(topMatch.root_cause.includes('port 5432'));
    assert.ok(topMatch.similarity_score > 0.99);
  });

test('Pattern Learner - tracks failure frequency and inserts or updates team patterns', async () => {
  // Upsert pattern
  const result1 = await patternLearner.learnPattern('dev@example.com', 'test_failure');
  assert.strictEqual(result1.success, true);
  assert.strictEqual(result1.action, 'insert');
  assert.strictEqual(result1.frequency, 1);

  // Upsert again
  const result2 = await patternLearner.learnPattern('dev@example.com', 'test_failure');
  assert.strictEqual(result2.success, true);
  assert.strictEqual(result2.action, 'update');
  assert.strictEqual(result2.frequency, 2);

  // Get insights
  const insights = await patternLearner.getTeamInsights('dev@example.com');
  assert.strictEqual(insights.length, 1);
  assert.strictEqual(insights[0].frequency, 2);
});

test('Runbook Builder & Matcher - codifies runbooks and matches regex patterns', async () => {
  // Populate incidents table mock with 4 similar occurrences
  const rootCause = 'connect ECONNREFUSED 127.0.0.1:5432';
  for (let i = 0; i < 4; i++) {
    const id = `inc-dup-${i}`;
    incidentsDb[id] = { id, root_cause: rootCause, type: 'environment_issue', resolution: 'fixed' };
  }

  // Build runbook (count is 4, so it should trigger Claude and insert to DB)
  const buildResult = await runbookBuilder.checkAndBuildRunbook(rootCause);
  assert.strictEqual(buildResult.success, true);
  assert.strictEqual(buildResult.built, true);
  assert.strictEqual(buildResult.title, 'Database Connection Refused');

  // Match the runbook with a raw log matching the pattern
  const matched = await runbookMatcher.matchRunbook('Some other database error', 'connect ECONNREFUSED 127.0.0.1:5432 in workflow execution');
  assert.ok(matched !== null);
  assert.strictEqual(matched.title, 'Database Connection Refused');
  assert.deepEqual(matched.steps, [
    "Check database service status",
    "Verify network security rules",
    "Restart PostgreSQL container"
  ]);

  // Success increment
  const updated = await runbookMatcher.incrementRunbookSuccess(matched.id);
  assert.strictEqual(updated, true);
});

test('Postmortem Generator - generates postmortem reports automatically', async () => {
  const incidentId = 'postmortem-incident-uuid';
  incidentsDb[incidentId] = {
    id: incidentId,
    type: 'environment_issue',
    root_cause: 'connect ECONNREFUSED 127.0.0.1:5432',
    raw_logs: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
    resolution: 'Restart PostgreSQL container',
    created_at: new Date(),
    resolved_at: new Date()
  };

  const pmResult = await postmortemGenerator.generatePostmortem(incidentId);
  assert.strictEqual(pmResult.success, true);
  assert.ok(fs.existsSync(pmResult.filePath));

  // Clean up postmortem file
  fs.unlinkSync(pmResult.filePath);
});

test('Incident Resolver - runs the unified incident resolution pipeline', async () => {
  const incidentId = 'resolver-incident-uuid';
  incidentsDb[incidentId] = {
    id: incidentId,
    type: 'environment_issue',
    root_cause: 'connect ECONNREFUSED 127.0.0.1:5432',
    raw_logs: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
    resolution: 'pending',
    created_at: new Date()
  };

  const resolveResult = await resolver.resolveIncident(incidentId, 'resolved');
  assert.strictEqual(resolveResult.success, true);
  assert.strictEqual(incidentsDb[incidentId].resolution, 'resolved');
});

// Restore mocks after test suite completes
test.after(() => {
  databaseConfig.pgPool = originalPgPool;
  slackClient.sendSlackMessage = originalSlackSendMessage;
  anthropic.messages.create = originalAnthropicMessagesCreate;

  const { pgPool, redisClient } = require('../../backend/config/database');
  if (pgPool && typeof pgPool.end === 'function') {
    pgPool.end().catch(() => {});
  }
  if (redisClient) {
    redisClient.disconnect();
  }
});
