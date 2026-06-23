const express = require('express');
const router = express.Router();
const databaseConfig = require('../../config/database');

// GET /api/deployments - Get deployments list
router.get('/', async (req, res) => {
  const pgPool = databaseConfig.pgPool;
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'Database connection not initialized' });
    }
    const result = await pgPool.query('SELECT * FROM deployments ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching deployments:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/deployments/:id/status - Get status of specific deployment
router.get('/:id/status', async (req, res) => {
  const pgPool = databaseConfig.pgPool;
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'Database connection not initialized' });
    }
    const result = await pgPool.query(
      'SELECT status, strategy, risk_score, current_stage, deploy_history FROM deployments WHERE id = $1', 
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching deployment status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/deployments/:id/rollback - Trigger rollback
router.post('/:id/rollback', async (req, res) => {
  const pgPool = databaseConfig.pgPool;
  try {
    const deploymentId = req.params.id;
    if (!pgPool) {
      return res.json({ success: true, deploymentId, status: 'rolling_back', mocked: true });
    }

    const { executeRollback } = require('../../agents/planner/deploy-coordinator');
    // Execute rollback in background
    executeRollback(deploymentId).catch(err => {
      console.error(`Error executing rollback for ${deploymentId}:`, err);
    });

    res.json({ success: true, deploymentId, status: 'rolling_back' });
  } catch (error) {
    console.error('Error triggering rollback:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/deployments/ - Start a deployment run session
router.post('/', async (req, res) => {
  const pgPool = databaseConfig.pgPool;
  try {
    const { repo, branch, commit_sha, strategy } = req.body;
    if (!repo || !branch) {
      return res.status(400).json({ error: 'Missing required parameters: repo, branch' });
    }

    const commitSha = commit_sha || 'deploy-' + Math.random().toString(36).substring(2, 10);
    const deployStrategy = strategy || 'rolling';

    if (!pgPool) {
      return res.json({ 
        success: true, 
        deploymentId: 'mock-deploy-' + Date.now(), 
        status: 'running', 
        strategy: deployStrategy,
        mocked: true 
      });
    }

    const insertQuery = `
      INSERT INTO deployments (repo, branch, commit_sha, status, strategy, started_at)
      VALUES ($1, $2, $3, 'running', $4, NOW())
      RETURNING id;
    `;
    const insertResult = await pgPool.query(insertQuery, [repo, branch, commitSha, deployStrategy]);
    const deploymentId = insertResult.rows[0].id;

    // Trigger strategy and rollback plan in background
    try {
      const { generateRollbackPlan } = require('../../agents/planner/rollback-planner');
      await generateRollbackPlan({
        deploymentId,
        repo,
        previousCommitSha: 'prev-sha-' + Math.random().toString(36).substring(2, 8),
        hasDbMigration: deployStrategy === 'maintenance window'
      });
    } catch (err) {
      console.error('Failed to generate rollback plan in API POST /deployments:', err.message);
    }

    const { selectStrategy } = require('../../agents/planner/strategy-selector');
    const strategyPlan = selectStrategy({
      riskScore: 0,
      hasDbMigration: deployStrategy === 'maintenance window'
    });
    strategyPlan.strategy = deployStrategy;

    // Run coordinator in background
    const { executeDeployment } = require('../../agents/planner/deploy-coordinator');
    executeDeployment(deploymentId, strategyPlan, {
      pollIntervalMs: process.env.NODE_ENV === 'test' ? 5 : 15000
    }).catch(err => {
      console.error(`Error executing deployment coordinator for ${deploymentId}:`, err);
    });

    res.status(201).json({ success: true, deploymentId, status: 'running', strategy: deployStrategy });
  } catch (error) {
    console.error('Error starting deployment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /api/deployments/:id - Update deployment session status/details
router.patch('/:id', async (req, res) => {
  const pgPool = databaseConfig.pgPool;
  try {
    const deploymentId = req.params.id;
    const { status, current_stage, log_message } = req.body;

    if (!pgPool) {
      return res.json({ success: true, deploymentId, status, mocked: true });
    }

    let updateFields = [];
    let queryParams = [];
    let paramIndex = 1;

    if (status) {
      updateFields.push(`status = $${paramIndex++}`);
      queryParams.push(status);
    }
    if (current_stage) {
      updateFields.push(`current_stage = $${paramIndex++}`);
      queryParams.push(current_stage);
    }
    if (status === 'success' || status === 'failure') {
      updateFields.push(`completed_at = NOW()`);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No update parameters specified' });
    }

    // Append log message to deploy_history if specified
    if (log_message) {
      const selectQuery = 'SELECT deploy_history FROM deployments WHERE id = $1';
      const selectResult = await pgPool.query(selectQuery, [deploymentId]);
      if (selectResult.rows.length > 0) {
        let history = selectResult.rows[0].deploy_history || [];
        if (!Array.isArray(history)) {
          history = [];
        }
        history.push({ timestamp: new Date().toISOString(), message: log_message });
        updateFields.push(`deploy_history = $${paramIndex++}`);
        queryParams.push(JSON.stringify(history));
      }
    }

    queryParams.push(deploymentId);
    const updateQuery = `
      UPDATE deployments 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING *;
    `;

    const updateResult = await pgPool.query(updateQuery, queryParams);
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment session not found' });
    }

    const updatedDeploy = updateResult.rows[0];

    // If status is failure, trigger automated root cause diagnostics
    if (status === 'failure') {
      const { runFailureFlow } = require('../../agents/orchestrator/failure-flow');
      runFailureFlow({
        owner: 'generic',
        repo: updatedDeploy.repo,
        runId: deploymentId,
        commitSha: updatedDeploy.commit_sha,
        branch: updatedDeploy.branch,
        commitMessage: log_message || 'Manual build failure reported',
        prNumber: null
      }).catch(err => {
        console.error('Failed to trigger runFailureFlow in PATCH deployments API:', err);
      });
    }

    res.json({ success: true, deployment: updatedDeploy });
  } catch (error) {
    console.error('Error updating deployment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
