const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    await client.connect();
    const res = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
        AND table_schema NOT LIKE 'pg_%'
      ORDER BY table_schema, table_name;
    `);
    console.log('Existing tables:');
    res.rows.forEach(r => console.log(`  ${r.table_schema}.${r.table_name}`));
  } catch (e) {
    console.error('ERR:', e.message);
  } finally {
    await client.end();
  }
})();
