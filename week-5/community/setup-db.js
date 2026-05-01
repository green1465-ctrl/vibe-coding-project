const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    await client.connect();
    console.log('✓ Connected\n');

    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schemaSQL);
    console.log('✓ schema.sql executed (tables created)');

    const seedSQL = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await client.query(seedSQL);
    console.log('✓ seed.sql executed (sample data inserted)\n');

    const posts = await client.query(`
      SELECT id, nickname, category, likes,
             LEFT(content, 30) AS preview,
             to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created
      FROM "W5_community_posts"
      ORDER BY created_at DESC;
    `);
    console.log(`📋 Posts (${posts.rowCount} rows):`);
    console.table(posts.rows);

    const comments = await client.query(`SELECT COUNT(*)::int AS total FROM "W5_community_comments";`);
    console.log(`\n💬 Comments: ${comments.rows[0].total} rows`);
  } catch (e) {
    console.error('ERR:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
