'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { notFound, forbidden, conflict } = require('../lib/errors');
const { isUniqueViolation, insertedId } = require('../lib/db-errors');
const ser = require('../lib/serialize');
const { pageQuery, applyCursor, page } = require('../lib/pagination');
const { INDUSTRY_SLUGS } = require('../lib/catalog');
const { activeAgreement } = require('../lib/compliance');

const listQuery = pageQuery.extend({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  industry: z.enum(INDUSTRY_SLUGS).optional(),
  remote: z.enum(['true', 'false']).optional(),
  author: z.coerce.number().int().positive().optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5000),
  budget: z.string().trim().min(1).max(80),
  industry: z.enum(INDUSTRY_SLUGS).optional(),
  remote: z.boolean().default(false),
  country: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  maxApplications: z.number().int().min(1).max(1000).default(50),
});

const applySchema = z.object({ message: z.string().trim().max(2000).optional() });
const statusSchema = z.object({ status: z.enum(['open', 'closed']) }).strict();

function gigSelect(db, userId) {
  return db('gigs as g')
    .join('users as u', 'u.id', 'g.author_id')
    .select(
      'g.*',
      ...ser.authorColumns,
      userId
        ? db.raw('exists(select 1 from gig_applications a where a.gig_id = g.id and a.user_id = ?) as applied_by_me', [userId])
        : db.raw('0 as applied_by_me'),
    );
}

async function loadGig(db, id, userId) {
  const row = await gigSelect(db, userId).where('g.id', id).first();
  if (!row) throw notFound('Gig not found');
  return ser.gig(row);
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

module.exports = function gigRoutes() {
  const r = express.Router();

  r.get('/gigs', optionalAuth, validate(listQuery, 'query'), async (req, res) => {
    const db = req.app.locals.db;
    const qv = req.valid.query;
    const qb = gigSelect(db, req.userId);
    if (qv.status !== 'all') qb.where('g.status', qv.status);
    if (qv.industry) qb.where('g.industry', qv.industry);
    if (qv.remote) qb.where('g.remote', qv.remote === 'true');
    if (qv.author) qb.where('g.author_id', qv.author);
    const rows = await applyCursor(qb, qv, 'g.id');
    res.json(page(rows, qv.limit, ser.gig));
  });

  r.get('/gigs/:id', optionalAuth, async (req, res) => {
    res.json({ gig: await loadGig(req.app.locals.db, parseId(req.params.id), req.userId) });
  });

  r.post('/gigs', requireAuth, validate(createSchema), async (req, res) => {
    const db = req.app.locals.db;
    const d = req.valid.body;
    const me = await db('users').where({ id: req.userId }).first('country', 'city', 'industry');
    const id = insertedId(
      await db('gigs')
        .insert({
          author_id: req.userId,
          title: d.title,
          description: d.description,
          budget: d.budget,
          industry: d.industry || me?.industry || null,
          remote: d.remote,
          country: d.country || (d.remote ? null : me?.country) || null,
          city: d.city || (d.remote ? null : me?.city) || null,
          max_applications: d.maxApplications,
          created_at: new Date().toISOString(),
        })
        .returning('id'),
    );
    res.status(201).json({ gig: await loadGig(db, id, req.userId) });
  });

  r.patch('/gigs/:id', requireAuth, validate(statusSchema), async (req, res) => {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);
    const gig = await db('gigs').where({ id }).first('author_id');
    if (!gig) throw notFound('Gig not found');
    if (gig.author_id !== req.userId) throw forbidden('Only the gig owner can change its status');
    await db('gigs').where({ id }).update({ status: req.valid.body.status });
    res.json({ gig: await loadGig(db, id, req.userId) });
  });

  // Applying to a gig is a contractual step, so it requires a signed agreement.
  // The capacity check is a single conditional UPDATE, so concurrent applicants
  // can never push application_count past max_applications.
  r.post('/gigs/:id/apply', requireAuth, validate(applySchema), async (req, res) => {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);
    const gig = await db('gigs').where({ id }).first('author_id', 'status');
    if (!gig) throw notFound('Gig not found');
    if (gig.author_id === req.userId) throw forbidden('You cannot apply to your own gig');
    if (!(await activeAgreement(db, req.userId))) {
      throw forbidden('Sign the international regulations agreement before applying', 'COMPLIANCE_REQUIRED');
    }
    try {
      await db.transaction(async (trx) => {
        const updated = await trx('gigs')
          .where({ id, status: 'open' })
          .whereRaw('application_count < max_applications')
          .increment('application_count', 1);
        if (!updated) throw conflict('This gig is no longer accepting applications');
        await trx('gig_applications').insert({
          gig_id: id,
          user_id: req.userId,
          message: req.valid.body.message || null,
          created_at: new Date().toISOString(),
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('You have already applied to this gig');
      throw err;
    }
    res.status(201).json({ gig: await loadGig(db, id, req.userId) });
  });

  r.get('/me/applications', requireAuth, validate(pageQuery, 'query'), async (req, res) => {
    const db = req.app.locals.db;
    const qb = db('gig_applications as a')
      .join('gigs as g', 'g.id', 'a.gig_id')
      .join('users as u', 'u.id', 'g.author_id')
      .where('a.user_id', req.userId)
      .select('a.id', 'a.status as application_status', 'a.message', 'a.created_at as applied_at', 'g.id as gig_id', 'g.title', 'g.budget', 'g.status', 'u.name as a_name', 'u.business_name as a_business_name');
    const rows = await applyCursor(qb, req.valid.query, 'a.id');
    res.json(
      page(rows, req.valid.query.limit, (r2) => ({
        id: r2.id,
        status: r2.application_status,
        message: r2.message,
        appliedAt: ser.iso(r2.applied_at),
        gig: { id: r2.gig_id, title: r2.title, budget: r2.budget, status: r2.status, owner: r2.a_business_name || r2.a_name },
      })),
    );
  });

  r.get('/gigs/:id/applications', requireAuth, validate(pageQuery, 'query'), async (req, res) => {
    const db = req.app.locals.db;
    const id = parseId(req.params.id);
    const gig = await db('gigs').where({ id }).first('author_id');
    if (!gig) throw notFound('Gig not found');
    if (gig.author_id !== req.userId) throw forbidden('Only the gig owner can view applications');
    const qb = db('gig_applications as a').join('users as u', 'u.id', 'a.user_id').where('a.gig_id', id).select('a.*', 'u.name', 'u.country', 'u.city');
    const rows = await applyCursor(qb, req.valid.query, 'a.id');
    res.json(
      page(rows, req.valid.query.limit, (r2) => ({
        id: r2.id,
        message: r2.message,
        status: r2.status,
        createdAt: ser.iso(r2.created_at),
        applicant: { id: r2.user_id, name: r2.name, initials: ser.initials(r2.name), country: r2.country, city: r2.city },
      })),
    );
  });

  return r;
};
