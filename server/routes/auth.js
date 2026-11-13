'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const config = require('../config');
const { validate } = require('../middleware/validate');
const { signToken, setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');
const { unauthorized, conflict, notFound } = require('../lib/errors');
const { isUniqueViolation, insertedId } = require('../lib/db-errors');
const { publicUser } = require('../lib/serialize');
const { INDUSTRY_SLUGS } = require('../lib/catalog');

const registerSchema = z
  .object({
    email: z.email().max(254).transform((s) => s.toLowerCase()),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    name: z.string().trim().min(2).max(120),
    accountType: z.enum(['individual', 'business']).default('individual'),
    businessName: z.string().trim().max(160).optional(),
    industry: z.enum(INDUSTRY_SLUGS).optional(),
    country: z.string().trim().max(80).optional(),
    region: z.string().trim().max(80).optional(),
    city: z.string().trim().max(80).optional(),
  })
  .refine((d) => d.accountType !== 'business' || (d.businessName && d.businessName.length >= 2), {
    message: 'Business accounts need a business name',
    path: ['businessName'],
  });

const loginSchema = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
});

// Constant-time-ish login: compare against a dummy hash when the user doesn't exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 4);

module.exports = function authRoutes({ authLimiter }) {
  const r = express.Router();

  r.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
    const db = req.app.locals.db;
    const d = req.valid.body;
    const hash = await bcrypt.hash(d.password, config.bcryptRounds);
    let id;
    try {
      id = insertedId(
        await db('users')
          .insert({
            email: d.email,
            password_hash: hash,
            name: d.name,
            account_type: d.accountType,
            business_name: d.accountType === 'business' ? d.businessName : null,
            industry: d.industry || null,
            country: d.country || null,
            region: d.region || null,
            city: d.city || null,
            created_at: new Date().toISOString(),
          })
          .returning('id'),
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('An account with this email already exists');
      throw err;
    }
    const user = await db('users').where({ id }).first();
    const token = signToken(user);
    setSessionCookie(res, token);
    res.status(201).json({ user: publicUser(user, { self: true }), token });
  });

  r.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
    const db = req.app.locals.db;
    const { email, password } = req.valid.body;
    const user = await db('users').where({ email }).first();
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw unauthorized('Invalid email or password');
    const token = signToken(user);
    setSessionCookie(res, token);
    res.json({ user: publicUser(user, { self: true }), token });
  });

  r.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
  });

  r.get('/me', requireAuth, async (req, res) => {
    const user = await req.app.locals.db('users').where({ id: req.userId }).first();
    if (!user) throw notFound('User no longer exists');
    res.json({ user: publicUser(user, { self: true }) });
  });

  return r;
};
