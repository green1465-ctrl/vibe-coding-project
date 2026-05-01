// 나만의 AI 대시보드 - Express + Supabase Postgres
// 로그인 보호 대시보드에 Notion 프로젝트(스냅샷) + 가계부(라이브 DB)를 연결.

require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3100;

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[pg] unexpected pool error:', err);
});

const TABLE = '"W5_budget_transactions"';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ----------------------------------------------------------------------------
// /api/login  — 자격증명을 서버 환경변수와 대조 (클라이언트 소스에 노출 안 됨)
// ----------------------------------------------------------------------------
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const expectedEmail = (process.env.AUTH_EMAIL || '').trim().toLowerCase();
  const expectedPassword = (process.env.AUTH_PASSWORD || '').trim();

  if (!expectedEmail || !expectedPassword) {
    return res.status(500).json({ ok: false, error: '서버 인증이 설정되지 않았습니다.' });
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ ok: false, error: '이메일과 비밀번호를 입력해 주세요.' });
  }
  if (email.trim().toLowerCase() === expectedEmail && password === expectedPassword) {
    return res.json({ ok: true, email: expectedEmail });
  }
  return res.status(401).json({ ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
});

// ----------------------------------------------------------------------------
// /api/budget/summary?year=YYYY&month=M  (default: 현재 연/월)
// 이번 달 수입·지출·잔액 + 카테고리별 합계
// ----------------------------------------------------------------------------
app.get('/api/budget/summary', async (req, res) => {
  try {
    const now = new Date();
    const y = Number(req.query.year) || now.getFullYear();
    const m = Number(req.query.month) || now.getMonth() + 1;

    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const totalsQ = pool.query(
      `SELECT type, COALESCE(SUM(amount), 0)::bigint AS total
       FROM ${TABLE}
       WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2
       GROUP BY type`,
      [y, m]
    );
    const byCatQ = pool.query(
      `SELECT category, type, COALESCE(SUM(amount), 0)::bigint AS total
       FROM ${TABLE}
       WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2
       GROUP BY category, type
       ORDER BY total DESC`,
      [y, m]
    );

    const [totalsRes, byCatRes] = await Promise.all([totalsQ, byCatQ]);

    let income = 0;
    let expense = 0;
    for (const row of totalsRes.rows) {
      if (row.type === '수입') income = Number(row.total);
      else if (row.type === '지출') expense = Number(row.total);
    }
    const byCategory = byCatRes.rows.map((r) => ({
      category: r.category,
      type: r.type,
      total: Number(r.total),
    }));

    res.json({ year: y, month: m, income, expense, balance: income - expense, byCategory });
  } catch (err) {
    console.error('[GET /api/budget/summary]', err);
    res.status(500).json({ error: 'Failed to compute summary' });
  }
});

// ----------------------------------------------------------------------------
// /api/budget/recent?limit=5
// 가장 최근 거래 내역
// ----------------------------------------------------------------------------
app.get('/api/budget/recent', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 50);
    const result = await pool.query(
      `SELECT id, type, category, amount, memo, date
       FROM ${TABLE}
       ORDER BY date DESC, id DESC
       LIMIT $1`,
      [limit]
    );
    const rows = result.rows.map((row) => {
      let dateStr;
      if (row.date instanceof Date) {
        const y = row.date.getFullYear();
        const mm = String(row.date.getMonth() + 1).padStart(2, '0');
        const dd = String(row.date.getDate()).padStart(2, '0');
        dateStr = `${y}-${mm}-${dd}`;
      } else {
        dateStr = String(row.date).slice(0, 10);
      }
      return {
        id: Number(row.id),
        type: row.type,
        category: row.category,
        amount: Number(row.amount),
        memo: row.memo,
        date: dateStr,
      };
    });
    res.json({ transactions: rows });
  } catch (err) {
    console.error('[GET /api/budget/recent]', err);
    res.status(500).json({ error: 'Failed to fetch recent transactions' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🟣 AI Dashboard running at http://localhost:${PORT}`);
  });
}

module.exports = app;
