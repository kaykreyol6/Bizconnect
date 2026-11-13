'use strict';

const pino = require('pino');
const config = require('./config');

module.exports = pino({
  level: config.logLevel,
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'], remove: true },
});
