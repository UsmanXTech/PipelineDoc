const axios = require('axios');
const config = require('../../config/uipath');
const { getAccessToken } = require('./test-cloud');

const BASE_URL = 'https://cloud.uipath.com';

const HEALING_PROCESS_MAP = {
  service_admin_restart: 'UiPath_RestartServiceProcess',
  cache_clear: 'UiPath_ClearCacheProcess',
  certificate_renewal_alert: 'UiPath_RenewCertificateProcess'
};

/**
 * Triggers a healing process job in UiPath Orchestrator.
 * 
 * @param {string} processName - Name of the process to trigger (e.g. 'UiPath_RestartServiceProcess')
 * @param {Object} inputArgs - Arguments payload to feed into the robot execution
 * @returns {Object} Job info
 */
async function triggerHealingProcess(processName, inputArgs = {}) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mock UiPath Healing]: Triggered process "${processName}" with arguments:`, inputArgs);
    return { jobId: `mock-job-${processName}-${Date.now()}`, status: 'Pending', mocked: true };
  }

  const token = await getAccessToken();
  const orgId = config.organizationId || 'dummy-org-id';
  const tenant = config.tenantName || 'dummy-tenant';
  const releaseUrl = `${BASE_URL}/${orgId}/${tenant}/orchestrator_/odata/Releases`;
  const jobUrl = `${BASE_URL}/${orgId}/${tenant}/orchestrator_/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs`;

  try {
    // 1. Fetch Release Key for the process name
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
      jobUrl,
      {
        startInfo: {
          ReleaseKey: releaseKey,
          Strategy: 'All',
          RobotIds: [],
          JobsCount: 1,
          Source: 'Manual',
          InputArguments: JSON.stringify(inputArgs)
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
    console.error(`Failed to trigger UiPath healing process ${processName}:`, error.message);
    throw error;
  }
}

/**
 * Triggers a mapped healing trigger to a specific UiPath Orchestrator process.
 * 
 * @param {string} triggerKey - Key matching HEALING_PROCESS_MAP
 * @param {Object} inputArgs - Arguments to pass to the process
 */
async function triggerMappedHealing(triggerKey, inputArgs = {}) {
  const processName = HEALING_PROCESS_MAP[triggerKey];
  if (!processName) {
    throw new Error(`UiPath mapped process not found for trigger key: "${triggerKey}"`);
  }
  return triggerHealingProcess(processName, inputArgs);
}

module.exports = {
  triggerHealingProcess,
  triggerMappedHealing,
  HEALING_PROCESS_MAP
};
