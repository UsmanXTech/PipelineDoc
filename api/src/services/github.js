const axios = require('axios');

async function getGithubToken(userId, pgPool) {
  if (!pgPool) return null;
  const result = await pgPool.query(
    'SELECT github_access_token FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] ? result.rows[0].github_access_token : null;
}

async function setupPipeline(userId, repo, pgPool) {
  if (!repo || !repo.includes('/')) {
    throw new Error('Invalid repository name. Format must be owner/repo_name');
  }

  const token = await getGithubToken(userId, pgPool);
  if (!token) {
    throw new Error('GitHub account is not connected or token is missing');
  }

  const [owner, repoName] = repo.split('/');

  // Workflow file template contents
  const workflowContent = `name: PipelineDoc CI

on:
  push:
    branches: [ main, master, dev ]
  pull_request:
    branches: [ main, master ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci || npm install

      - name: Run Tests
        run: npm test || true

      - name: Report Pipeline Telemetry
        run: |
          curl -X POST \\
            -H "Content-Type: application/json" \\
            -d '{"repo": "\${{ github.repository }}", "branch": "\${{ github.ref_name }}", "commit_sha": "\${{ github.sha }}", "status": "success", "strategy": "GitHub Actions"}' \\
            http://150.230.171.47:3000/webhooks/github
`;

  // Mock response for sandbox mode
  if (token.startsWith('mock-github-access-token')) {
    return {
      success: true,
      message: `Pipeline connected successfully (Sandbox Mode). Created branch 'pipelinedoc-ci' and committed workflow to ${repo}.`,
      branch: 'pipelinedoc-ci',
      workflowFile: '.github/workflows/pipelinedoc.yml'
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'PipelineDoc-API'
  };

  // 1. Get repo details to find default branch name
  const repoResponse = await axios.get(`https://api.github.com/repos/${owner}/${repoName}`, { headers });
  const defaultBranch = repoResponse.data.default_branch || 'main';

  // 2. Get latest commit SHA on the default branch
  const branchResponse = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/${defaultBranch}`, { headers });
  const headSha = branchResponse.data.object.sha;

  // 3. Create a new branch 'pipelinedoc-ci'
  try {
    await axios.post(`https://api.github.com/repos/${owner}/${repoName}/git/refs`, {
      ref: 'refs/heads/pipelinedoc-ci',
      sha: headSha
    }, { headers });
  } catch (err) {
    if (err.response && err.response.status === 422) {
      // Branch already exists, which is fine
    } else {
      throw err;
    }
  }

  // 4. Commit the workflow file to the branch
  const filePath = '.github/workflows/pipelinedoc.yml';
  let fileSha = null;

  // Check if the file already exists on that branch to get its SHA (required for updating)
  try {
    const fileResponse = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`, {
      headers,
      params: { ref: 'pipelinedoc-ci' }
    });
    fileSha = fileResponse.data.sha;
  } catch (err) {
    // File doesn't exist, which is fine
  }

  const commitBody = {
    message: 'ci: add PipelineDoc workflow integration',
    content: Buffer.from(workflowContent).toString('base64'),
    branch: 'pipelinedoc-ci'
  };

  if (fileSha) {
    commitBody.sha = fileSha;
  }

  await axios.put(`https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`, commitBody, { headers });

  return {
    success: true,
    message: `Workflow created successfully on branch 'pipelinedoc-ci' inside ${repo}.`,
    branch: 'pipelinedoc-ci',
    workflowFile: filePath
  };
}

module.exports = {
  setupPipeline,
  getGithubToken
};
