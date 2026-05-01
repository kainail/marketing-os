'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

const JWT_SECRET = process.env.JWT_SECRET;
const BCRYPT_ROUNDS = 12;

function isApiRequest(req) {
  return req.path.startsWith('/api/') || (req.headers['accept'] || '').includes('application/json');
}

function getToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies && req.cookies.gymsuite_token) return req.cookies.gymsuite_token;
  return null;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) {
    if (isApiRequest(req)) return res.status(401).json({ error: 'Authentication required' });
    return res.redirect('/login');
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    console.log(`[Auth] Valid token: ${req.user.email}`);
    next();
  } catch (err) {
    console.log(`[Auth] Invalid token: ${err.message}`);
    if (isApiRequest(req)) return res.status(401).json({ error: 'Invalid or expired token' });
    return res.redirect('/login');
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

function requireLocation(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role === 'admin') return next();
    const locationId = req.params.locationId || req.body.locationId || req.query.location;
    if (!locationId || !req.user.locations.includes(locationId)) {
      return res.status(403).json({ error: 'Location access denied' });
    }
    next();
  });
}

function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      locations: user.locations,
      permissions: user.permissions,
    },
    JWT_SECRET
  );
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { requireAuth, requireAdmin, requireLocation, generateToken, hashPassword, comparePassword, loginLimiter };
