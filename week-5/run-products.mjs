import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;

const connStr = process.env.DATABASE_URL;
if (!connStr) {
  console.error('DATABASE_URL env var is required');
  process.exit(1);
}

const sql = readFileSync(new URL('./products.sql', import.meta.url), 'utf8');

const client = new Client({ connectionString: connStr });

try {
  await client.connect();
  console.log('Connected. Running products.sql…');
  await client.query(sql);
  console.log('SQL executed.');

  const rows = await client.query(`
    SELECT id, name, price, image_url, description
    FROM "W5_products"
    ORDER BY id
  `);
  console.log('\n=== W5_products ===');
  for (const r of rows.rows) {
    console.log(`#${r.id} | ${r.name.padEnd(20)} | ₩${Number(r.price).toLocaleString().padStart(7)} | ${r.image_url}`);
    console.log(`       ${r.description}`);
  }
  console.log(`\nTotal rows: ${rows.rows.length}`);
} catch (err) {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
