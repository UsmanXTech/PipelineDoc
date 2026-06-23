const axios = require('axios');
const config = require('../../config/github');

const GITHUB_API_URL = 'https://api.github.com';

/**
 * Creates authenticated axios client for GitHub API.
 */
function getClient() {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'PipelineDoc-Agent',
  };

  if (config.token) {
    headers['Authorization'] = `token ${config.token}`;
  }

  return axios.create({
    baseURL: GITHUB_API_URL,
    headers,
  });
}

/**
 * Fetches logs for failed jobs of a workflow run.
 */
async function getWorkflowLogs(owner, repo, runId) {
  const client = getClient();
  try {
    // 1. Fetch the jobs list for the workflow run
    const jobsResponse = await client.get(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
    const jobs = jobsResponse.data.jobs || [];
    
    // 2. Identify failed jobs
    const failedJobs = jobs.filter(job => job.conclusion === 'failure');
    
    if (failedJobs.length === 0) {
      return 'No failed jobs found.';
    }

    // 3. Fetch logs for each failed job and concatenate them
    let concatenatedLogs = '';
    for (const job of failedJobs) {
      try {
        const logResponse = await client.get(`/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`, {
          responseType: 'text',
        });
        concatenatedLogs += `--- Failed Job: ${job.name} (ID: ${job.id}) ---\n`;
        concatenatedLogs += logResponse.data;
        concatenatedLogs += '\n\n';
      } catch (logError) {
        console.error(`Error fetching logs for job ${job.id}:`, logError.message);
        concatenatedLogs += `--- Failed Job: ${job.name} (Logs Unavailable) ---\n\n`;
      }
    }

    return concatenatedLogs;
  } catch (error) {
    console.error(`Error fetching workflow run jobs for run ${runId}:`, error.message);
    throw error;
  }
}

/**
 * Fetches the raw diff of a commit.
 */
async function getCommitDiff(owner, repo, sha) {
  const client = getClient();
  try {
    const response = await client.get(`/repos/${owner}/${repo}/commits/${sha}`, {
      headers: {
        Accept: 'application/vnd.github.diff',
      },
      responseType: 'text',
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching commit diff for SHA ${sha}:`, error.message);
    throw error;
  }
}

/**
 * Fetches pull request details.
 */
async function getPRDetails(owner, repo, prNumber) {
  const client = getClient();
  try {
    const response = await client.get(`/repos/${owner}/${repo}/pulls/${prNumber}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching PR details for PR #${prNumber}:`, error.message);
    throw error;
  }
}

/**
 * Creates a comment on a pull request.
 */
async function createPRComment(owner, repo, prNumber, body) {
  const client = getClient();
  try {
    const response = await client.post(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
      body,
    });
    return response.data;
  } catch (error) {
    console.error(`Error posting comment on PR #${prNumber}:`, error.message);
    throw error;
  }
}

async function getCommit(owner, repo, sha) {
  const client = getClient();
  try {
    const response = await client.get(`/repos/${owner}/${repo}/commits/${sha}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching commit ${sha}:`, error.message);
    throw error;
  }
}

async function getFileCommits(owner, repo, path, limit = 5) {
  const client = getClient();
  try {
    const response = await client.get(`/repos/${owner}/${repo}/commits`, {
      params: {
        path,
        per_page: limit
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching file commits for ${path}:`, error.message);
    return [];
  }
}

async function createCheckRun(owner, repo, { name, headSha, status, conclusion, output }) {
  const client = getClient();
  try {
    const response = await client.post(`/repos/${owner}/${repo}/check-runs`, {
      name,
      head_sha: headSha,
      status,
      conclusion,
      output
    });
    return response.data;
  } catch (error) {
    console.error(`Error creating GitHub Check Run for ${headSha}:`, error.message);
    throw error;
  }
}

async function updateCheckRun(owner, repo, checkRunId, { status, conclusion, output }) {
  const client = getClient();
  try {
    const response = await client.patch(`/repos/${owner}/${repo}/check-runs/${checkRunId}`, {
      status,
      conclusion,
      output
    });
    return response.data;
  } catch (error) {
    console.error(`Error updating GitHub Check Run ${checkRunId}:`, error.message);
    throw error;
  }
}

async function getPRReviews(owner, repo, prNumber) {
  const client = getClient();
  try {
    const response = await client.get(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching PR reviews for PR #${prNumber}:`, error.message);
    throw error;
  }
}

/**
 * Fetches the raw diff of a pull request.
 */
async function getPRDiff(owner, repo, prNumber) {
  const client = getClient();
  try {
    const response = await client.get(`/repos/${owner}/${repo}/pulls/${prNumber}`, {
      headers: {
        Accept: 'application/vnd.github.diff',
      },
      responseType: 'text',
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching PR diff for PR #${prNumber}:`, error.message);
    throw error;
  }
}

/**
 * Fetches the list of files in a pull request.
 */
async function getPRFiles(owner, repo, prNumber) {
  const client = getClient();
  try {
    const response = await client.get(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
    return response.data; // Array of file objects
  } catch (error) {
    console.error(`Error fetching PR files for PR #${prNumber}:`, error.message);
    throw error;
  }
}

module.exports = {
  getWorkflowLogs,
  getCommitDiff,
  getPRDetails,
  createPRComment,
  getCommit,
  getFileCommits,
  createCheckRun,
  updateCheckRun,
  getPRReviews,
  getPRDiff,
  getPRFiles,
};

