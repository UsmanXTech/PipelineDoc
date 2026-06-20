const axios = require('axios');
const config = require('../../config/uipath');
const { redisClient } = require('../../config/database');

const AUTH_URL = 'https://account.uipath.com/oauth/token';
const BASE_URL = 'https://cloud.uipath.com';

/**
 * Gets a cached access token or fetches a new one from UiPath OAuth.
 */
async function getAccessToken() {
  const cacheKey = 'uipath:access_token';

  // 1. Try to fetch from Redis cache
  if (redisClient) {
    try {
      const cachedToken = await redisClient.get(cacheKey);
      if (cachedToken) {
        return cachedToken;
      }
    } catch (cacheErr) {
      console.warn('Failed to read UiPath token from Redis cache:', cacheErr.message);
    }
  }

  // 2. Fetch new token via Client Credentials OAuth flow
  try {
    const response = await axios.post(
      AUTH_URL,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId || 'dummy-client-id',
        client_secret: config.clientSecret || 'dummy-client-secret',
        scope: 'OR.TestSetExecutions OR.TestSets OR.Monitoring'
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const token = response.data.access_token;
    const expiresIn = response.data.expires_in || 3600;

    // 3. Cache token in Redis (expire 60s early to avoid race conditions)
    if (redisClient && token) {
      try {
        await redisClient.set(cacheKey, token, 'EX', expiresIn - 60);
      } catch (cacheErr) {
        console.warn('Failed to write UiPath token to Redis cache:', cacheErr.message);
      }
    }

    return token;
  } catch (error) {
    console.error('Failed to authenticate with UiPath Cloud:', error.message);
    throw new Error('UiPath Cloud Authentication failed: ' + error.message);
  }
}

/**
 * Triggers a test suite run in UiPath Test Cloud.
 */
async function triggerTestSuite(suiteId, environment = 'Production') {
  // Return mock fallback in development/test
  if (process.env.NODE_ENV !== 'production') {
    return { executionId: `mock-exec-${suiteId}-${Date.now()}`, status: 'pending', mocked: true };
  }

  const token = await getAccessToken();
  const orgId = config.organizationId || 'dummy-org-id';
  const tenant = config.tenantName || 'dummy-tenant';

  const url = `${BASE_URL}/${orgId}/${tenant}/orchestrator_/odata/TestSetExecutions/UiPath.Server.Configuration.OData.StartTestSetExecution`;

  try {
    const response = await axios.post(
      url,
      {
        testSetId: suiteId,
        environmentName: environment
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-UIPATH-OrganizationUnitId': '1' // Default folder unit id
        }
      }
    );

    // Returns execution job details
    return {
      executionId: response.data.value ? response.data.value[0].Id : 'mock-exec-id',
      status: 'pending'
    };
  } catch (error) {
    console.error(`Failed to trigger UiPath Test Suite ${suiteId}:`, error.message);
    throw error;
  }
}

/**
 * Polls the UiPath Test Run status until complete.
 */
async function pollTestResults(executionId, timeoutMs = 120000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const report = await getTestReport(executionId);
    if (report.status === 'Passed' || report.status === 'Failed' || report.status === 'Completed') {
      return report;
    }
    // Poll every 15 seconds as per specifications
    await new Promise(resolve => setTimeout(resolve, 15000));
  }

  throw new Error(`UiPath test run polling timed out for execution ${executionId}`);
}

/**
 * Gets the detailed test report/results for a specific run execution.
 */
async function getTestReport(executionId) {
  // Return mocked results in development/test if executionId is mock
  if (executionId.startsWith('mock-exec')) {
    const isFailed = executionId.includes('fail');
    const isFlaky = executionId.includes('flaky');
    return {
      executionId,
      status: isFailed ? 'Failed' : 'Passed',
      totalTests: 5,
      passed: isFailed ? 3 : 5,
      failed: isFailed ? 2 : 0,
      flaky: isFlaky ? 1 : 0,
      testCases: [
        { name: 'TC_Login', status: 'Passed' },
        { name: 'TC_Dashboard', status: 'Passed' },
        { name: 'TC_Payments', status: isFailed ? 'Failed' : 'Passed' },
        { name: 'TC_SignOut', status: 'Passed' }
      ]
    };
  }

  const token = await getAccessToken();
  const orgId = config.organizationId || 'dummy-org-id';
  const tenant = config.tenantName || 'dummy-tenant';

  const url = `${BASE_URL}/${orgId}/${tenant}/orchestrator_/odata/TestSetExecutions(${executionId})`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const execution = response.data;
    
    // Parse statuses
    const status = execution.Status; // e.g. "Passed", "Failed", "Running"
    
    return {
      executionId,
      status,
      totalTests: execution.TotalTestCasesCount || 0,
      passed: execution.PassedTestCasesCount || 0,
      failed: execution.FailedTestCasesCount || 0,
      flaky: execution.FlakyTestCasesCount || 0,
    };
  } catch (error) {
    console.error(`Failed to get UiPath Test Report for ${executionId}:`, error.message);
    throw error;
  }
}

module.exports = {
  getAccessToken,
  triggerTestSuite,
  pollTestResults,
  getTestReport
};
