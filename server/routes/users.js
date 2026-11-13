'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { notFound, badRequest } = require('../lib/errors');
const { publicUser } = require('../lib/serialize');
const { pageQuery, applyCursor, page } = require('../lib/pagination');
const { INDUSTRY_SLUGS } = require('../lib/catalog');

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    businessName: z.string().trim().max(160).nullable(),
    industry: z.enum(INDUSTRY_SLUGS).nullable(),
    country: z.string().trim().max(80).nullable(),
    region: z.string().trim().max(80).nullable(),
    city: z.string().trim().max(80).nullable(),
    streetAddress: z.string().trim().max(200).nullable(),
    addressPublic: z.boolean(),
    language: z.string().trim().min(2).max(10),
    bio: z.string().trim().max(500).nullable(),
  })
  .partial()
  .strict();

const directoryQuery = pageQuery.extend({
  industry: z.enum(INDUSTRY_SLUGS).optional(),
  country: z.string().trim().max(80).optional(),
  q: z.string().trim().max(80).optional(),
});

const COLUMN_MAP = {
  name: 'name',
  businessName: 'business_name',
  industry: 'industry',
  country: 'country',
  region: 'region',
  city: 'city',
  streetAddress: 'street_address',
  addressPublic: 'address_public',
  language: 'language',
  bio: 'bio',
};

async function userStats(db, userId) {
  const [posts, gigs, apps, likes] = await Promise.all([
    db('posts').where({ author_id: userId }).count({ c: '*' }).first(),
    db('gigs').where({ author_id: userId, status: 'open' }).count({ c: '*' }).first(),
    db('gig_applications').where({ user_id: userId }).count({ c: '*' }).first(),
    db('posts').where({ author_id: userId }).sum({ s: 'like_count' }).first(),
  ]);
  return {
    posts: Number(posts.c),
    activeGigs: Number(gigs.c),
    applications: Number(apps.c),
    likesReceived: Number(likes.s || 0),
  };
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

module.exports = function userRoutes() {
  const r = express.Router();

  r.patch('/users/me', requireAuth, validate(profileSchema), async (req, res) => {
    const db = req.app.locals.db;
    const patch = {};
    for (const [k, v] of Object.entries(req.valid.body)) patch[COLUMN_MAP[k]] = v;
    if (!Object.keys(patch).length) throw badRequest('Nothing to update');
    await db('users').where({ id: req.userId }).update(patch);
    const user = await db('users').where({ id: req.userId }).first();
    res.json({ user: publicUser(user, { self: true }) });
  });

  r.get('/users/:id', optionalAuth, async (req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw notFound();
    const user = await db('users').where({ id }).first();
    if (!user) throw notFound('User not found');
    res.json({ user: publicUser(user, { self: req.userId === id }), stats: await userStats(db, id) });
  });

  r.get('/businesses', validate(directoryQuery, 'query'), async (req, res) => {
    const db = req.app.locals.db;
    const qv = req.valid.query;
    const qb = db('users').where({ account_type: 'business' });
    if (qv.industry) qb.where({ industry: qv.industry });
    if (qv.country) qb.whereRaw('lower(country) = ?', [qv.country.toLowerCase()]);
    if (qv.q) {
      const like = `%${escapeLike(qv.q.toLowerCase())}%`;
      qb.where((w) => w.whereRaw("lower(business_name) like ? escape '\\'", [like]).orWhereRaw("lower(name) like ? escape '\\'", [like]));
    }
    const rows = await applyCursor(qb, qv);
    const result = page(rows, qv.limit, (u) => publicUser(u));
    if (result.items.length) {
      const ids = result.items.map((u) => u.id);
      const gigCounts = await db('gigs').whereIn('author_id', ids).where({ status: 'open' }).groupBy('author_id').select('author_id').count({ c: '*' });
      const map = new Map(gigCounts.map((g) => [g.author_id, Number(g.c)]));
      for (const u of result.items) u.openGigs = map.get(u.id) || 0;
    }
    res.json(result);
  });

  return r;
};
