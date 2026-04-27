// Supabase Postgres에 schema.sql + seed.sql 적용 + 결과 검증
// 실행: node db/setup.js (앱 폴더에서)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const databaseUrl = (process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  console.error('❌ DATABASE_URL이 .env에 설정되어 있지 않습니다.');
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔌 Supabase 연결 시도...');
    await client.connect();
    console.log('✅ 연결 성공\n');

    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    const seedSql   = fs.readFileSync(path.join(__dirname, 'seed.sql'),   'utf-8');

    console.log('📦 schema.sql 적용 중...');
    await client.query(schemaSql);
    console.log('   → 테이블 생성 완료\n');

    console.log('🌱 seed.sql 적용 중...');
    await client.query(seedSql);
    console.log('   → 시드 데이터 삽입 완료\n');

    const ing = await client.query(
      'SELECT id, name, category, created_at FROM ingredients ORDER BY id'
    );
    const rec = await client.query(
      'SELECT id, title, ingredients, steps, created_at FROM recipes ORDER BY id'
    );

    console.log(`📋 ingredients: ${ing.rowCount}개`);
    for (const row of ing.rows) {
      console.log(`   - [${row.id}] ${row.name} (${row.category})`);
    }
    console.log(`\n📖 recipes: ${rec.rowCount}개`);
    for (const row of rec.rows) {
      console.log(`   - [${row.id}] ${row.title} (재료 ${row.ingredients.length}개, 단계 ${row.steps.length}개)`);
    }

    console.log('\n🎉 완료. 서버를 다시 시작하세요: npm start');
  } catch (err) {
    console.error('❌ 실패:', err.message);
    if (err.code) console.error('   코드:', err.code);
    if (err.detail) console.error('   상세:', err.detail);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
