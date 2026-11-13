'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { notFound, badRequest } = require('../lib/errors');
const { insertedId } = require('../lib/db-errors');
const ser = require('../lib/serialize');
const { pageQuery, applyCursor, page } = require('../lib/pagination');

const sendSchema = z.object({
  recipientId: z.number().int().positive(),
  body: z.string().trim().min(1).max(4000),
});

module.exports = function messageRoutes() {
  const r = express.Router();
  r.use('/messages', requireAuth);

  r.get('/messages/conversations', async (req, res) => {
    const db = req.app.locals.db;
    const me = req.userId;
    // Group in an outer query so the parameterised CASE isn't repeated in GROUP BY
    // (Postgres treats differently-bound expressions as distinct).
    const inner = db('messages')
      .where((w) => w.where('sender_id', me).orWhere('recipient_id', me))
      .select(
        'id',
        db.raw('case when sender_id = ? then recipient_id else sender_id end as other_id', [me]),
        db.raw('case when recipient_id = ? and read_at is null then 1 else 0 end as is_unread', [me]),
      )
      .as('t');
    const convos = await db
      .from(inner)
      .select('other_id', db.raw('max(id) as last_id'), db.raw('sum(is_unread) as unread'))
      .groupBy('other_id')
      .orderBy('last_id', 'desc')
      .limit(50);
    if (!convos.length) return res.json({ items: [] });

    const [users, lastMessages] = await Promise.all([
      db('users').whereIn('id', convos.map((c) => c.other_id)),
      db('messages').whereIn('id', convos.map((c) => c.last_id)),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const msgMap = new Map(lastMessages.map((m) => [m.id, m]));
    res.json({
      items: convos.map((c) => ({
        user: ser.publicUser(userMap.get(Number(c.other_id))),
        lastMessage: ser.message(msgMap.get(Number(c.last_id))),
        unread: Number(c.unread),
      })),
    });
  });

  r.get('/messages/with/:userId', validate(pageQuery, 'query'), async (req, res) => {
    const db = req.app.locals.db;
    const other = Number(req.params.userId);
    if (!Number.isInteger(other)) throw notFound();
    const me = req.userId;
    const qb = db('messages').where((w) =>
      w.where({ sender_id: me, recipient_id: other }).orWhere({ sender_id: other, recipient_id: me }),
    );
    const rows = await applyCursor(qb, req.valid.query);
    await db('messages').where({ sender_id: other, recipient_id: me }).whereNull('read_at').update({ read_at: new Date().toISOString() });
    const user = await db('users').where({ id: other }).first();
    if (!user) throw notFound('User not found');
    res.json({ user: ser.publicUser(user), ...page(rows, req.valid.query.limit, ser.message) });
  });

  r.post('/messages', validate(sendSchema), async (req, res) => {
    const db = req.app.locals.db;
    const { recipientId, body } = req.valid.body;
    if (recipientId === req.userId) throw badRequest('You cannot message yourself');
    if (!(await db('users').where({ id: recipientId }).first('id'))) throw notFound('Recipient not found');
    const id = insertedId(
      await db('messages')
        .insert({ sender_id: req.userId, recipient_id: recipientId, body, created_at: new Date().toISOString() })
        .returning('id'),
    );
    res.status(201).json({ message: ser.message(await db('messages').where({ id }).first()) });
  });

  return r;
};
