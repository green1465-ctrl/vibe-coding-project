// ========================================
// SalaryCheck - 익명 연봉/지출 비교 서버
// - 정적 파일(index.html) 서빙
// - Supabase Postgres (Q6_salary_submissions) 에 익명 데이터 저장
// - 통계 조회 (AVG, COUNT, GROUP BY) 제공
// ========================================

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------
// DB 연결
// ----------------------------------------
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다. .env 파일을 만들고 npm start 로 실행하세요.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL.trim(),
  ssl: { rejectUnauthorized: false },
});

// ----------------------------------------
// 상수: 허용된 직군/연차/카테고리
// (잘못된 값 들어오는 것 방지)
// ----------------------------------------
const ALLOWED_JOBS = ['developer', 'designer', 'pm', 'marketer', 'sales', 'hr', 'finance', 'data', 'etc'];
const ALLOWED_LEVELS = ['junior0', 'junior', 'middle', 'senior', 'lead'];
const EXPENSE_KEYS = ['food', 'housing', 'transport', 'subscription', 'shopping', 'culture', 'savings', 'etc'];

// 0~99999 사이 정수로 강제 (음수, NaN, 너무 큰 값 차단)
function toInt(v, max = 99999) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

// DB row → 프론트 포맷 (camelCase + expenses 객체)
function rowToSubmission(row) {
  return {
    id: row.id,
    job: row.job,
    level: row.level,
    salary: row.salary,
    expenses: {
      food: row.expense_food,
      housing: row.expense_housing,
      transport: row.expense_transport,
      subscription: row.expense_subscription,
      shopping: row.expense_shopping,
      culture: row.expense_culture,
      savings: row.expense_savings,
      etc: row.expense_etc,
    },
    totalExpense: row.total_expense,
    createdAt: row.created_at,
  };
}

