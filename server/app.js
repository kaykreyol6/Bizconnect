'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');
const logger = require('./logger');
const { notFoundHandler, errorHandler } = require('./middleware/errors');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function cors(req, res, next) {
  const origin = req.get('origin');
  if (origin && config.corsOrigins.includes(origin)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      Vary: 'Origin',
    });
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
}

/**
 * CSRF defence-in-depth (on top of SameSite=Lax cookies): state-changing API
 * calls must be JSON. HTML forms can't send application/json cross-site
 * without a CORS preflight, which we only grant to allow-listed origins.
 */
function requireJsonForMutations(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const type = req.get('content-type');
  if (type && !req.is('application/json')) {
    return res.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json' } });
  }
  next();
}

function createApp({ db, state = { shuttingDown: false } }) {
  const app = express();
  app.locals.db = db;
  app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.get('x-request-id') || crypto.randomUUID();
        res.set('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      // Lean log lines: at high request volume, full header dumps cost real money.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': config.isProd ? [] : null,
        },
      },
      strictTransportSecurity: config.isProd,
    }),
  );
  app.use(compression());
  app.use(require('./routes/health')(state));

  const limiterBase = { windowMs: config.rateLimit.windowMs, standardHeaders: 'draft-8', legacyHeaders: false };
  const apiLimiter = rateLimit({
    ...limiterBase,
    limit: config.rateLimit.max,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } }),
  });
  const authLimiter = rateLimit({
    ...limiterBase,
    limit: config.rateLimit.authMax,
    skipSuccessfulRequests: true, // only failed logins count — throttles credential stuffing
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } }),
  });

  const api = express.Router();
  api.use(cors, apiLimiter, requireJsonForMutations, express.json({ limit: '100kb' }), cookieParser());
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use('/auth', require('./routes/auth')({ authLimiter }));
  api.use(require('./routes/users')());
  api.use(require('./routes/posts')());
  api.use(require('./routes/gigs')());
  api.use(require('./routes/compliance')());
  api.use(require('./routes/messages')());
  api.use(require('./routes/meta')());
  api.use(notFoundHandler);
  app.use('/api/v1', api);

  // Static web client. index.html is revalidated on every load so deploys roll
  // out immediately; other assets get a short cache + ETag (put a CDN in front
  // in production — see docs/SCALING.md).
  app.use(
    express.static(PUBLIC_DIR, {
      index: false,
      maxAge: config.isProd ? '1h' : 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
