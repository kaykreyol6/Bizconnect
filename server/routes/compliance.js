'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { z } = require('zod');
const config = require('../config');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../lib/errors');
const { insertedId } = require('../lib/db-errors');
const ser = require('../lib/serialize');
const { REGULATIONS, POLICIES, QUIZ, PASS_RATIO } = require('../lib/catalog');
const { activeAgreement } = require('../lib/compliance');

const signSchema = z.object({
  answers: z.array(z.number().int().min(0).max(9)).length(QUIZ.length),
  signedName: z.string().trim().min(2).max(120),
  consent: z.literal(true, { message: 'You must confirm you agree to the regulations' }),
});

function certificateId(now) {
  return `BC-${now.getUTCFullYear()}-INT-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

/** Pseudonymised IP: enough to evidence a signature, without storing raw IPs. */
function hashIp(ip) {
  return crypto.createHmac('sha256', config.jwtSecret).update(String(ip || '')).digest('hex');
}

module.exports = function complianceRoutes() {
  const r = express.Router();

  r.get('/compliance/regulations', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      version: config.agreementVersion,
      passRatio: PASS_RATIO,
      regulations: REGULATIONS,
      policies: POLICIES,
      quiz: QUIZ.map(({ q, options }) => ({ q, options })),
    });
  });

  r.get('/compliance/status', requireAuth, async (req, res) => {
    const a = await activeAgreement(req.app.locals.db, req.userId);
    res.json({ signed: Boolean(a), agreement: a ? ser.agreement(a) : null, version: config.agreementVersion });
  });

  r.get('/compliance/agreements', requireAuth, async (req, res) => {
    const rows = await req.app.locals.db('agreements').where({ user_id: req.userId }).orderBy('id', 'desc').limit(50);
    res.json({ items: rows.map(ser.agreement) });
  });

  r.post('/compliance/sign', requireAuth, validate(signSchema), async (req, res) => {
    const db = req.app.locals.db;
    const { answers, signedName } = req.valid.body;
    const wrong = [];
    QUIZ.forEach((item, i) => {
      if (answers[i] !== item.answer) wrong.push(i);
    });
    const score = Math.round(((QUIZ.length - wrong.length) / QUIZ.length) * 100);
    if (score < PASS_RATIO * 100) {
      throw new HttpError(422, 'QUIZ_FAILED', `You scored ${score}%. A score of ${PASS_RATIO * 100}% is required.`, {
        score,
        incorrect: wrong,
      });
    }

    const me = await db('users').where({ id: req.userId }).first();
    const now = new Date();
    const expires = new Date(now.getTime() + config.agreementValidityDays * 86_400_000);
    const jurisdiction = [me.city, me.region, me.country].filter(Boolean).join(', ') || 'International';
    const id = insertedId(
      await db('agreements')
        .insert({
          user_id: req.userId,
          version: config.agreementVersion,
          certificate_id: certificateId(now),
          signed_name: signedName,
          quiz_score: score,
          jurisdiction: `${jurisdiction} + International`,
          ip_hash: hashIp(req.ip),
          user_agent: String(req.get('user-agent') || '').slice(0, 300),
          signed_at: now.toISOString(),
          expires_at: expires.toISOString(),
        })
        .returning('id'),
    );
    const row = await db('agreements').where({ id }).first();
    res.status(201).json({ agreement: ser.agreement(row) });
  });

  return r;
};
