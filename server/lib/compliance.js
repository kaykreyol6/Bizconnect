'use strict';

const config = require('../config');

/** Returns the user's current, unexpired agreement for the active version, or undefined. */
function activeAgreement(db, userId) {
  return db('agreements')
    .where({ user_id: userId, version: config.agreementVersion })
    .where('expires_at', '>', new Date().toISOString())
    .orderBy('id', 'desc')
    .first();
}

module.exports = { activeAgreement };
