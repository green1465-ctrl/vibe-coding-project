// ============================================================
// DB 초기화 스크립트
// schema.sql 을 읽어 Supabase Postgres 에 실행
// 사용법: npm run init-db
// ============================================================

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다. .env 파일을 확인하세요.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.trim(),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const sqlPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  console.log('[init-db] schema.sql 실행 중...');
  await pool.query(sql);
  console.log('[init-db] 완료. Q6_salary_submissions 테이블 + 인덱스 준비됨.');

  // 검증: 테이블이 실제로 존재하고 컬럼 정상인지 확인
  const { rows } = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'Q6_salary_submissions'
    ORDER BY ordinal_position
  `);
  console.log('[init-db] 컬럼 목록:');
  rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));

  await pool.end();
}

main().catch(err => {
  console.error('[init-db] 실패:', err);
  process.exit(1);
});
