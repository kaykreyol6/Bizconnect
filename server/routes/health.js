'use strict';

const express = require('express');

/**
 * /healthz — liveness: the process is up (no dependencies checked).
 * /readyz  — readiness: DB reachable and not shutting down. Load balancers
 *            should route traffic only to instances that pass this check.
 */
module.exports = function healthRoutes(state) {
  const r = express.Router();
  r.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  r.get('/readyz', async (req, res) => {
    if (state.shuttingDown) return res.status(503).json({ status: 'shutting_down' });
    try {
      await req.app.locals.db.raw('select 1');
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'db_unavailable' });
    }
  });
  return r;
};
