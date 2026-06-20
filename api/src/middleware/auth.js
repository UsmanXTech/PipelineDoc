const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
  // Bypass auth in testing environments
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // Support Authorization header or query parameter (essential for EventSource/SSE)
  let token = req.query.token;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
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
