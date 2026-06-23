const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
  // Support Authorization header, query parameter, or X-API-Key
  let token = req.query.token;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Bypass checks
  const bypass = process.env.NODE_ENV === 'test' || process.env.BYPASS_AUTH === 'true';
  if (bypass && !token) {
    req.user = { id: '00000000-0000-0000-0000-000000000000', email: 'guest@pipelinedoc.local', name: 'Guest User' };
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const configuredApiKey = process.env.PIPELINEDOC_API_KEY || 'dummy-api-key';
  
  if (apiKey && apiKey === configuredApiKey) {
    req.user = { id: 'ci-service', role: 'integration' };
    return next();
  }

  if (!token) {
    return res.status(401).json({ error: 'Access Denied: No token provided' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'fallback-secret-key';
    const verified = jwt.verify(token, secret);
    req.user = verified;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Access Denied: Invalid or expired token' });
  }
};
