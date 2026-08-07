// 1회성 스크립트: content.json → Supabase(hanastory_content 테이블) 이관
// 실행: DATABASE_URL을 .env에 넣고 `node scripts/migrate-content.mjs`
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { Client } from 'pg';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_PATH = path.join(__dirname, '..', 'content.json');

const client = new Client({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const content = JSON.parse(readFileSync(CONTENT_PATH, 'utf8'));

  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS hanastory_content (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await client.query(
    `INSERT INTO hanastory_content (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
    [content]
  );

  const { rows } = await client.query('SELECT data, updated_at FROM hanastory_content WHERE id = 1');
  console.log('이관 완료. 저장된 섹션:', Object.keys(rows[0].data));
  console.log('updated_at:', rows[0].updated_at);

  await client.end();
}

main().catch((e) => {
  console.error('이관 실패:', e.message);
  process.exit(1);
});
