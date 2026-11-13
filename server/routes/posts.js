'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { notFound, forbidden, badRequest } = require('../lib/errors');
const { isUniqueViolation, insertedId } = require('../lib/db-errors');
const ser = require('../lib/serialize');
const { pageQuery, applyCursor, page } = require('../lib/pagination');

const feedQuery = pageQuery.extend({
  type: z.enum(['update', 'bargain']).optional(),
  scope: z.enum(['all', 'regional']).default('all'),
  author: z.coerce.number().int().positive().optional(),
});

const createSchema = z
  .object({
    type: z.enum(['update', 'bargain']).default('update'),
    body: z.string().trim().min(1).max(5000),
    price: z
      .object({
        amountCents: z.number().int().min(0).max(1e11),
        currency: z.string().trim().length(3).transform((s) => s.toUpperCase()),
      })
      .optional(),
    country: z.string().trim().max(80).optional(),
    city: z.string().trim().max(80).optional(),
  })
  .refine((d) => d.type !== 'bargain' || d.price, { message: 'Bargain posts need a price', path: ['price'] });

const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) });

function postSelect(db, userId) {
  return db('posts as p')
    .join('users as u', 'u.id', 'p.author_id')
    .select(
      'p.*',
      ...ser.authorColumns,
      userId
        ? db.raw('exists(select 1 from post_likes l where l.post_id = p.id and l.user_id = ?) as liked_by_me', [userId])
        : db.raw('0 as liked_by_me'),
    );
}

async function loadPost(db, id, userId) {
  const row = await postSelect(db, userId).where('p.id', id).first();
  if (!row) throw notFound('Post not found');
  return ser.post(row);
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

module.exports = function postRoutes() {
  const r = express.Router();

  r.get('/posts', optionalAuth, validate(feedQuery, 'query'), async (req, res) => {
    const db = req.app.locals.db;
    const qv = req.valid.query;
    const qb = postSelect(db, req.userId);
    if (qv.type) qb.where('p.type', qv.type);
    if (qv.author) qb.where('p.author_id', qv.author);
    if (qv.scope === 'regional') {
      if (!req.userId) throw badRequest('Sign in to see regional posts');
      const me = await db('users').where({ id: req.userId }).first('country');
      if (!me?.country) return res.json({ items: [], nextCursor: null, hint: 'Set your country in your profile to see regional posts' });
      qb.whereRaw('lower(p.country) = ?', [me.country.toLowerCase()]);
    }
    const rows = await applyCursor(qb, qv, 'p.id');
    res.json(page(rows, qv.limit, ser.post));
  });

  r.post('/posts', requireAuth, validate(createSchema), async (req, res) => {
    const db = req.app.locals.db;
    const d = req.valid.body;
    const me = await db('users').where({ id: req.userId }).first('country', 'city');
    const id = insertedId(
      await db('posts')
        .insert({
          author_id: req.userId,
          type: d.type,
          body: d.body,
          price_cents: d.price?.amountCents ?? null,
          currency: d.price?.currency ?? null,
          country: d.country || me?.country || null,
          city: d.city || me?.city || null,
          created_at: new Date().toISOString(),
        })
        .returning('id'),
    );
    res.status(201).json({ post: await loadPost(db, id, req.userId) });
  });

  r.delete('/posts/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);
    const post = await db('posts').where({ id }).first('author_id');
    if (!post) throw notFound('Post not found');
    if (post.author_id !== req.userId) throw forbidden('You can only delete your own posts');
    await db('posts').where({ id }).del();
    res.status(204).end();
  });

  // Idempotent like/unlike. Counter is updated in the same transaction as the
  // like row, so like_count can never drift from post_likes.
  r.put('/posts/:id/like', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);
    if (!(await db('posts').where({ id }).first('id'))) throw notFound('Post not found');
    try {
      await db.transaction(async (trx) => {
        await trx('post_likes').insert({ post_id: id, user_id: req.userId, created_at: new Date().toISOString() });
        await trx('posts').where({ id }).increment('like_count', 1);
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // already liked → no-op
    }
    res.json({ post: await loadPost(db, id, req.userId) });
  });

  r.delete('/posts/:id/like', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);
    await db.transaction(async (trx) => {
      const removed = await trx('post_likes').where({ post_id: id, user_id: req.userId }).del();
      if (removed) await trx('posts').where({ id }).decrement('like_count', removed);
    });
    res.json({ post: await loadPost(db, id, req.userId) });
  });

  r.get('/posts/:id/comments', validate(pageQuery, 'query'), async (req, res) => {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);
    const qb = db('comments as c').join('users as u', 'u.id', 'c.author_id').where('c.post_id', id).select('c.*', ...ser.authorColumns);
    const rows = await applyCursor(qb, req.valid.query, 'c.id');
    res.json(page(rows, req.valid.query.limit, ser.comment));
  });

  r.post('/posts/:id/comments', requireAuth, validate(commentSchema), async (req, res) => {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);
    if (!(await db('posts').where({ id }).first('id'))) throw notFound('Post not found');
    const commentId = await db.transaction(async (trx) => {
      const cid = insertedId(
        await trx('comments')
          .insert({ post_id: id, author_id: req.userId, body: req.valid.body.body, created_at: new Date().toISOString() })
          .returning('id'),
      );
      await trx('posts').where({ id }).increment('comment_count', 1);
      return cid;
    });
    const row = await db('comments as c').join('users as u', 'u.id', 'c.author_id').where('c.id', commentId).select('c.*', ...ser.authorColumns).first();
    res.status(201).json({ comment: ser.comment(row) });
  });

  return r;
};
