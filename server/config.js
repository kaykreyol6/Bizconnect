'use strict';

const env = process.env;
const nodeEnv = env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

function required(name, fallback) {
  const v = env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required env var ${name}`);
  return v;
}

const jwtSecret = isProd
  ? required('JWT_SECRET')
  : env.JWT_SECRET || 'dev-insecure-secret-change-me';

if (isProd && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

module.exports = Object.freeze({
  env: nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: Number(env.PORT || 3000),
  logLevel: env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info'),
  // DATABASE_URL=postgres://... switches to Postgres; otherwise SQLite.
  databaseUrl: env.DATABASE_URL || '',
  sqliteFile: env.SQLITE_FILE || (nodeEnv === 'test' ? ':memory:' : './data/bizconnect.sqlite'),
  dbPoolMax: Number(env.DB_POOL_MAX || 10),
  jwtSecret,
  jwtTtlSeconds: Number(env.JWT_TTL_SECONDS || 60 * 60 * 24 * 7),
  bcryptRounds: Number(env.BCRYPT_ROUNDS || (nodeEnv === 'test' ? 4 : 11)),
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY || (isProd ? '1' : 'loopback'),
  rateLimit: {
    windowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60_000),
    max: Number(env.RATE_LIMIT_MAX || 300),
    authMax: Number(env.RATE_LIMIT_AUTH_MAX || 20),
  },
  agreementVersion: '2026.1',
  agreementValidityDays: 365,
  autoMigrate: env.AUTO_MIGRATE ? env.AUTO_MIGRATE === 'true' : !isProd,
  seedDemo: env.SEED_DEMO ? env.SEED_DEMO === 'true' : nodeEnv === 'development',
});
