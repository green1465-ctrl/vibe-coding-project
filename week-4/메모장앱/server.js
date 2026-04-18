// ========================================
// 📝 메모장 앱 - Node.js/Express 서버
// ========================================
// - 정적 파일(index.html) 서빙
// - Supabase Postgres(memos 테이블)에 대한 CRUD API 제공
// - 응답은 camelCase (updated_at → updatedAt, created_at → createdAt)
// ========================================

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------
// DB 연결 (Supabase Postgres pooler)
// DATABASE_URL 은 .env 파일에 저장 (git 제외)
// ----------------------------------------
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다. .env 파일을 만들고 npm start 로 실행하세요.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL.trim(),
  ssl: { rejectUnauthorized: false },
});

// DB row → 프론트 포맷(camelCase)
const rowToMemo = (row) => ({
  id: row.id,
  title: row.title,
  content: row.content,
  updatedAt: row.updated_at,
  createdAt: row.created_at,
});

// ----------------------------------------
// Middleware
// ----------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ----------------------------------------
// API Routes
// ----------------------------------------

// GET /api/memos - 전체 메모 목록 (updated_at DESC)
app.get('/api/memos', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, content, updated_at, created_at FROM memos ORDER BY updated_at DESC'
    );
    res.json(rows.map(rowToMemo));
  } catch (err) {
    console.error('GET /api/memos error:', err);
    res.status(500).json({ error: 'Failed to fetch memos' });
  }
});

// POST /api/memos - 새 메모 생성
app.post('/api/memos', async (req, res) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title : '';
    const content = typeof req.body?.content === 'string' ? req.body.content : '';

    const { rows } = await pool.query(
      `INSERT INTO memos (title, content)
       VALUES ($1, $2)
       RETURNING id, title, content, updated_at, created_at`,
      [title, content]
    );
    res.status(201).json(rowToMemo(rows[0]));
  } catch (err) {
    console.error('POST /api/memos error:', err);
    res.status(500).json({ error: 'Failed to create memo' });
  }
});

// PATCH /api/memos/:id - 부분 업데이트
app.patch('/api/memos/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (typeof req.body?.title === 'string') {
    fields.push(`title = $${idx++}`);
    values.push(req.body.title);
  }
  if (typeof req.body?.content === 'string') {
    fields.push(`content = $${idx++}`);
    values.push(req.body.content);
  }

  // 항상 updated_at 갱신
  fields.push(`updated_at = now()`);

  if (fields.length === 1) {
    // title/content 둘 다 없음 → 업데이트할 필드 없음. 현재 행만 반환.
    try {
      const { rows } = await pool.query(
        'SELECT id, title, content, updated_at, created_at FROM memos WHERE id = $1',
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Memo not found' });
      }
      return res.json(rowToMemo(rows[0]));
    } catch (err) {
      console.error('PATCH /api/memos/:id (noop) error:', err);
      return res.status(500).json({ error: 'Failed to update memo' });
    }
  }

  try {
    values.push(id);
    const sql = `UPDATE memos
                 SET ${fields.join(', ')}
                 WHERE id = $${idx}
                 RETURNING id, title, content, updated_at, created_at`;
    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Memo not found' });
    }
    res.json(rowToMemo(rows[0]));
  } catch (err) {
    console.error('PATCH /api/memos/:id error:', err);
    res.status(500).json({ error: 'Failed to update memo' });
  }
});

// DELETE /api/memos/:id - 메모 삭제
app.delete('/api/memos/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    const result = await pool.query('DELETE FROM memos WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Memo not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/memos/:id error:', err);
    res.status(500).json({ error: 'Failed to delete memo' });
  }
});

// ----------------------------------------
// SPA fallback (Express 4 wildcard)
// ----------------------------------------
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ----------------------------------------
// Startup (로컬) / export (서버리스 듀얼 모드)
// ----------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Memo server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
