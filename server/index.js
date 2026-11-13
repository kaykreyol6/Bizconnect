'use strict';

const config = require('./config');
const logger = require('./logger');
const { createDb } = require('./db/knex');
const { createApp } = require('./app');

async function main() {
  const db = createDb();
  if (config.autoMigrate) {
    await db.migrate.latest();
    if (config.seedDemo) {
      const { c } = await db('users').count({ c: '*' }).first();
      if (Number(c) === 0) {
        await db.seed.run();
        logger.info('Seeded demo data (login: jane@demo.bizconnect / demo-password)');
      }
    }
  }

  const state = { shuttingDown: false };
  const app = createApp({ db, state });
  const server = app.listen(config.port, () => logger.info({ port: config.port, env: config.env }, 'BizConnect listening'));
  // Keep-alive must outlive the load balancer's idle timeout to avoid 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // Graceful shutdown: fail readiness first so the LB drains us, then stop
  // accepting connections, finish in-flight requests, and close the DB pool.
  const shutdown = (signal) => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    server.close(async () => {
      await db.destroy().catch(() => {});
      logger.info('shutdown complete');
      process.exit(0);
    });
    server.closeIdleConnections?.();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
