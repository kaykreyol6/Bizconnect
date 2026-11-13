'use strict';

process.env.NODE_ENV = 'test';
const request = require('supertest');
const { createDb } = require('../server/db/knex');
const { createApp } = require('../server/app');

async function setup() {
  const db = createDb({ filename: ':memory:' });
  // With DATABASE_URL set (CI Postgres job) start from a clean schema each run.
  if (process.env.DATABASE_URL) await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const app = createApp({ db });
  return { db, app, request: () => request(app) };
}

let n = 0;
async function registerUser(ctx, overrides = {}) {
  n += 1;
  const body = {
    email: `user${n}-${Date.now()}@example.com`,
    password: 'correct-horse-battery',
    name: `User ${n}`,
    country: 'Kenya',
    city: 'Nairobi',
    ...overrides,
  };
  const res = await ctx.request().post('/api/v1/auth/register').send(body).expect(201);
  return { ...res.body, auth: { Authorization: `Bearer ${res.body.token}` }, password: body.password };
}

const CORRECT_ANSWERS = [1, 1, 0, 1, 0];

module.exports = { setup, registerUser, CORRECT_ANSWERS };
