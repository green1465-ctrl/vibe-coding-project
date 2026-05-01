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
    const sql = fs.readFileSync(path.join(__dirname, 'migrate-auth.sql'), 'utf8');
    await client.query(sql);
    console.log('✓ migration applied');

    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'W5_community_posts'
      ORDER BY ordinal_position;
    `);
    console.log('\nW5_community_posts columns:');
    console.table(cols.rows);

    const users = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'W5_community_users'
      ORDER BY ordinal_position;
    `);
    console.log('W5_community_users columns:');
    console.table(users.rows);
  } catch (e) {
    console.error('ERR:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