// ----------------------------------------
// Middleware
// ----------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ----------------------------------------
// API: POST /api/q6/submissions
// 익명 제출 1건 저장
// ----------------------------------------
app.post('/api/q6/submissions', async (req, res) => {
  try {
    const body = req.body || {};
    const job = String(body.job || '');
    const level = String(body.level || '');
    if (!ALLOWED_JOBS.includes(job)) return res.status(400).json({ error: 'invalid job' });
    if (!ALLOWED_LEVELS.includes(level)) return res.status(400).json({ error: 'invalid level' });

    const salary = toInt(body.salary);
    if (salary <= 0) return res.status(400).json({ error: 'invalid salary' });

    const ex = body.expenses || {};
    const expenses = EXPENSE_KEYS.reduce((acc, k) => ({ ...acc, [k]: toInt(ex[k]) }), {});
    const totalExpense = EXPENSE_KEYS.reduce((s, k) => s + expenses[k], 0);

    const { rows } = await pool.query(
      `INSERT INTO "Q6_salary_submissions"
        (job, level, salary,
         expense_food, expense_housing, expense_transport, expense_subscription,
         expense_shopping, expense_culture, expense_savings, expense_etc,
         total_expense)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        job, level, salary,
        expenses.food, expenses.housing, expenses.transport, expenses.subscription,
        expenses.shopping, expenses.culture, expenses.savings, expenses.etc,
        totalExpense,
      ]
    );
    res.status(201).json(rowToSubmission(rows[0]));
  } catch (err) {
    console.error('POST /api/q6/submissions error:', err);
    res.status(500).json({ error: 'failed to save submission' });
  }
});

// ----------------------------------------
// API: GET /api/q6/stats?job=X&level=Y
// 특정 (직군, 연차) 그룹의 통계
// - n              : 표본 수
// - avgSalary      : 평균 월급
// - stdSalary      : 표준편차
// - minSalary, maxSalary
// - avgExpenses    : 카테고리별 평균 지출
// - avgTotalExpense: 평균 총지출
//
// 추가 쿼리 파라미터:
// - userSalary=N  → 입력 시, 해당 유저의 상위 % 동시 계산
// ----------------------------------------
app.get('/api/q6/stats', async (req, res) => {
  try {
    const job = String(req.query.job || '');
    const level = String(req.query.level || '');
    if (!ALLOWED_JOBS.includes(job)) return res.status(400).json({ error: 'invalid job' });
    if (!ALLOWED_LEVELS.includes(level)) return res.status(400).json({ error: 'invalid level' });

    // 메인 집계 (AVG / STDDEV / MIN / MAX / COUNT)
    const aggSql = `
      SELECT
        COUNT(*)::int                                  AS n,
        COALESCE(AVG(salary), 0)::float                AS avg_salary,
        COALESCE(STDDEV_SAMP(salary), 0)::float        AS std_salary,
        COALESCE(MIN(salary), 0)::int                  AS min_salary,
        COALESCE(MAX(salary), 0)::int                  AS max_salary,
        COALESCE(AVG(expense_food), 0)::float          AS avg_food,
        COALESCE(AVG(expense_housing), 0)::float       AS avg_housing,
        COALESCE(AVG(expense_transport), 0)::float     AS avg_transport,
        COALESCE(AVG(expense_subscription), 0)::float  AS avg_subscription,
        COALESCE(AVG(expense_shopping), 0)::float      AS avg_shopping,
        COALESCE(AVG(expense_culture), 0)::float       AS avg_culture,
        COALESCE(AVG(expense_savings), 0)::float       AS avg_savings,
        COALESCE(AVG(expense_etc), 0)::float           AS avg_etc,
        COALESCE(AVG(total_expense), 0)::float         AS avg_total_expense
      FROM "Q6_salary_submissions"
      WHERE job = $1 AND level = $2
    `;
    const { rows } = await pool.query(aggSql, [job, level]);
    const r = rows[0];

    // userSalary 가 있으면 → 그룹 내 상위 % 계산 (DB 기반)
    let topPercent = null;
    const userSalary = req.query.userSalary != null ? Number(req.query.userSalary) : null;
    if (Number.isFinite(userSalary) && userSalary > 0 && r.n > 0) {
      const pctSql = `
        SELECT
          (COUNT(*) FILTER (WHERE salary > $3))::float
            / NULLIF(COUNT(*), 0) * 100.0 AS top_percent
        FROM "Q6_salary_submissions"
        WHERE job = $1 AND level = $2
      `;
      const { rows: pctRows } = await pool.query(pctSql, [job, level, userSalary]);
      topPercent = pctRows[0].top_percent;
    }

    res.json({
      job, level,
      n: r.n,
      avgSalary: r.avg_salary,
      stdSalary: r.std_salary,
      minSalary: r.min_salary,
      maxSalary: r.max_salary,
      avgExpenses: {
        food: r.avg_food,
        housing: r.avg_housing,
        transport: r.avg_transport,
        subscription: r.avg_subscription,
        shopping: r.avg_shopping,
        culture: r.avg_culture,
        savings: r.avg_savings,
        etc: r.avg_etc,
      },
      avgTotalExpense: r.avg_total_expense,
      topPercent, // null = userSalary 미지정 또는 표본 0
    });
  } catch (err) {
    console.error('GET /api/q6/stats error:', err);
    res.status(500).json({ error: 'failed to fetch stats' });
  }
});

// ----------------------------------------
// API: GET /api/q6/distribution?job=X&level=Y
// 그룹의 모든 월급 값을 반환 (히스토그램/분포 차트용)
// ----------------------------------------
app.get('/api/q6/distribution', async (req, res) => {
  try {
    const job = String(req.query.job || '');
    const level = String(req.query.level || '');
    if (!ALLOWED_JOBS.includes(job)) return res.status(400).json({ error: 'invalid job' });
    if (!ALLOWED_LEVELS.includes(level)) return res.status(400).json({ error: 'invalid level' });

    const { rows } = await pool.query(
      `SELECT salary FROM "Q6_salary_submissions"
       WHERE job = $1 AND level = $2
       ORDER BY salary ASC`,
      [job, level]
    );
    res.json({ job, level, salaries: rows.map(r => r.salary) });
  } catch (err) {
    console.error('GET /api/q6/distribution error:', err);
    res.status(500).json({ error: 'failed to fetch distribution' });
  }
});

// ----------------------------------------
// API: GET /api/q6/group-by
// 직군 × 연차 조합별 평균 월급 / 표본 수 (전체 개요)
// ----------------------------------------
app.get('/api/q6/group-by', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        job,
        level,
        COUNT(*)::int                            AS n,
        AVG(salary)::float                       AS avg_salary,
        AVG(total_expense)::float                AS avg_total_expense,
        AVG(salary - total_expense)::float       AS avg_remaining
      FROM "Q6_salary_submissions"
      GROUP BY job, level
      ORDER BY job, level
    `);
    res.json({ groups: rows });
  } catch (err) {
    console.error('GET /api/q6/group-by error:', err);
    res.status(500).json({ error: 'failed to fetch group-by' });
  }
});

// ----------------------------------------
// API: GET /api/q6/count
// 전체 누적 제출 수 (헤더 표시용)
// ----------------------------------------
app.get('/api/q6/count', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS total FROM "Q6_salary_submissions"'
    );
    res.json({ total: rows[0].total });
  } catch (err) {
    console.error('GET /api/q6/count error:', err);
    res.status(500).json({ error: 'failed to fetch count' });
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
    console.log(`SalaryCheck server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
