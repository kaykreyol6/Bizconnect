'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized } = require('../lib/errors');

const COOKIE = 'bc_session';

function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, config.jwtSecret, {
    expiresIn: config.jwtTtlSeconds,
    algorithm: 'HS256',
  });
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: config.jwtTtlSeconds * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/**
 * Stateless auth: accepts the httpOnly cookie (browser) or a Bearer token
 * (mobile/API clients). No server-side session store, so any instance can
 * serve any request — a prerequisite for horizontal scaling.
 */
function readUserId(req) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function optionalAuth(req, _res, next) {
  req.userId = readUserId(req);
  next();
}

function requireAuth(req, _res, next) {
  req.userId = readUserId(req);
  if (!req.userId) return next(unauthorized());
  next();
}

module.exports = { signToken, setSessionCookie, clearSessionCookie, optionalAuth, requireAuth, COOKIE };
