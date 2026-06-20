const { indexIncident } = require('./knowledge-indexer');
const { checkAndBuildRunbook } = require('./runbook-builder');
const { generatePostmortem } = require('./postmortem-generator');
const databaseConfig = require('../../config/database');

async function resolveIncident(incidentId, resolution, metadata = {}) {
  const pgPool = databaseConfig.pgPool;
  if (!pgPool) {
    // Local-only / fallback mode for test environment
    const rootCause = metadata.root_cause || 'Mock root cause';
    const failureType = metadata.failure_type || 'unknown_failure';
    const repo = metadata.repo || 'unknown-repo';
    await indexIncident(incidentId, rootCause, resolution, {
      failure_type: failureType,
      repo,
      resolution_time_minutes: 0,
      success: resolution === 'resolved' || resolution === 'rolled_back_successfully'
    });
    return { success: true, localOnly: true };
  }

  try {
    // 1. Update incident in Postgres
    const query = `
      UPDATE incidents
      SET resolution = $1, resolved_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;
    const res = await pgPool.query(query, [resolution, incidentId]);
    if (res.rows.length === 0) {
      return { success: false, reason: `Incident ${incidentId} not found in DB` };
    }
    const incident = res.rows[0];

    // 2. Fetch repo and duration from deployment if associated
    let repo = metadata.repo || 'unknown-repo';
    let resolutionTimeMinutes = 0;
    if (incident.deployment_id) {
      const depRes = await pgPool.query('SELECT repo, started_at, completed_at FROM deployments WHERE id = $1', [incident.deployment_id]);
      if (depRes.rows.length > 0) {
        const dep = depRes.rows[0];
        repo = dep.repo || repo;
        if (dep.started_at) {
          const duration = Date.now() - new Date(dep.started_at).getTime();
          resolutionTimeMinutes = Math.max(1, Math.round(duration / 60000));
        }
      }
    }

    // 3. Index in vector database
    await indexIncident(incident.id, incident.root_cause, resolution, {
      failure_type: incident.type,
      repo,
      resolution_time_minutes: resolutionTimeMinutes,
      success: resolution === 'resolved' || resolution === 'rolled_back_successfully'
    });

    // 4. Runbook builder: check occurrences
    if (incident.root_cause) {
      await checkAndBuildRunbook(incident.root_cause);
    }

    // 5. Generate postmortem
    await generatePostmortem(incident.id);

    return { success: true, incident };
  } catch (err) {
    console.error('Failed in resolveIncident handler:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  resolveIncident
};
