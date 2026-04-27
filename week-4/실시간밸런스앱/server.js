// ========================================
// ⚖️ 실시간 밸런스 게임 - Node.js/Express 서버
// - 정적 파일(index.html) 서빙
// - Q5_questions / Q5_votes 테이블 기반 CRUD + 집계 API
// - 응답은 camelCase
// ========================================

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다. .env 파일을 만들고 npm start 로 실행하세요.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.trim(),
  ssl: { rejectUnauthorized: false },
});

// ----------------------------------------
// Middleware
// ----------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ----------------------------------------
// 헬퍼: 질문 + 집계 결과 한방 쿼리
// (LEFT JOIN으로 투표 0건 질문도 포함)
// ----------------------------------------
const QUESTIONS_WITH_TALLY_SQL = `
  SELECT
    q.id,
    q.category,
    q.option_a_text,
    q.option_a_emoji,
    q.option_a_color,
    q.option_b_text,
    q.option_b_emoji,
    q.option_b_color,
    q.display_order,
    COALESCE(SUM(CASE WHEN v.choice = 'A' THEN 1 ELSE 0 END), 0)::int AS votes_a,
    COALESCE(SUM(CASE WHEN v.choice = 'B' THEN 1 ELSE 0 END), 0)::int AS votes_b
  FROM "Q5_questions" q
  LEFT JOIN "Q5_votes" v ON v.question_id = q.id
  GROUP BY q.id
  ORDER BY q.display_order ASC, q.id ASC;
`;

const rowToQuestion = (r) => ({
  id: r.id,
  category: r.category,
  displayOrder: r.display_order,
  a: { text: r.option_a_text, emoji: r.option_a_emoji, color: r.option_a_color },
  b: { text: r.option_b_text, emoji: r.option_b_emoji, color: r.option_b_color },
  votes: { a: r.votes_a, b: r.votes_b },
});

// ----------------------------------------
// API
// ----------------------------------------

// GET /api/questions - 전체 질문 + 실시간 집계
app.get('/api/questions', async (_req, res) => {
  try {
    const { rows } = await pool.query(QUESTIONS_WITH_TALLY_SQL);
    res.json(rows.map(rowToQuestion));
  } catch (err) {
    console.error('GET /api/questions error:', err);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// GET /api/stats - 전체 집계 (총 투표 수, 총 참여자 수)
app.get('/api/stats', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int                      AS total_votes,
        COUNT(DISTINCT voter_id)::int      AS unique_voters
      FROM "Q5_votes";
    `);
    res.json({
      totalVotes: rows[0].total_votes,
      uniqueVoters: rows[0].unique_voters,
    });
  } catch (err) {
    console.error('GET /api/stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/votes/me?voterId=xxx - 내가 투표한 (questionId → 'A'|'B') 매핑
app.get('/api/votes/me', async (req, res) => {
  const voterId = typeof req.query.voterId === 'string' ? req.query.voterId.trim() : '';
  if (!voterId) {
    return res.status(400).json({ error: 'voterId is required' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT question_id, choice
         FROM "Q5_votes"
        WHERE voter_id = $1`,
      [voterId]
    );
    const map = {};
    for (const r of rows) map[r.question_id] = r.choice; // 'A' | 'B'
    res.json(map);
  } catch (err) {
    console.error('GET /api/votes/me error:', err);
    res.status(500).json({ error: 'Failed to fetch user votes' });
  }
});

// POST /api/votes - 투표 등록 또는 변경 (UPSERT)
// body: { questionId, choice ('A'|'B'), voterId }
app.post('/api/votes', async (req, res) => {
  const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId.trim() : '';
  const choiceRaw  = typeof req.body?.choice === 'string' ? req.body.choice.trim().toUpperCase() : '';
  const voterId    = typeof req.body?.voterId === 'string' ? req.body.voterId.trim() : '';

  if (!questionId || !voterId || (choiceRaw !== 'A' && choiceRaw !== 'B')) {
    return res.status(400).json({ error: 'questionId, voterId, choice(A|B) are required' });
  }

  try {
    // UPSERT: 한 voter 가 같은 질문에 다시 투표하면 choice 만 변경
    await pool.query(
      `INSERT INTO "Q5_votes" (question_id, choice, voter_id)
            VALUES ($1, $2, $3)
       ON CONFLICT (question_id, voter_id)
       DO UPDATE SET choice = EXCLUDED.choice, updated_at = now();`,
      [questionId, choiceRaw, voterId]
    );

    // 해당 질문 최신 집계 반환
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN choice='A' THEN 1 ELSE 0 END), 0)::int AS votes_a,
         COALESCE(SUM(CASE WHEN choice='B' THEN 1 ELSE 0 END), 0)::int AS votes_b
       FROM "Q5_votes" WHERE question_id = $1;`,
      [questionId]
    );

    res.json({
      questionId,
      myChoice: choiceRaw,
      votes: { a: rows[0].votes_a, b: rows[0].votes_b },
    });
  } catch (err) {
    if (err.code === '23503') { // foreign_key_violation
      return res.status(404).json({ error: 'Question not found' });
    }
    console.error('POST /api/votes error:', err);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// DELETE /api/votes - 내 투표 취소
// body: { questionId, voterId }
app.delete('/api/votes', async (req, res) => {
  const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId.trim() : '';
  const voterId    = typeof req.body?.voterId === 'string' ? req.body.voterId.trim() : '';

  if (!questionId || !voterId) {
    return res.status(400).json({ error: 'questionId, voterId are required' });
  }

  try {
    await pool.query(
      `DELETE FROM "Q5_votes" WHERE question_id = $1 AND voter_id = $2`,
      [questionId, voterId]
    );

    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN choice='A' THEN 1 ELSE 0 END), 0)::int AS votes_a,
         COALESCE(SUM(CASE WHEN choice='B' THEN 1 ELSE 0 END), 0)::int AS votes_b
       FROM "Q5_votes" WHERE question_id = $1;`,
      [questionId]
    );

    res.json({
      questionId,
      myChoice: null,
      votes: { a: rows[0].votes_a, b: rows[0].votes_b },
    });
  } catch (err) {
    console.error('DELETE /api/votes error:', err);
    res.status(500).json({ error: 'Failed to remove vote' });
  }
});

// ----------------------------------------
// SPA fallback
// ----------------------------------------
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ----------------------------------------
// Startup
// ----------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`⚖️  Balance game server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
