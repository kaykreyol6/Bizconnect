'use strict';

const { z } = require('zod');

/**
 * Keyset (cursor) pagination on a monotonically increasing integer id.
 * Unlike OFFSET, cost stays O(limit) regardless of how deep the user scrolls,
 * and results don't shift when new rows are inserted.
 */
const pageQuery = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function applyCursor(qb, { cursor, limit }, column = 'id') {
  if (cursor) qb.where(column, '<', cursor);
  return qb.orderBy(column, 'desc').limit(limit + 1);
}

function page(rows, limit, map = (r) => r) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: items.map(map),
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}

module.exports = { pageQuery, applyCursor, page };
