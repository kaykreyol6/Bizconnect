'use strict';

/** True for unique/primary-key violations on both SQLite and PostgreSQL. */
function isUniqueViolation(err) {
  return (
    err?.code === '23505' ||
    err?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    err?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
  );
}

/** Knex returns [id] on SQLite and [{ id }] on Postgres when using .returning('id'). */
function insertedId(result) {
  const first = Array.isArray(result) ? result[0] : result;
  return typeof first === 'object' && first !== null ? first.id : first;
}

module.exports = { isUniqueViolation, insertedId };
