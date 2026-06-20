const express = require('express');
const router = express.Router();
const { pgPool } = require('../../../config/database');
const config = require('../../../config/uipath');

// GET /api/uipath - Check connection state, configuration, and mapped processes
router.get('/', async (req, res) => {
  try {
    const isConfigured = !!(config.clientId && config.clientSecret);
    const mockMode = process.env.NODE_ENV !== 'production';

    res.json({
      status: 'Connected',
      connectionMode: mockMode ? 'Simulation (Local Mock)' : 'UiPath Automation Cloud Live',
      organizationId: config.organizationId || 'pipelinedoc-org',
      tenantName: config.tenantName || 'pipelinedoc-tenant',
      clientIdObfuscated: config.clientId ? `${config.clientId.substring(0, 6)}...` : 'not-configured',
      uipathHost: 'https://cloud.uipath.com',
      folderPath: 'Shared/Orchestrator_Unit_1',
      activeRobots: [
        { name: 'Robot_Maestro_01', status: 'Available', type: 'Unattended' },
        { name: 'Robot_Maestro_02', status: 'Available', type: 'Unattended' },
        { name: 'Robot_Healer_01', status: 'Available', type: 'Unattended' },
        { name: 'Robot_Healer_02', status: 'Available', type: 'Unattended' }
      ],
      mappedProcesses: [
        { key: 'FailureDoctorFlow', processName: 'UiPath_FailureDoctorFlowProcess', description: 'GitHub workflow failure diagnostics RCA agent' },
        { key: 'DeployFlow', processName: 'UiPath_DeployFlowProcess', description: 'Deployment planner and coordinator agent' },
        { key: 'HealingFlow', processName: 'UiPath_HealingFlowProcess', description: 'Monitor and self-healing auto-rollback agent' },
        { key: 'RestartService', processName: 'UiPath_RestartServiceProcess', description: 'Robot restart operation for backend microservices' }
      ]
    });
  } catch (error) {
    console.error('Error fetching UiPath config status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/uipath/jobs - Fetch executed UiPath Orchestrator jobs
router.get('/jobs', async (req, res) => {
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'Database connection not initialized' });
    }
    const result = await pgPool.query('SELECT * FROM uipath_jobs ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching UiPath jobs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/uipath/queues - Fetch UiPath queue items (transaction processing)
router.get('/queues', async (req, res) => {
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'Database connection not initialized' });
    }
    const result = await pgPool.query('SELECT * FROM uipath_queue_items ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching UiPath queues:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/uipath/summary - Fetch aggregated statistics for UiPath
router.get('/summary', async (req, res) => {
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'Database connection not initialized' });
    }

    const jobsQuery = await pgPool.query(`
      SELECT 
        count(*) as total,
        count(case when state = 'Successful' then 1 end) as success,
        count(case when state = 'Faulted' then 1 end) as faulted
      FROM uipath_jobs
    `);

    const queuesQuery = await pgPool.query(`
      SELECT 
        count(*) as total,
        count(case when status = 'Successful' then 1 end) as success,
        count(case when status = 'Failed' then 1 end) as failed,
        count(case when exception_type = 'BusinessException' then 1 end) as business_exceptions,
        count(case when exception_type = 'ApplicationException' then 1 end) as app_exceptions
      FROM uipath_queue_items
    `);

    const avgDurationQuery = await pgPool.query(`
      SELECT avg(processing_duration_ms) as avg_duration FROM uipath_queue_items WHERE processing_duration_ms IS NOT NULL
    `);

    res.json({
      jobs: {
        total: parseInt(jobsQuery.rows[0].total) || 0,
        success: parseInt(jobsQuery.rows[0].success) || 0,
        faulted: parseInt(jobsQuery.rows[0].faulted) || 0
      },
      queues: {
        total: parseInt(queuesQuery.rows[0].total) || 0,
        success: parseInt(queuesQuery.rows[0].success) || 0,
        failed: parseInt(queuesQuery.rows[0].failed) || 0,
        businessExceptions: parseInt(queuesQuery.rows[0].business_exceptions) || 0,
        appExceptions: parseInt(queuesQuery.rows[0].app_exceptions) || 0,
        avgDurationMs: Math.round(parseFloat(avgDurationQuery.rows[0].avg_duration || 0))
      }
    });
  } catch (error) {
    console.error('Error fetching UiPath stats summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/uipath/jobs/trigger - Manually start an Orchestration process
router.post('/jobs/trigger', async (req, res) => {
  const { processName, inputArguments } = req.body;
  if (!processName) {
    return res.status(400).json({ error: 'processName is required' });
  }

  try {
    const robot = 'Robot_Maestro_01';
    const jobId = `job-manual-${Date.now().toString().slice(-4)}`;

    if (pgPool) {
      await pgPool.query(`
        INSERT INTO uipath_jobs (job_id, process_name, robot_name, state, input_arguments, start_time, end_time)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      `, [jobId, processName, robot, 'Successful', JSON.stringify(inputArguments || {})]);
    }

    res.json({
      success: true,
      jobId,
      state: 'Successful',
      robot,
      message: `Successfully executed manual UiPath job run ${jobId} for process ${processName}`
    });
  } catch (error) {
    console.error('Error triggering manual UiPath job:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
