const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, 'migrate-title.sql'), 'utf8');
    await client.query(sql);
    console.log('✓ title migration applied');

    const sample = await client.query(`
      SELECT id, title, LEFT(content, 30) AS content_preview, nickname
      FROM "W5_community_posts"
      ORDER BY id;
    `);
    console.table(sample.rows);
  } catch (e) {
    console.error('ERR:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
