'use strict';

const { badRequest } = require('../lib/errors');

/** Parse req[source] with a zod schema; stores the result on req.valid[source]. */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(badRequest('Validation failed', details));
    }
    req.valid = req.valid || {};
    req.valid[source] = result.data;
    next();
  };
}

module.exports = { validate };
