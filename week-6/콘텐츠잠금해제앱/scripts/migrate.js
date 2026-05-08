// db/schema.sql 을 그대로 실행하는 단순 러너
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = (process.env.DATABASE_URL || '').trim();
if (!connectionString) {
  console.error('[migrate] DATABASE_URL 이 비어 있습니다. .env 를 확인하세요.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('[migrate] schema.sql 적용 완료');
  } catch (err) {
    console.error('[migrate] 실패:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
