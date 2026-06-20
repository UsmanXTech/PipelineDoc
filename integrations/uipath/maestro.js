const axios = require('axios');
const config = require('../../config/uipath');
const { getAccessToken } = require('./test-cloud');

const BASE_URL = 'https://cloud.uipath.com';

const FLOW_PROCESS_MAP = {
  FailureDoctorFlow: 'UiPath_FailureDoctorFlowProcess',
  DeployFlow: 'UiPath_DeployFlowProcess',
  HealingFlow: 'UiPath_HealingFlowProcess'
};

/**
 * Connects to UiPath Orchestrator API and starts an orchestration job.
 * 
 * @param {string} processName - Name of the process release (e.g. 'FailureDoctorFlow')
 * @param {Object} inputs - Key-value pair of arguments to pass to the process
 * @returns {Object} Job information containing jobId and status
 */
async function startOrchestration(processName, inputs = {}) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mock UiPath Maestro]: Starting orchestration for process "${processName}" with inputs:`, inputs);
    return { jobId: `mock-maestro-job-${processName}-${Date.now()}`, status: 'Pending', mocked: true };
  }

  const token = await getAccessToken();
  const orgId = config.organizationId || 'dummy-org-id';
  const tenant = config.tenantName || 'dummy-tenant';
  
  const releaseUrl = `${BASE_URL}/${orgId}/${tenant}/orchestrator_/odata/Releases`;
  const startJobUrl = `${BASE_URL}/${orgId}/${tenant}/orchestrator_/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs`;

  try {
    // 1. Fetch Release Key for the process
    const releaseRes = await axios.get(releaseUrl, {
      params: {
        $filter: `Name eq '${processName}'`
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'X-UIPATH-OrganizationUnitId': '1'
      }
    });

    const releases = releaseRes.data.value || [];
    if (releases.length === 0) {
      throw new Error(`UiPath process Release not found for Name: "${processName}"`);
    }
    const releaseKey = releases[0].Key;

    // 2. Start the Job
    const jobRes = await axios.post(
      startJobUrl,
      {
        startInfo: {
          ReleaseKey: releaseKey,
          Strategy: 'All',
          RobotIds: [],
          JobsCount: 1,
          Source: 'Manual',
          InputArguments: JSON.stringify(inputs)
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-UIPATH-OrganizationUnitId': '1'
        }
      }
    );

    return {
      jobId: jobRes.data.value ? jobRes.data.value[0].Id : 'mock-job-id',
      status: jobRes.data.value ? jobRes.data.value[0].State : 'Pending'
    };
  } catch (error) {
    console.error(`Failed to start UiPath Maestro orchestration for ${processName}:`, error.message);
    throw error;
  }
}

/**
 * Polls or fetches the current status of an orchestration job.
 * 
 * @param {string|number} jobId - The job ID in Orchestrator
 * @returns {Object} Job status details
 */
async function getOrchestrationStatus(jobId) {
  if (typeof jobId === 'string' && jobId.startsWith('mock-maestro-job')) {
    return { jobId, status: 'Successful', mocked: true };
  }

  const token = await getAccessToken();
  const orgId = config.organizationId || 'dummy-org-id';
  const tenant = config.tenantName || 'dummy-tenant';
  
  const jobUrl = `${BASE_URL}/${orgId}/${tenant}/orchestrator_/odata/Jobs(${jobId})`;

  try {
    const response = await axios.get(jobUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-UIPATH-OrganizationUnitId': '1'
      }
    });

    return {
      jobId,
      status: response.data.State || 'Unknown',
      info: response.data.Info || '',
      startTime: response.data.StartTime || null,
      endTime: response.data.EndTime || null
    };
  } catch (error) {
    console.error(`Failed to fetch status for UiPath Orchestrator Job ${jobId}:`, error.message);
    throw error;
  }
}

/**
 * Triggers a sequence execution simulating FailureDoctorFlow.
 * Sequence: AnalysisAgent -> MemoryAgent -> IntegrationAgent
 */
async function runFailureDoctorFlow(inputs) {
  console.log('Orchestrating FailureDoctorFlow (AnalysisAgent -> MemoryAgent -> IntegrationAgent)...');
  
  const { runFailureFlow } = require('../../agents/orchestrator/failure-flow');
  const result = await runFailureFlow({
    owner: inputs.owner,
    repo: inputs.repo,
    runId: inputs.runId,
    commitSha: inputs.commitSha,
    branch: inputs.branch,
    commitMessage: inputs.commitMessage,
    prNumber: inputs.prNumber,
    slackChannel: inputs.slackChannel,
    deploymentId: inputs.deploymentId
  });

  if (result.success && result.diagnosis) {
    try {
      const resolver = require('../../agents/memory/incident-resolver');
      await resolver.resolveIncident(inputs.incidentId || 'manual-incident', 'resolved', {
        root_cause: result.diagnosis.root_cause,
        failure_type: result.diagnosis.failure_type,
        repo: inputs.repo
      });
    } catch (resolverErr) {
      console.error('FailureDoctorFlow resolver step failed:', resolverErr.message);
    }
  }

  return { success: result.success, result };
}

/**
 * Triggers a sequence execution simulating DeployFlow.
 * Sequence: GatekeeperAgent -> PlannerAgent -> MonitorAgent
 */
async function runDeployFlow(inputs) {
  console.log('Orchestrating DeployFlow (GatekeeperAgent -> PlannerAgent -> MonitorAgent)...');

  const { evaluateGate } = require('../../agents/gatekeeper/gate-decision');
  const gateResult = await evaluateGate({
    rawDiff: inputs.rawDiff || '',
    files: inputs.files || [],
    authorEmail: inputs.authorEmail || ''
  });

  if (gateResult.decision === 'BLOCK') {
    return { success: false, reason: 'Blocked by Gatekeeper', details: gateResult };
  }

  const { selectStrategy } = require('../../agents/planner/strategy-selector');
  const strategyPlan = selectStrategy({
    riskScore: gateResult.risk_score,
    hasDbMigration: inputs.hasDbMigration || false
  });

  const { executeDeployment } = require('../../agents/planner/deploy-coordinator');
  const deploySuccess = await executeDeployment(inputs.deploymentId, strategyPlan, {
    pollIntervalMs: process.env.NODE_ENV === 'test' ? 5 : 15000
  });

  return { success: deploySuccess, details: { gateResult, strategyPlan } };
}

/**
 * Triggers a sequence execution simulating HealingFlow.
 * Sequence: MonitorAgent -> HealerAgent
 */
async function runHealingFlow(inputs) {
  console.log('Orchestrating HealingFlow (MonitorAgent -> HealerAgent)...');

  const { evaluateAutoRollback } = require('../../agents/healer/auto-rollback');
  const rollbackResult = await evaluateAutoRollback();

  return { success: true, rollbackResult };
}

module.exports = {
  startOrchestration,
  getOrchestrationStatus,
  runFailureDoctorFlow,
  runDeployFlow,
  runHealingFlow,
  FLOW_PROCESS_MAP
};
