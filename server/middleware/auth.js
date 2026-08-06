const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is missing' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Token format is Bearer <token>' });
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'campusdesk_super_secret_key_67890');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin role required' });
  }
  next();
}

module.exports = {
  authMiddleware,
  adminMiddleware
};
