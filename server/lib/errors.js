'use strict';

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, 'BAD_REQUEST', msg, details);
const unauthorized = (msg = 'Authentication required') => new HttpError(401, 'UNAUTHORIZED', msg);
const forbidden = (msg = 'Forbidden', code = 'FORBIDDEN') => new HttpError(403, code, msg);
const notFound = (msg = 'Not found') => new HttpError(404, 'NOT_FOUND', msg);
const conflict = (msg) => new HttpError(409, 'CONFLICT', msg);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
