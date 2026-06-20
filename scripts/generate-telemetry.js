const { pgPool } = require('../config/database');
const crypto = require('crypto');
require('dotenv').config();

const REPOS = ['payment-service', 'auth-service', 'notification-service', 'shipping-api'];
const BRANCHES = ['main', 'feature/stripe-integration', 'hotfix/session-expiry', 'dev-migration'];
const STRATEGIES = ['canary', 'rolling', 'blue/green'];
const AUTHORS = ['alex@example.com', 'julia@example.com', 'marcus@example.com', 'linda@example.com'];

const ERROR_LOGS = [
  `Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1494:16)
    at Protocol.Connection._write (node:internal/streams/writable:397:12)
    at pool.query("SELECT * FROM users") in /app/controllers/user.js:24:15`,
  `java.lang.NullPointerException: Cannot invoke "String.equals(Object)" because "configValue" is null
    at com.pipelinedoc.auth.ConfigLoader.getEnvironment(ConfigLoader.java:82)
    at com.pipelinedoc.auth.AuthController.verify(AuthController.java:45)
    at SpringBootApplication.run(SpringBootApplication.java:22)`,
  `TypeError: Cannot read properties of undefined (reading 'split')
    at processToken (/app/services/jwt.js:18:32)
    at verifyAuth (/app/middleware/auth.js:12:5)
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)`
];

const RESOLUTIONS = [
  'Restart PostgreSQL container and verify DB check bounds.',
  'Define missing environment variables in production vault configuration.',
  'Added safe optional chaining fallback in token verification middleware.'
];

