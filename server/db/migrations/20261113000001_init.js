'use strict';

/**
 * Initial schema. Written with the Knex schema builder so it runs on both
 * SQLite (dev/test) and PostgreSQL (production).
 *
 * Scaling notes:
 *  - Every list endpoint paginates by descending integer id (keyset pagination),
 *    so each hot query is backed by an index that ends in `id`.
 *  - like_count / comment_count / application_count are denormalised counters
 *    maintained transactionally so feeds never run COUNT(*) per row.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('email', 254).notNullable().unique();
    t.string('password_hash', 100).notNullable();
    t.string('name', 120).notNullable();
    t.string('account_type', 20).notNullable().defaultTo('individual'); // individual | business
    t.string('business_name', 160);
    t.string('industry', 60);
    t.string('country', 80);
    t.string('region', 80);
    t.string('city', 80);
    t.string('street_address', 200);
    // Privacy by default: street address is only shown when the user opts in.
    t.boolean('address_public').notNullable().defaultTo(false);
    t.string('language', 10).notNullable().defaultTo('en');
    t.string('bio', 500);
    t.boolean('verified').notNullable().defaultTo(false);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['account_type', 'industry', 'id'], 'users_directory_idx');
    t.index(['country', 'id'], 'users_country_idx');
  });

  await knex.schema.createTable('posts', (t) => {
    t.increments('id').primary();
    t.integer('author_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('type', 20).notNullable().defaultTo('update'); // update | bargain
    t.text('body').notNullable();
    t.integer('price_cents');
    t.string('currency', 3);
    t.string('country', 80);
    t.string('city', 80);
    t.integer('like_count').notNullable().defaultTo(0);
    t.integer('comment_count').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['type', 'id'], 'posts_type_idx');
    t.index(['country', 'id'], 'posts_country_idx');
    t.index(['author_id', 'id'], 'posts_author_idx');
  });

  await knex.schema.createTable('post_likes', (t) => {
    t.integer('post_id').unsigned().notNullable().references('id').inTable('posts').onDelete('CASCADE');
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.primary(['post_id', 'user_id']);
    t.index(['user_id', 'post_id'], 'post_likes_user_idx');
  });

  await knex.schema.createTable('comments', (t) => {
    t.increments('id').primary();
    t.integer('post_id').unsigned().notNullable().references('id').inTable('posts').onDelete('CASCADE');
    t.integer('author_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('body', 2000).notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['post_id', 'id'], 'comments_post_idx');
  });

  await knex.schema.createTable('gigs', (t) => {
    t.increments('id').primary();
    t.integer('author_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('title', 160).notNullable();
    t.text('description').notNullable();
    t.string('budget', 80).notNullable();
    t.string('industry', 60);
    t.boolean('remote').notNullable().defaultTo(false);
    t.string('country', 80);
    t.string('city', 80);
    t.integer('max_applications').notNullable().defaultTo(50);
    t.integer('application_count').notNullable().defaultTo(0);
    t.string('status', 20).notNullable().defaultTo('open'); // open | closed
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['status', 'id'], 'gigs_status_idx');
    t.index(['author_id', 'id'], 'gigs_author_idx');
  });

  await knex.schema.createTable('gig_applications', (t) => {
    t.increments('id').primary();
    t.integer('gig_id').unsigned().notNullable().references('id').inTable('gigs').onDelete('CASCADE');
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('message', 2000);
    t.string('status', 20).notNullable().defaultTo('submitted');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['gig_id', 'user_id']);
    t.index(['user_id', 'id'], 'gig_applications_user_idx');
  });

  await knex.schema.createTable('agreements', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('version', 20).notNullable();
    t.string('certificate_id', 40).notNullable().unique();
    t.string('signed_name', 120).notNullable();
    t.integer('quiz_score').notNullable();
    t.string('jurisdiction', 200);
    t.string('ip_hash', 64);
    t.string('user_agent', 300);
    t.timestamp('signed_at').notNullable();
    t.timestamp('expires_at').notNullable();
    t.index(['user_id', 'id'], 'agreements_user_idx');
  });

  await knex.schema.createTable('messages', (t) => {
    t.increments('id').primary();
    t.integer('sender_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('recipient_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('body', 4000).notNullable();
    t.timestamp('read_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['sender_id', 'recipient_id', 'id'], 'messages_pair_idx');
    t.index(['recipient_id', 'id'], 'messages_inbox_idx');
  });
};

exports.down = async function down(knex) {
  for (const table of ['messages', 'agreements', 'gig_applications', 'gigs', 'comments', 'post_likes', 'posts', 'users']) {
    await knex.schema.dropTableIfExists(table);
  }
};
