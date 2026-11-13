'use strict';

const { createDb } = require('./knex');

(async () => {
  const cmd = process.argv[2];
  const db = createDb();
  try {
    if (cmd === 'migrate') {
      const [batch, files] = await db.migrate.latest();
      console.log(`Migration batch ${batch}: ${files.length ? files.join(', ') : 'already up to date'}`);
    } else if (cmd === 'rollback') {
      const [batch, files] = await db.migrate.rollback();
      console.log(`Rolled back batch ${batch}: ${files.join(', ') || 'nothing'}`);
    } else if (cmd === 'seed') {
      await db.migrate.latest();
      await db.seed.run();
      console.log('Seeded demo data');
    } else {
      console.error('Usage: node server/db/cli.js <migrate|rollback|seed>');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