const FAIL_TYPES = ['environment_issue', 'config_error', 'build_error'];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureDbSchema() {
  if (!pgPool) return;
  console.log('Verifying telemetry database columns and UiPath tables...');
  try {
    await pgPool.query(`
      ALTER TABLE deployments 
      ADD COLUMN IF NOT EXISTS current_stage TEXT,
      ADD COLUMN IF NOT EXISTS deploy_history JSONB;
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS uipath_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id TEXT NOT NULL,
        process_name TEXT NOT NULL,
        robot_name TEXT,
        state TEXT NOT NULL,
        input_arguments JSONB,
        output_arguments JSONB,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS uipath_queue_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        queue_name TEXT NOT NULL,
        reference TEXT,
        status TEXT NOT NULL,
        exception_type TEXT,
        exception_reason TEXT,
        processing_duration_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('UiPath database schema validated successfully.');
  } catch (err) {
    console.error('Failed schema migration:', err.message);
  }
}

async function populateHistoricalData() {
  if (!pgPool) return;
  
  // Check if data already exists
  const checkCount = await pgPool.query('SELECT count(*) FROM uipath_jobs');
  if (parseInt(checkCount.rows[0].count) > 0) {
    console.log('Database already has UiPath records. Skipping seed data.');
    return;
  }

  console.log('Clearing old telemetry to perform a clean synced seed...');
  await pgPool.query('TRUNCATE deployments, incidents, runbooks, team_patterns, uipath_jobs, uipath_queue_items RESTART IDENTITY CASCADE');

  console.log('Seeding historical PipelineDoc telemetry and UiPath logs...');

  // Seeding runbooks
  await pgPool.query(`
    INSERT INTO runbooks (title, trigger_pattern, steps, success_count) VALUES
    ('Postgres Connection Fixer', 'ECONNREFUSED', '[{"step": 1, "action": "kubectl rollout restart statefulset/postgres"}]'::jsonb, 12),
    ('Auth Service Memory Warm-up', 'OutOfMemory', '[{"step": 1, "action": "kubectl set resources deployment auth-service --limits=memory=1024Mi"}]'::jsonb, 8),
    ('Generic Container Restart', 'NullPointerException', '[{"step": 1, "action": "kubectl rollout restart deployment/auth-service"}]'::jsonb, 5);
  `);

  // Seeding team patterns
  await pgPool.query(`
    INSERT INTO team_patterns (author_email, failure_type, frequency) VALUES
    ('alex@example.com', 'environment_issue', 3),
    ('julia@example.com', 'config_error', 1),
    ('marcus@example.com', 'build_error', 2);
  `);

  const robots = ['Robot_Maestro_01', 'Robot_Maestro_02', 'Robot_Healer_01', 'Robot_Healer_02'];

  // Seed 12 past deployments (completed successful/failed)
  for (let i = 0; i < 12; i++) {
    const isSuccess = i !== 4 && i !== 9;
    const isRolledBack = i === 9;
    const repo = REPOS[i % REPOS.length];
    const branch = 'main';
    const strategy = STRATEGIES[i % STRATEGIES.length];
    const risk = Math.floor(Math.random() * 35);
    const date = new Date(Date.now() - (12 - i) * 3600 * 1000);
    const completedDate = new Date(date.getTime() + 85 * 1000);

    const deployId = crypto.randomUUID();
    const status = isSuccess ? 'success' : (isRolledBack ? 'rolled_back' : 'failed');
    const stage = isSuccess ? 'Pipeline Completed' : (isRolledBack ? 'Rolled Back' : 'Test Cloud verification failed');

    const history = [
      { stage: 'Risk Scoring & Pre-Checks', status: 'success', timestamp: date.toISOString(), message: `Gatekeeper passed with score ${risk}` },
      { stage: 'VSIX Package Assembly', status: 'success', timestamp: new Date(date.getTime() + 15 * 1000).toISOString() },
      { stage: 'Orchestrator Rollout', status: 'success', timestamp: new Date(date.getTime() + 35 * 1000).toISOString() }
    ];

    if (isSuccess) {
      history.push({ stage: 'Test Cloud verification', status: 'success', timestamp: new Date(date.getTime() + 65 * 1000).toISOString() });
      history.push({ stage: 'Deployment Complete', status: 'success', timestamp: completedDate.toISOString() });
    } else if (isRolledBack) {
      history.push({ stage: 'Test Cloud verification', status: 'failed', timestamp: new Date(date.getTime() + 65 * 1000).toISOString() });
      history.push({ stage: 'Orchestrator Rollback', status: 'success', timestamp: new Date(date.getTime() + 80 * 1000).toISOString() });
    } else {
      history.push({ stage: 'Test Cloud verification', status: 'failed', timestamp: new Date(date.getTime() + 65 * 1000).toISOString() });
    }

    await pgPool.query(`
      INSERT INTO deployments (id, repo, branch, commit_sha, status, risk_score, strategy, current_stage, deploy_history, started_at, completed_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $10)
    `, [
      deployId, repo, branch, `sha_${Math.floor(Math.random()*1000000)}`, status, risk, strategy, stage, JSON.stringify(history),
      date.toISOString(), completedDate.toISOString()
    ]);

    // UIPath Job logs for this deployment
    const uipDeployJobId = `job-dep-${i}-${Date.now()}`;
    const robot = robots[i % robots.length];
    
    // 1. Deploy Flow process job
    await pgPool.query(`
      INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, output_arguments, start_time, end_time, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)
    `, [
      uipDeployJobId, 'UiPath_DeployFlowProcess', robot, 'Successful',
      JSON.stringify({ repo, branch, strategy, deploymentId: deployId }),
      JSON.stringify({ status: 'success', deploymentId: deployId }),
      date, new Date(date.getTime() + 35 * 1000)
    ]);

    // 2. Test Cloud verification job
    const uipTestJobId = `job-test-${i}-${Date.now()}`;
    await pgPool.query(`
      INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, output_arguments, start_time, end_time, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)
    `, [
      uipTestJobId, 'UiPath_TestSuite_Execution', robot, isSuccess ? 'Successful' : 'Faulted',
      JSON.stringify({ suiteId: 'suite-payment-api', environment: 'Production' }),
      JSON.stringify({ passed: isSuccess ? 5 : 3, failed: isSuccess ? 0 : 2, status: isSuccess ? 'Passed' : 'Failed' }),
      new Date(date.getTime() + 35 * 1000), new Date(date.getTime() + 65 * 1000)
    ]);

    // 3. Queue item for Artifact verification
    await pgPool.query(`
      INSERT INTO uipath_queue_items (queue_name, reference, status, exception_type, exception_reason, processing_duration_ms, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      'Deployment_Artifact_Verification_Queue', deployId, 'Successful', null, null, 1500, date
    ]);

    // Insert corresponding incident for failed / rolled back runs
    if (!isSuccess) {
      const incId = crypto.randomUUID();
      const errIdx = i % ERROR_LOGS.length;
      const failType = FAIL_TYPES[errIdx];
      await pgPool.query(`
        INSERT INTO incidents (id, deployment_id, type, root_cause, raw_logs, resolution, resolved_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        incId, deployId, failType, `Root Cause Isolator: ${ERROR_LOGS[errIdx].split('\n')[0]}`,
        ERROR_LOGS[errIdx], RESOLUTIONS[errIdx], isRolledBack ? completedDate.toISOString() : null, date.toISOString()
      ]);

      // 4. Failure Doctor Flow job
      const uipDrJobId = `job-dr-${i}-${Date.now()}`;
      await pgPool.query(`
        INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, output_arguments, start_time, end_time, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)
      `, [
        uipDrJobId, 'UiPath_FailureDoctorFlowProcess', robot, 'Successful',
        JSON.stringify({ repo, runId: 100 + i, incidentId: incId }),
        JSON.stringify({ diagnosis: `RCA isolates ${failType}`, success: true }),
        new Date(date.getTime() + 66 * 1000), new Date(date.getTime() + 75 * 1000)
      ]);

      if (isRolledBack) {
        // 5. Healing restart job
        const uipHealingJobId = `job-heal-${i}-${Date.now()}`;
        await pgPool.query(`
          INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, output_arguments, start_time, end_time, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)
        `, [
          uipHealingJobId, 'UiPath_RestartServiceProcess', robot, 'Successful',
          JSON.stringify({ serviceName: repo, action: 'restart' }),
          JSON.stringify({ recovery: 'successful' }),
          new Date(date.getTime() + 76 * 1000), new Date(date.getTime() + 85 * 1000)
        ]);

        // Healing Queue item
        await pgPool.query(`
          INSERT INTO uipath_queue_items (queue_name, reference, status, exception_type, exception_reason, processing_duration_ms, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          'Service_Healing_Transaction_Queue', deployId, 'Successful', null, null, 2400, new Date(date.getTime() + 76 * 1000)
        ]);
      } else {
        // Unresolved failed deployment -> queue business exception
        await pgPool.query(`
          INSERT INTO uipath_queue_items (queue_name, reference, status, exception_type, exception_reason, processing_duration_ms, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          'Service_Healing_Transaction_Queue', deployId, 'Failed', 'BusinessException', 'Service failed integration sanity checks.', 1800, new Date(date.getTime() + 66 * 1000)
        ]);
      }
    }
  }

  console.log('Seeding complete.');
}

async function simulateLiveDeployments() {
  if (!pgPool) return;

  console.log('PipelineDoc Simulation service started successfully.');
  const robots = ['Robot_Maestro_01', 'Robot_Maestro_02', 'Robot_Healer_01', 'Robot_Healer_02'];
  
  while (true) {
    try {
      // 1. Get currently active or pending runs
      const activeDeploys = await pgPool.query(`
        SELECT id, repo, branch, commit_sha, status, current_stage, deploy_history, strategy, started_at, risk_score
        FROM deployments
        WHERE status IN ('running', 'failure', 'rolling_back')
        ORDER BY created_at ASC
      `);

      if (activeDeploys.rows.length > 0) {
        for (const deploy of activeDeploys.rows) {
          const deployId = deploy.id;
          const status = deploy.status;
          const stage = deploy.current_stage || 'Risk Scoring & Pre-Checks';
          let history = deploy.deploy_history || [];
          const robot = robots[Math.floor(Math.random() * robots.length)];

          if (status === 'running') {
            // Process running stages
            if (stage === 'Risk Scoring & Pre-Checks') {
              const nextStage = 'VSIX Package Assembly';
              history.push({ stage: nextStage, status: 'success', timestamp: new Date().toISOString() });
              await pgPool.query(
                `UPDATE deployments SET current_stage = $1, deploy_history = $2 WHERE id = $3`,
                [nextStage, JSON.stringify(history), deployId]
              );
              
              // UiPath: Successful verification queue item
              await pgPool.query(`
                INSERT INTO uipath_queue_items (queue_name, reference, status, processing_duration_ms, created_at)
                VALUES ($1, $2, $3, $4, NOW())
              `, ['Deployment_Artifact_Verification_Queue', deployId, 'Successful', 1200]);

              console.log(`[Simulation] Deploy ${deployId} advanced to VSIX Package Assembly`);
            } 
            else if (stage === 'VSIX Package Assembly') {
              const nextStage = 'Orchestrator Rollout';
              history.push({ stage: nextStage, status: 'success', timestamp: new Date().toISOString(), message: 'Triggered UiPath Maestro Job Release' });
              await pgPool.query(
                `UPDATE deployments SET current_stage = $1, deploy_history = $2 WHERE id = $3`,
                [nextStage, JSON.stringify(history), deployId]
              );

              // UiPath: Trigger Deploy Flow Job
              const jobId = `job-dep-live-${Date.now().toString().slice(-4)}`;
              await pgPool.query(`
                INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, start_time)
                VALUES ($1, $2, $3, $4, $5, NOW())
              `, [jobId, 'UiPath_DeployFlowProcess', robot, 'Running', JSON.stringify({ repo: deploy.repo, branch: deploy.branch, deploymentId: deployId })]);

              console.log(`[Simulation] Deploy ${deployId} advanced to Orchestrator Rollout`);
            } 
            else if (stage === 'Orchestrator Rollout') {
              const nextStage = 'Test Cloud verification';
              history.push({ stage: nextStage, status: 'running', timestamp: new Date().toISOString(), message: 'Invoked test runner' });
              await pgPool.query(
                `UPDATE deployments SET current_stage = $1, deploy_history = $2 WHERE id = $3`,
                [nextStage, JSON.stringify(history), deployId]
              );

              // UiPath: Complete Deploy Flow, Start Test Suite Job
              await pgPool.query(`
                UPDATE uipath_jobs SET state = 'Successful', end_time = NOW()
                WHERE process_name = 'UiPath_DeployFlowProcess' AND state = 'Running' AND input_arguments->>'deploymentId' = $1
              `, [deployId]);

              const testJobId = `job-test-live-${Date.now().toString().slice(-4)}`;
              await pgPool.query(`
                INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, start_time)
                VALUES ($1, $2, $3, $4, $5, NOW())
              `, [testJobId, 'UiPath_TestSuite_Execution', robot, 'Running', JSON.stringify({ suiteId: `suite-${deploy.repo}`, environment: 'Production' })]);

              console.log(`[Simulation] Deploy ${deployId} advanced to Test Cloud verification`);
            } 
            else if (stage === 'Test Cloud verification') {
              // Decide success/failure
              const roll = Math.random();
              if (roll > 0.25) {
                // Success path
                history.push({ stage: 'Test Cloud verification', status: 'success', timestamp: new Date().toISOString(), message: 'All test sets passed.' });
                history.push({ stage: 'Pipeline Complete', status: 'success', timestamp: new Date().toISOString() });
                await pgPool.query(
                  `UPDATE deployments SET status = 'success', current_stage = 'Pipeline Completed', deploy_history = $1, completed_at = NOW() WHERE id = $2`,
                  [JSON.stringify(history), deployId]
                );

                // UiPath: Complete Test Suite Job
                await pgPool.query(`
                  UPDATE uipath_jobs SET state = 'Successful', end_time = NOW(), output_arguments = $1
                  WHERE process_name = 'UiPath_TestSuite_Execution' AND state = 'Running'
                `, [JSON.stringify({ passed: 5, failed: 0, status: 'Passed' })]);

                console.log(`[Simulation] Deploy ${deployId} COMPLETED SUCCESSFULLY`);
              } else {
                // Failure path
                history.push({ stage: 'Test Cloud verification', status: 'failed', timestamp: new Date().toISOString(), message: 'Failed integration tests.' });
                await pgPool.query(
                  `UPDATE deployments SET status = 'failure', current_stage = 'Test Cloud verification failed', deploy_history = $1 WHERE id = $2`,
                  [JSON.stringify(history), deployId]
                );

                // UiPath: Fault Test Suite Job
                await pgPool.query(`
                  UPDATE uipath_jobs SET state = 'Faulted', end_time = NOW(), output_arguments = $1
                  WHERE process_name = 'UiPath_TestSuite_Execution' AND state = 'Running'
                `, [JSON.stringify({ passed: 3, failed: 2, status: 'Failed' })]);
                
                // Create incident
                const incId = crypto.randomUUID();
                const errIdx = Math.floor(Math.random() * ERROR_LOGS.length);
                const failType = FAIL_TYPES[errIdx];
                await pgPool.query(`
                  INSERT INTO incidents (id, deployment_id, type, root_cause, raw_logs, resolution, created_at)
                  VALUES ($1, $2, $3, $4, $5, $6, NOW())
                `, [
                  incId, deployId, failType, `Telemetry Anomaly: ${ERROR_LOGS[errIdx].split('\n')[0]}`,
                  ERROR_LOGS[errIdx], RESOLUTIONS[errIdx]
                ]);

                // UiPath: Failure Doctor Job trigger
                const drJobId = `job-dr-live-${Date.now().toString().slice(-4)}`;
                await pgPool.query(`
                  INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, start_time, end_time, created_at)
                  VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
                `, [drJobId, 'UiPath_FailureDoctorFlowProcess', robot, 'Successful', JSON.stringify({ repo: deploy.repo, incidentId: incId }), JSON.stringify({ success: true, diagnosis: `Autodetected ${failType}` })]);

                console.log(`[Simulation] Deploy ${deployId} FAILED. Created Incident ${incId}`);
              }
            }
          } 
          else if (status === 'failure') {
            // Trigger auto rollback
            history.push({ stage: 'Auto-Remediation Initiated', status: 'running', timestamp: new Date().toISOString(), message: 'Self-healing triggered rollback' });
            await pgPool.query(
              `UPDATE deployments SET status = 'rolling_back', current_stage = 'Initiating Auto-Rollback', deploy_history = $1 WHERE id = $2`,
              [JSON.stringify(history), deployId]
            );

            // UiPath: Start Healing Flow Job
            const healJobId = `job-heal-live-${Date.now().toString().slice(-4)}`;
            await pgPool.query(`
              INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, start_time)
              VALUES ($1, $2, $3, $4, $5, NOW())
            `, [healJobId, 'UiPath_HealingFlowProcess', robot, 'Running', JSON.stringify({ deploymentId: deployId, trigger: 'rollback' })]);

            // UiPath: Add Healing Queue Item
            await pgPool.query(`
              INSERT INTO uipath_queue_items (queue_name, reference, status, created_at)
              VALUES ($1, $2, $3, NOW())
            `, ['Service_Healing_Transaction_Queue', deployId, 'InProgress']);

            console.log(`[Simulation] Deploy ${deployId} status set to ROLLING_BACK`);
          } 
          else if (status === 'rolling_back') {
            // Finalize rollback
            history.push({ stage: 'Orchestrator Rollback', status: 'success', timestamp: new Date().toISOString(), message: 'UiPath HealingFlow restored stable package' });
            history.push({ stage: 'Rollback Complete', status: 'success', timestamp: new Date().toISOString() });
            await pgPool.query(
              `UPDATE deployments SET status = 'rolled_back', current_stage = 'Rolled Back', deploy_history = $1, completed_at = NOW() WHERE id = $2`,
              [JSON.stringify(history), deployId]
            );

            // Resolve incident
            await pgPool.query(
              `UPDATE incidents SET resolved_at = NOW(), resolution = 'Resolved automatically via self-healing rollback execution' WHERE deployment_id = $1`,
              [deployId]
            );

            // UiPath: Complete Healing Flow Job, trigger service restart
            await pgPool.query(`
              UPDATE uipath_jobs SET state = 'Successful', end_time = NOW()
              WHERE process_name = 'UiPath_HealingFlowProcess' AND state = 'Running'
            `);

            const restartJobId = `job-restart-live-${Date.now().toString().slice(-4)}`;
            await pgPool.query(`
              INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, start_time, end_time)
              VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            `, [restartJobId, 'UiPath_RestartServiceProcess', robot, 'Successful', JSON.stringify({ serviceName: deploy.repo, action: 'restart' })]);

            // UiPath: Complete Queue Item
            await pgPool.query(`
              UPDATE uipath_queue_items SET status = 'Successful', processing_duration_ms = 2200
              WHERE queue_name = 'Service_Healing_Transaction_Queue' AND reference = $1 AND status = 'InProgress'
            `, [deployId]);

            console.log(`[Simulation] Deploy ${deployId} ROLLBACK COMPLETE AND INCIDENT RESOLVED`);
          }
        }
      } else {
        // No active deployment, spawn one with 40% probability
        if (Math.random() < 0.4) {
          const repo = REPOS[Math.floor(Math.random() * REPOS.length)];
          const branch = BRANCHES[Math.floor(Math.random() * BRANCHES.length)];
          const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
          const risk = Math.floor(Math.random() * 40);
          const deployId = crypto.randomUUID();
          
          const history = [
            { stage: 'Risk Scoring & Pre-Checks', status: 'success', timestamp: new Date().toISOString(), message: `Gatekeeper passed with risk score ${risk}/100` }
          ];

          await pgPool.query(`
            INSERT INTO deployments (id, repo, branch, commit_sha, status, risk_score, strategy, current_stage, deploy_history, started_at, created_at)
            VALUES ($1, $2, $3, $4, 'running', $5, $6, 'Risk Scoring & Pre-Checks', $7, NOW(), NOW())
          `, [deployId, repo, branch, `sha_${Math.floor(Math.random()*1000000)}`, risk, strategy, JSON.stringify(history)]);

          // UiPath: Add New verification Queue Item
          await pgPool.query(`
            INSERT INTO uipath_queue_items (queue_name, reference, status, created_at)
            VALUES ($1, $2, $3, NOW())
          `, ['Deployment_Artifact_Verification_Queue', deployId, 'InProgress']);

          console.log(`[Simulation] Spawned new active deployment ${deployId} for ${repo} on ${branch}`);
        }
      }
    } catch (loopErr) {
      console.error('Simulation loop error:', loopErr.message);
    }
    // Check every 8 seconds for dashboard interactivity
    await sleep(8000);
  }
}

async function run() {
  await ensureDbSchema();
  await populateHistoricalData();
  await simulateLiveDeployments();
}

run().catch(console.error);
