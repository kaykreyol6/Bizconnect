'use strict';

const express = require('express');
const { INDUSTRIES } = require('../lib/catalog');

module.exports = function metaRoutes() {
  const r = express.Router();
  r.get('/meta/industries', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.json({ items: INDUSTRIES });
  });
  return r;
};
