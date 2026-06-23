const express = require('express');
const router = express.Router();
const axios = require('axios');
const databaseConfig = require('../../config/database');
const { setupPipeline, getGithubToken } = require('../services/github');

// GET /api/github/repos - List user's repositories
router.get('/repos', async (req, res) => {
  const pgPool = databaseConfig.pgPool;
  const userId = req.user.id;

  try {
    const token = await getGithubToken(userId, pgPool);
    if (!token) {
      return res.status(401).json({ error: 'GitHub account is not connected or token is missing' });
    }

    // Mock response for sandbox mode
    if (token.startsWith('mock-github-access-token')) {
      const mockRepos = [
        { id: 1, full_name: 'UsmanXTech/payment-service', description: 'Payment processing system', html_url: 'https://github.com/UsmanXTech/payment-service' },
        { id: 2, full_name: 'UsmanXTech/auth-service', description: 'User login & JWT session API', html_url: 'https://github.com/UsmanXTech/auth-service' },
        { id: 3, full_name: 'UsmanXTech/PipelineDoc', description: 'Self-healing CI/CD platform', html_url: 'https://github.com/UsmanXTech/PipelineDoc' }
      ];
      return res.json(mockRepos);
    }

    // Real GitHub request
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'PipelineDoc-API'
      },
      params: {
        sort: 'updated',
        per_page: 50
      }
    });

    const repos = response.data.map(repo => ({
      id: repo.id,
      full_name: repo.full_name,
      description: repo.description,
      html_url: repo.html_url
    }));

    res.json(repos);
  } catch (err) {
    console.error('Error fetching GitHub repos:', err.message);
    res.status(500).json({ error: 'Failed to fetch GitHub repositories' });
  }
});

// POST /api/github/setup-pipeline - Automatically create pipelinedoc-ci branch & push workflow yml
router.post('/setup-pipeline', async (req, res) => {
  const pgPool = databaseConfig.pgPool;
  const userId = req.user.id;
  const { repo } = req.body; // e.g., "UsmanXTech/payment-service"

  try {
    const result = await setupPipeline(userId, repo, pgPool);
    res.json(result);
  } catch (err) {
    console.error('Error setting up GitHub pipeline:', err.message);
    res.status(500).json({ error: err.message || 'Failed to complete pipeline configuration on GitHub' });
  }
});

module.exports = router;
