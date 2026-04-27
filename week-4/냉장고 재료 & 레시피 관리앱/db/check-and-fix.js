// DB의 한글 데이터를 직접 검증/복구
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString: (process.env.DATABASE_URL || '').trim(),
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  let { rows } = await c.query('SELECT id, name, category FROM ingredients ORDER BY id');
  console.log('현재 ingredients:');
  for (const r of rows) console.log(` [${r.id}] ${r.name} (${r.category})`);

  const names = rows.map(r => r.name);
  if (!names.includes('토마토')) {
    console.log('\n토마토가 없어서 추가합니다.');
    await c.query(`INSERT INTO ingredients (name, category) VALUES ('토마토','vegetable') ON CONFLICT (name) DO NOTHING`);
  }
  // id 8, 9 같이 깨졌을 가능성 있는 임시 행 정리: 표준 시드 5개에 없는 이름은 제거
  const standard = ['계란', '토마토', '양파', '치즈', '양배추'];
  const del = await c.query(
    `DELETE FROM ingredients WHERE name <> ALL($1::text[]) RETURNING id, name`,
    [standard]
  );
  if (del.rowCount > 0) {
    console.log(`\n비표준 행 ${del.rowCount}개 정리됨`);
    for (const r of del.rows) console.log(` - 삭제 [${r.id}] ${r.name}`);
  }

  ({ rows } = await c.query('SELECT id, name, category FROM ingredients ORDER BY id'));
  console.log('\n최종 ingredients:');
  for (const r of rows) console.log(` [${r.id}] ${r.name} (${r.category})`);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
