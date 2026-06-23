const ipCache = new Map();

module.exports = function rateLimiterMiddleware(req, res, next) {
  // Identify client by IP (respecting reverse proxies if any)
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const LIMIT = 100; // 100 requests
  const WINDOW_MS = 60000; // 1 minute

  let clientRecord = ipCache.get(clientIp);

  if (!clientRecord) {
    clientRecord = {
      count: 1,
      resetTime: now + WINDOW_MS
    };
    ipCache.set(clientIp, clientRecord);
  } else {
    if (now > clientRecord.resetTime) {
      // Window expired, reset
      clientRecord.count = 1;
      clientRecord.resetTime = now + WINDOW_MS;
    } else {
      clientRecord.count++;
    }
  }

  // Set standard rate limit headers
  res.setHeader('X-RateLimit-Limit', LIMIT);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, LIMIT - clientRecord.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(clientRecord.resetTime / 1000));

  if (clientRecord.count > LIMIT) {
    return res.status(429).json({ 
      error: 'Too Many Requests', 
      message: 'Rate limit exceeded: Max 100 requests per minute.' 
    });
  }

  next();
};
