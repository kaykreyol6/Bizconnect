'use strict';

const path = require('node:path');
const fs = require('node:fs');
const knexFactory = require('knex');
const config = require('../config');

function buildKnexConfig(overrides = {}) {
  const migrations = { directory: path.join(__dirname, 'migrations'), tableName: 'knex_migrations' };
  const seeds = { directory: path.join(__dirname, 'seeds') };

  if (config.databaseUrl) {
    return {
      client: 'pg',
      connection: config.databaseUrl,
      pool: { min: 0, max: config.dbPoolMax },
      migrations,
      seeds,
      ...overrides,
    };
  }

  const filename = overrides.filename || config.sqliteFile;
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  return {
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    // A single connection keeps :memory: databases consistent and avoids SQLITE_BUSY.
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn, done) => {
        conn.pragma('foreign_keys = ON');
        if (filename !== ':memory:') conn.pragma('journal_mode = WAL');
        done();
      },
    },
    migrations,
    seeds,
  };
}

function createDb(overrides) {
  return knexFactory(buildKnexConfig(overrides));
}

module.exports = { createDb, buildKnexConfig };
