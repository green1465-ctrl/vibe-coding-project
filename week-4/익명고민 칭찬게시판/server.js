// ========================================
// 익명 게시판 - Node.js/Express 서버
// ========================================
// - 정적 파일(index.html) 서빙
// - Supabase Postgres(Q4_posts 테이블)에 대한 CRUD API 제공
// - 응답은 camelCase (created_at → createdAt)
// ========================================

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------
// DB 연결 (Supabase Postgres pooler)
// ----------------------------------------
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다. .env 파일을 만들고 npm start 로 실행하세요.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL.trim(),
  ssl: { rejectUnauthorized: false },
});

// 카테고리 화이트리스트 (DB CHECK 제약과 일치)
const ALLOWED_CATEGORIES = ['고민', '칭찬', '응원', '고백'];

// DB row → 프론트 포맷(camelCase)
const rowToPost = (row) => ({
  id: row.id,
  category: row.category,
  content: row.content,
  likes: row.likes,
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

// GET /api/posts?sort=latest|likes - 전체 게시글
app.get('/api/posts', async (req, res) => {
  try {
    const sort = req.query.sort === 'likes' ? 'likes' : 'latest';
    const orderBy = sort === 'likes'
      ? 'likes DESC, created_at DESC'
      : 'created_at DESC';

    const { rows } = await pool.query(
      `SELECT id, category, content, likes, created_at
       FROM Q4_posts
       ORDER BY ${orderBy}`
    );
    res.json(rows.map(rowToPost));
  } catch (err) {
    console.error('GET /api/posts error:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// POST /api/posts - 새 글 작성 (익명)
app.post('/api/posts', async (req, res) => {
  try {
    const category = typeof req.body?.category === 'string' ? req.body.category : '';
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';

    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: 'Content too long' });
    }

    const { rows } = await pool.query(
      `INSERT INTO Q4_posts (category, content)
       VALUES ($1, $2)
       RETURNING id, category, content, likes, created_at`,
      [category, content]
    );
    res.status(201).json(rowToPost(rows[0]));
  } catch (err) {
    console.error('POST /api/posts error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// POST /api/posts/:id/like - 공감 +1
// 핵심 동작: UPDATE ... SET likes = likes + 1 (원자적 증가)
app.post('/api/posts/:id/like', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE Q4_posts
       SET likes = likes + 1
       WHERE id = $1
       RETURNING id, category, content, likes, created_at`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(rowToPost(rows[0]));
  } catch (err) {
    console.error('POST /api/posts/:id/like error:', err);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// DELETE /api/posts/:id - 글 삭제
app.delete('/api/posts/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    const result = await pool.query('DELETE FROM Q4_posts WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/posts/:id error:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ----------------------------------------
// SPA fallback
// ----------------------------------------
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ----------------------------------------
// Startup (로컬) / export (서버리스 듀얼 모드)
// ----------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Anonymous board server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
