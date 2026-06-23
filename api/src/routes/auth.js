const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const databaseConfig = require('../../../config/database');
const authMiddleware = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const JWT_TTL_SECONDS = 600; // 10 minutes TTL

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || '';

// GET /api/auth/github/url - Get authorization URL
router.get('/github/url', (req, res) => {
  if (GITHUB_CLIENT_ID) {
    const scope = 'user:email,repo,workflow';
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI)}&scope=${scope}`;
    return res.json({ success: true, isMock: false, url });
  } else {
    // If not configured, we indicate mock mode
    return res.json({ success: true, isMock: true, url: '' });
  }
});

// POST /api/auth/github/callback - Exchange OAuth code for JWT
router.post('/github/callback', async (req, res) => {
  const { code } = req.body;
  const pgPool = databaseConfig.pgPool;

  if (!pgPool) {
    return res.status(500).json({ error: 'Database not initialized' });
  }

  if (!code) {
    return res.status(400).json({ error: 'OAuth code is required' });
  }

  try {
    let email = '';
    let name = '';
    let githubId = '';
    let accessToken = '';

    // Handle Mock Authentication Flow
    if (code === 'mock-github-code' || !GITHUB_CLIENT_ID) {
      email = 'github-user@pipelinedoc.local';
      name = 'GitHub Tester';
      githubId = 'mock-github-id-12345';
      accessToken = 'mock-github-access-token-12345';
    } else {
      // Real GitHub OAuth Flow
      // 1. Exchange code for access token
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: GITHUB_REDIRECT_URI
        },
        {
          headers: { Accept: 'application/json' }
        }
      );

      accessToken = tokenResponse.data.access_token;
      if (!accessToken) {
        return res.status(400).json({ error: 'Invalid or expired OAuth code' });
      }

      // 2. Fetch user profile
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      githubId = String(userResponse.data.id);
      name = userResponse.data.name || userResponse.data.login || 'GitHub User';
      email = userResponse.data.email || '';

      // 3. If email is empty, fetch from user emails endpoint
      if (!email) {
        const emailsResponse = await axios.get('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const primaryEmailObj = emailsResponse.data.find(e => e.primary && e.verified) || emailsResponse.data[0];
        if (primaryEmailObj) {
          email = primaryEmailObj.email;
        }
      }

      if (!email) {
        return res.status(400).json({ error: 'Unable to retrieve email from GitHub profile' });
      }
    }

    // Upsert user in database
    // We hash a placeholder password since they authenticate via GitHub
    const passwordHash = `github:${githubId}`;
    
    const REQUIRE_PRE_REGISTERED = process.env.REQUIRE_PRE_REGISTERED === 'true';
    const ALLOWED_DOMAINS = process.env.ALLOWED_DOMAINS ? process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim().toLowerCase()) : [];

    // Check domain whitelist if configured
    if (ALLOWED_DOMAINS.length > 0) {
      const userDomain = email.split('@')[1]?.toLowerCase();
      if (!userDomain || !ALLOWED_DOMAINS.includes(userDomain)) {
        return res.status(403).json({ error: 'Access forbidden: Your email domain is not whitelisted' });
      }
    }

    let userResult = await pgPool.query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    let user;
    if (userResult.rows.length === 0) {
      // If pre-registration is required, block unknown users
      if (REQUIRE_PRE_REGISTERED) {
        return res.status(403).json({ error: 'Access forbidden: User is not pre-registered in the system' });
      }

      // Insert new user
      const insertResult = await pgPool.query(
        'INSERT INTO users (email, password_hash, name, github_access_token) VALUES ($1, $2, $3, $4) RETURNING id, email, name',
        [email.toLowerCase().trim(), passwordHash, name, accessToken]
      );
      user = insertResult.rows[0];
    } else {
      // Update existing user's access token and name
      const updateResult = await pgPool.query(
        'UPDATE users SET github_access_token = $1, name = $2 WHERE id = $3 RETURNING id, email, name',
        [accessToken, name, userResult.rows[0].id]
      );
      user = updateResult.rows[0];
    }

    // Generate JWT token (expiring in 10 minutes)
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_TTL_SECONDS }
    );

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    console.error('GitHub Auth Callback Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/auth/renew - Renew active token
router.post('/renew', authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user || user.id === 'ci-service') {
    return res.status(401).json({ error: 'Unauthorized user for token renewal' });
  }

  try {
    // Generate fresh JWT token (expiring in 10 minutes)
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_TTL_SECONDS }
    );

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    console.error('Token renewal error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
