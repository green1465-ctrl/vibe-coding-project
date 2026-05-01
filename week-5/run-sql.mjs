import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;

const connStr = process.env.DATABASE_URL;
if (!connStr) {
  console.error('DATABASE_URL env var is required');
  process.exit(1);
}

const sql = readFileSync(new URL('./my-projects.sql', import.meta.url), 'utf8');

const client = new Client({ connectionString: connStr });

try {
  await client.connect();
  console.log('Connected. Running SQL…');
  await client.query(sql);
  console.log('SQL executed.');

  const summary = await client.query(`
    SELECT category, COUNT(*) AS cnt, COALESCE(SUM(fee), 0) AS total_fee
    FROM "W5_my_projects"
    GROUP BY category
    ORDER BY total_fee DESC
  `);
  console.log('\n=== Summary by category ===');
  for (const row of summary.rows) {
    console.log(`${row.category.padEnd(15)} | ${String(row.cnt).padStart(3)} | ₩${Number(row.total_fee).toLocaleString()}`);
  }

  const total = await client.query('SELECT COUNT(*) AS n FROM "W5_my_projects"');
  console.log(`\nTotal rows inserted: ${total.rows[0].n}`);
} catch (err) {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
