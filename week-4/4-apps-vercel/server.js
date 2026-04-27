// ============================================================
// 4-Apps-Vercel 통합 서버
// 4개 앱을 하나의 Express app 에 prefix 분리해서 mount
// - /api/board/*    → 익명고민·칭찬 게시판  (Q4_posts)
// - /api/salary/*   → 익명 연봉/지출 비교    (Q6_salary_submissions)
// - /api/fridge/*   → 냉장고·레시피          (ingredients, recipes)
// - /api/balance/*  → 실시간 밸런스 게임     (Q5_questions, Q5_votes)
// 정적 파일은 public/ 에서 서빙 → /board, /salary, /fridge, /balance
// ============================================================

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다.');
  if (require.main === module) process.exit(1);
}

// 단일 pool 을 4개 router 가 공유 (Vercel Serverless 에서 cold start 최적화)
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});
pool.on('error', (err) => console.error('[pg pool] unexpected error:', err));

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL   = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

// ----------------------------------------
// Middleware
// ----------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// /api/board  -- 익명고민·칭찬 게시판
// ============================================================
const boardRouter = express.Router();
const ALLOWED_BOARD_CATEGORIES = ['고민', '칭찬', '응원', '고백'];
const rowToPost = (r) => ({
  id: r.id,
  category: r.category,
  content: r.content,
  likes: r.likes,
  createdAt: r.created_at,
});

boardRouter.get('/posts', async (req, res) => {
  try {
    const sort = req.query.sort === 'likes' ? 'likes' : 'latest';
    const orderBy = sort === 'likes' ? 'likes DESC, created_at DESC' : 'created_at DESC';
    const { rows } = await pool.query(
      `SELECT id, category, content, likes, created_at FROM Q4_posts ORDER BY ${orderBy}`
    );
    res.json(rows.map(rowToPost));
  } catch (err) {
    console.error('GET /api/board/posts error:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

boardRouter.post('/posts', async (req, res) => {
  try {
    const category = typeof req.body?.category === 'string' ? req.body.category : '';
    const content  = typeof req.body?.content  === 'string' ? req.body.content.trim() : '';
    if (!ALLOWED_BOARD_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
    if (!content) return res.status(400).json({ error: 'Content is required' });
    if (content.length > 2000) return res.status(400).json({ error: 'Content too long' });

    const { rows } = await pool.query(
      `INSERT INTO Q4_posts (category, content) VALUES ($1, $2)
       RETURNING id, category, content, likes, created_at`,
      [category, content]
    );
    res.status(201).json(rowToPost(rows[0]));
  } catch (err) {
    console.error('POST /api/board/posts error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

boardRouter.post('/posts/:id/like', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const { rows } = await pool.query(
      `UPDATE Q4_posts SET likes = likes + 1 WHERE id = $1
       RETURNING id, category, content, likes, created_at`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    res.json(rowToPost(rows[0]));
  } catch (err) {
    console.error('POST /api/board/posts/:id/like error:', err);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

boardRouter.delete('/posts/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const result = await pool.query('DELETE FROM Q4_posts WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Post not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/board/posts/:id error:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

app.use('/api/board', boardRouter);

// ============================================================
// /api/salary  -- 익명 연봉/지출 비교
// ============================================================
const salaryRouter = express.Router();
const ALLOWED_JOBS   = ['developer', 'designer', 'pm', 'marketer', 'sales', 'hr', 'finance', 'data', 'etc'];
const ALLOWED_LEVELS = ['junior0', 'junior', 'middle', 'senior', 'lead'];
const EXPENSE_KEYS   = ['food', 'housing', 'transport', 'subscription', 'shopping', 'culture', 'savings', 'etc'];

const toInt = (v, max = 99999) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
};
const rowToSubmission = (r) => ({
  id: r.id, job: r.job, level: r.level, salary: r.salary,
  expenses: {
    food: r.expense_food, housing: r.expense_housing, transport: r.expense_transport,
    subscription: r.expense_subscription, shopping: r.expense_shopping,
    culture: r.expense_culture, savings: r.expense_savings, etc: r.expense_etc,
  },
  totalExpense: r.total_expense, createdAt: r.created_at,
});

salaryRouter.post('/submissions', async (req, res) => {
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
         expense_shopping, expense_culture, expense_savings, expense_etc, total_expense)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        job, level, salary,
        expenses.food, expenses.housing, expenses.transport, expenses.subscription,
        expenses.shopping, expenses.culture, expenses.savings, expenses.etc, totalExpense,
      ]
    );
    res.status(201).json(rowToSubmission(rows[0]));
  } catch (err) {
    console.error('POST /api/salary/submissions error:', err);
    res.status(500).json({ error: 'failed to save submission' });
  }
});

salaryRouter.get('/stats', async (req, res) => {
  try {
    const job = String(req.query.job || '');
    const level = String(req.query.level || '');
    if (!ALLOWED_JOBS.includes(job)) return res.status(400).json({ error: 'invalid job' });
    if (!ALLOWED_LEVELS.includes(level)) return res.status(400).json({ error: 'invalid level' });

    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS n,
        COALESCE(AVG(salary), 0)::float AS avg_salary,
        COALESCE(STDDEV_SAMP(salary), 0)::float AS std_salary,
        COALESCE(MIN(salary), 0)::int AS min_salary,
        COALESCE(MAX(salary), 0)::int AS max_salary,
        COALESCE(AVG(expense_food), 0)::float AS avg_food,
        COALESCE(AVG(expense_housing), 0)::float AS avg_housing,
        COALESCE(AVG(expense_transport), 0)::float AS avg_transport,
        COALESCE(AVG(expense_subscription), 0)::float AS avg_subscription,
        COALESCE(AVG(expense_shopping), 0)::float AS avg_shopping,
        COALESCE(AVG(expense_culture), 0)::float AS avg_culture,
        COALESCE(AVG(expense_savings), 0)::float AS avg_savings,
        COALESCE(AVG(expense_etc), 0)::float AS avg_etc,
        COALESCE(AVG(total_expense), 0)::float AS avg_total_expense
      FROM "Q6_salary_submissions" WHERE job = $1 AND level = $2`,
      [job, level]
    );
    const r = rows[0];

    let topPercent = null;
    const userSalary = req.query.userSalary != null ? Number(req.query.userSalary) : null;
    if (Number.isFinite(userSalary) && userSalary > 0 && r.n > 0) {
      const { rows: pctRows } = await pool.query(
        `SELECT (COUNT(*) FILTER (WHERE salary > $3))::float
                  / NULLIF(COUNT(*), 0) * 100.0 AS top_percent
         FROM "Q6_salary_submissions" WHERE job = $1 AND level = $2`,
        [job, level, userSalary]
      );
      topPercent = pctRows[0].top_percent;
    }

    res.json({
      job, level, n: r.n,
      avgSalary: r.avg_salary, stdSalary: r.std_salary,
      minSalary: r.min_salary, maxSalary: r.max_salary,
      avgExpenses: {
        food: r.avg_food, housing: r.avg_housing, transport: r.avg_transport,
        subscription: r.avg_subscription, shopping: r.avg_shopping,
        culture: r.avg_culture, savings: r.avg_savings, etc: r.avg_etc,
      },
      avgTotalExpense: r.avg_total_expense,
      topPercent,
    });
  } catch (err) {
    console.error('GET /api/salary/stats error:', err);
    res.status(500).json({ error: 'failed to fetch stats' });
  }
});

salaryRouter.get('/distribution', async (req, res) => {
  try {
    const job = String(req.query.job || '');
    const level = String(req.query.level || '');
    if (!ALLOWED_JOBS.includes(job)) return res.status(400).json({ error: 'invalid job' });
    if (!ALLOWED_LEVELS.includes(level)) return res.status(400).json({ error: 'invalid level' });
    const { rows } = await pool.query(
      `SELECT salary FROM "Q6_salary_submissions"
       WHERE job = $1 AND level = $2 ORDER BY salary ASC`,
      [job, level]
    );
    res.json({ job, level, salaries: rows.map(r => r.salary) });
  } catch (err) {
    console.error('GET /api/salary/distribution error:', err);
    res.status(500).json({ error: 'failed to fetch distribution' });
  }
});

salaryRouter.get('/group-by', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT job, level, COUNT(*)::int AS n,
        AVG(salary)::float AS avg_salary,
        AVG(total_expense)::float AS avg_total_expense,
        AVG(salary - total_expense)::float AS avg_remaining
      FROM "Q6_salary_submissions" GROUP BY job, level ORDER BY job, level`);
    res.json({ groups: rows });
  } catch (err) {
    console.error('GET /api/salary/group-by error:', err);
    res.status(500).json({ error: 'failed to fetch group-by' });
  }
});

salaryRouter.get('/count', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM "Q6_salary_submissions"');
    res.json({ total: rows[0].total });
  } catch (err) {
    console.error('GET /api/salary/count error:', err);
    res.status(500).json({ error: 'failed to fetch count' });
  }
});

app.use('/api/salary', salaryRouter);

// ============================================================
// /api/fridge  -- 냉장고·레시피
// ============================================================
const fridgeRouter = express.Router();
const VALID_CATEGORIES = ['vegetable', 'meat', 'dairy', 'etc'];
const VALID_DIFFICULTY = ['easy', 'medium', 'hard'];

function buildAiPrompt({ ingredients, options }) {
  const { difficulty, maxMinutes, calorieTarget, dietMode, note } = options;
  const ingredientList = ingredients.map(i => `- ${i.name} (${i.category})`).join('\n');
  const constraints = [];
  if (difficulty)    constraints.push(`난이도: ${difficulty} (easy/medium/hard 중 하나)`);
  if (maxMinutes)    constraints.push(`총 조리 시간: ${maxMinutes}분 이하`);
  if (calorieTarget) constraints.push(`1인분 기준 약 ${calorieTarget} kcal 내외`);
  if (dietMode)      constraints.push(`다이어트 친화적 (저칼로리·저지방·고단백 우선)`);
  if (note)          constraints.push(`추가 요청: ${note}`);
  const constraintBlock = constraints.length
    ? `## 제약 조건\n${constraints.map(c => `- ${c}`).join('\n')}\n` : '';

  return `당신은 한국 가정 요리 전문가입니다. 아래 냉장고 재료를 우선 활용해 한 가지 요리를 제안하세요.

## 보유 재료
${ingredientList}

${constraintBlock}## 출력 형식 (JSON만, 다른 텍스트 금지)
{
  "title": "요리 이름 (한국어, 30자 이내)",
  "ingredients": ["사용 재료 (보유 재료 우선, 없으면 마트에서 쉽게 구할 수 있는 것)"],
  "steps": ["조리 순서 1", "조리 순서 2", "..."],
  "difficulty": "easy | medium | hard",
  "minutes": 정수(분),
  "estimatedCalories": 정수(1인분 kcal)
}

규칙:
- ingredients는 5~10개, steps는 4~8개
- 보유 재료를 가능한 한 많이 사용
- 제약 조건이 있으면 반드시 지키세요
- JSON 외 다른 출력 금지`;
}

async function callOpenAi(prompt) {
  if (!OPENAI_API_KEY) {
    const err = new Error('OPENAI_API_KEY가 설정되어 있지 않습니다.');
    err.status = 503;
    throw err;
  }
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: '당신은 사용자가 가진 재료에 맞춰 실용적인 한국 가정식 레시피를 JSON으로 만들어 주는 어시스턴트입니다.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    const err = new Error(`OpenAI API 오류 (${r.status}): ${text.slice(0, 300)}`);
    err.status = r.status === 401 || r.status === 429 ? 503 : 502;
    throw err;
  }
  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content || '';
  try { return JSON.parse(content); }
  catch {
    const err = new Error('AI 응답이 올바른 JSON이 아닙니다.');
    err.status = 502; throw err;
  }
}
function normalizeAiRecipe(raw) {
  return {
    title:             String(raw.title || '').trim().slice(0, 120) || 'AI 추천 요리',
    ingredients:       Array.isArray(raw.ingredients) ? raw.ingredients.map(String).slice(0, 30) : [],
    steps:             Array.isArray(raw.steps)       ? raw.steps.map(String).slice(0, 30)       : [],
    difficulty:        VALID_DIFFICULTY.includes(raw.difficulty) ? raw.difficulty : null,
    minutes:           Number.isInteger(raw.minutes) && raw.minutes > 0 ? raw.minutes : null,
    estimatedCalories: Number.isInteger(raw.estimatedCalories) && raw.estimatedCalories > 0 ? raw.estimatedCalories : null,
  };
}
function rowToRecipe(row) {
  return {
    id: row.id, title: row.title,
    ingredients: row.ingredients, steps: row.steps,
    difficulty: row.difficulty || null, minutes: row.minutes || null,
    calorieTarget: row.calorie_target || null,
    estimatedCalories: row.meta?.estimatedCalories ?? null,
    source: row.source || 'manual', meta: row.meta || {},
    created_at: row.created_at,
  };
}

fridgeRouter.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, dbConnected: true, aiConfigured: Boolean(OPENAI_API_KEY), model: OPENAI_MODEL });
  } catch (err) {
    res.status(200).json({ ok: true, dbConnected: false, error: err.message });
  }
});

fridgeRouter.get('/ingredients', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, category, created_at FROM ingredients ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

fridgeRouter.post('/ingredients', async (req, res, next) => {
  try {
    const { name, category } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name은 필수입니다.' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category는 ${VALID_CATEGORIES.join('|')} 중 하나여야 합니다.` });
    }
    const { rows } = await pool.query(
      `INSERT INTO ingredients (name, category) VALUES ($1, $2)
       RETURNING id, name, category, created_at`,
      [name.trim(), category]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err && err.code === '23505') return res.status(409).json({ error: '같은 이름의 재료가 이미 존재합니다.' });
    next(err);
  }
});

fridgeRouter.patch('/ingredients/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id가 올바르지 않습니다.' });
    const { name, category } = req.body || {};
    const fields = [], values = [];
    let idx = 1;
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name은 비어있을 수 없습니다.' });
      fields.push(`name = $${idx++}`); values.push(name.trim());
    }
    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: `category는 ${VALID_CATEGORIES.join('|')} 중 하나여야 합니다.` });
      fields.push(`category = $${idx++}`); values.push(category);
    }
    if (fields.length === 0) return res.status(400).json({ error: '수정할 필드가 없습니다.' });
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE ingredients SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, category, created_at`, values);
    if (rows.length === 0) return res.status(404).json({ error: '재료를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    if (err && err.code === '23505') return res.status(409).json({ error: '같은 이름의 재료가 이미 존재합니다.' });
    next(err);
  }
});

fridgeRouter.delete('/ingredients/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id가 올바르지 않습니다.' });
    const { rowCount } = await pool.query(`DELETE FROM ingredients WHERE id = $1`, [id]);
    if (rowCount === 0) return res.status(404).json({ error: '재료를 찾을 수 없습니다.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

fridgeRouter.get('/recipes', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, ingredients, steps, difficulty, minutes, calorie_target, source, meta, created_at
       FROM recipes ORDER BY created_at DESC`);
    res.json(rows.map(rowToRecipe));
  } catch (err) { next(err); }
});

fridgeRouter.get('/recipes/recommended', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, ingredients, steps, difficulty, minutes, calorie_target, source, meta, created_at
       FROM recipes
       WHERE ingredients <@ ARRAY(SELECT name FROM ingredients)
         AND array_length(ingredients, 1) > 0
       ORDER BY array_length(ingredients, 1) DESC, created_at DESC LIMIT 3`);
    res.json(rows.map(rowToRecipe));
  } catch (err) { next(err); }
});

fridgeRouter.post('/recipes/preview', async (req, res, next) => {
  try {
    const opts = { ...(req.body || {}) };
    if (opts.difficulty && !VALID_DIFFICULTY.includes(opts.difficulty)) {
      return res.status(400).json({ error: `difficulty는 ${VALID_DIFFICULTY.join('|')} 중 하나여야 합니다.` });
    }
    if (opts.maxMinutes !== undefined && opts.maxMinutes !== null && opts.maxMinutes !== '') {
      const n = Number(opts.maxMinutes);
      if (!Number.isInteger(n) || n <= 0 || n > 600) {
        return res.status(400).json({ error: 'maxMinutes는 1~600 사이의 정수여야 합니다.' });
      }
      opts.maxMinutes = n;
    }
    if (opts.calorieTarget !== undefined && opts.calorieTarget !== null && opts.calorieTarget !== '') {
      const n = Number(opts.calorieTarget);
      if (!Number.isInteger(n) || n <= 0 || n > 5000) {
        return res.status(400).json({ error: 'calorieTarget은 1~5000 사이의 정수여야 합니다.' });
      }
      opts.calorieTarget = n;
    }
    const { rows: ingRows } = await pool.query(
      `SELECT name, category FROM ingredients ORDER BY created_at DESC`);
    if (ingRows.length === 0) {
      return res.status(400).json({ error: '냉장고가 비어있어요. 먼저 재료를 추가하세요.' });
    }
    const prompt = buildAiPrompt({ ingredients: ingRows, options: opts });
    const aiRaw  = await callOpenAi(prompt);
    const recipe = normalizeAiRecipe(aiRaw);
    res.json({
      preview: recipe, requestOptions: opts,
      basedOnIngredients: ingRows.map(r => r.name),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

fridgeRouter.post('/recipes/save', async (req, res, next) => {
  try {
    const { recipe, options } = req.body || {};
    if (!recipe || typeof recipe !== 'object') return res.status(400).json({ error: 'recipe 객체가 필요합니다.' });
    if (!recipe.title || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) {
      return res.status(400).json({ error: 'recipe.title / ingredients[] / steps[]는 필수입니다.' });
    }
    let title = String(recipe.title).trim();
    const exists = await pool.query(`SELECT 1 FROM recipes WHERE title = $1`, [title]);
    if (exists.rowCount > 0) {
      let n = 2;
      while (n <= 50) {
        const candidate = `${title} (${n})`;
        const r = await pool.query(`SELECT 1 FROM recipes WHERE title = $1`, [candidate]);
        if (r.rowCount === 0) { title = candidate; break; }
        n += 1;
      }
    }
    const meta = {
      estimatedCalories: recipe.estimatedCalories ?? null,
      requestOptions: options || {},
    };
    const { rows } = await pool.query(
      `INSERT INTO recipes (title, ingredients, steps, difficulty, minutes, calorie_target, source, meta)
       VALUES ($1, $2, $3, $4, $5, $6, 'ai-openai', $7)
       RETURNING id, title, ingredients, steps, difficulty, minutes, calorie_target, source, meta, created_at`,
      [
        title, recipe.ingredients.map(String), recipe.steps.map(String),
        recipe.difficulty || null,
        Number.isInteger(recipe.minutes) ? recipe.minutes : null,
        options && Number.isInteger(Number(options.calorieTarget)) ? Number(options.calorieTarget) : null,
        meta,
      ]
    );
    res.status(201).json(rowToRecipe(rows[0]));
  } catch (err) { next(err); }
});

fridgeRouter.post('/recipes', async (req, res, next) => {
  try {
    const { title, ingredients, steps } = req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title은 필수입니다.' });
    if (!Array.isArray(ingredients) || ingredients.some((s) => typeof s !== 'string')) {
      return res.status(400).json({ error: 'ingredients는 문자열 배열이어야 합니다.' });
    }
    if (!Array.isArray(steps) || steps.some((s) => typeof s !== 'string')) {
      return res.status(400).json({ error: 'steps는 문자열 배열이어야 합니다.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO recipes (title, ingredients, steps) VALUES ($1, $2, $3)
       RETURNING id, title, ingredients, steps, created_at`,
      [title.trim(), ingredients, steps]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err && err.code === '23505') return res.status(409).json({ error: '같은 이름의 레시피가 이미 존재합니다.' });
    next(err);
  }
});

fridgeRouter.delete('/recipes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id가 올바르지 않습니다.' });
    const { rowCount } = await pool.query(`DELETE FROM recipes WHERE id = $1`, [id]);
    if (rowCount === 0) return res.status(404).json({ error: '레시피를 찾을 수 없습니다.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

app.use('/api/fridge', fridgeRouter);

// ============================================================
// /api/balance  -- 실시간 밸런스 게임
// ============================================================
const balanceRouter = express.Router();
const QUESTIONS_WITH_TALLY_SQL = `
  SELECT q.id, q.category,
    q.option_a_text, q.option_a_emoji, q.option_a_color,
    q.option_b_text, q.option_b_emoji, q.option_b_color, q.display_order,
    COALESCE(SUM(CASE WHEN v.choice = 'A' THEN 1 ELSE 0 END), 0)::int AS votes_a,
    COALESCE(SUM(CASE WHEN v.choice = 'B' THEN 1 ELSE 0 END), 0)::int AS votes_b
  FROM "Q5_questions" q
  LEFT JOIN "Q5_votes" v ON v.question_id = q.id
  GROUP BY q.id ORDER BY q.display_order ASC, q.id ASC`;

const rowToQuestion = (r) => ({
  id: r.id, category: r.category, displayOrder: r.display_order,
  a: { text: r.option_a_text, emoji: r.option_a_emoji, color: r.option_a_color },
  b: { text: r.option_b_text, emoji: r.option_b_emoji, color: r.option_b_color },
  votes: { a: r.votes_a, b: r.votes_b },
});

balanceRouter.get('/questions', async (_req, res) => {
  try {
    const { rows } = await pool.query(QUESTIONS_WITH_TALLY_SQL);
    res.json(rows.map(rowToQuestion));
  } catch (err) {
    console.error('GET /api/balance/questions error:', err);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

balanceRouter.get('/stats', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total_votes,
             COUNT(DISTINCT voter_id)::int AS unique_voters
      FROM "Q5_votes"`);
    res.json({ totalVotes: rows[0].total_votes, uniqueVoters: rows[0].unique_voters });
  } catch (err) {
    console.error('GET /api/balance/stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

balanceRouter.get('/votes/me', async (req, res) => {
  const voterId = typeof req.query.voterId === 'string' ? req.query.voterId.trim() : '';
  if (!voterId) return res.status(400).json({ error: 'voterId is required' });
  try {
    const { rows } = await pool.query(
      `SELECT question_id, choice FROM "Q5_votes" WHERE voter_id = $1`, [voterId]);
    const map = {};
    for (const r of rows) map[r.question_id] = r.choice;
    res.json(map);
  } catch (err) {
    console.error('GET /api/balance/votes/me error:', err);
    res.status(500).json({ error: 'Failed to fetch user votes' });
  }
});

balanceRouter.post('/votes', async (req, res) => {
  const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId.trim() : '';
  const choiceRaw  = typeof req.body?.choice === 'string' ? req.body.choice.trim().toUpperCase() : '';
  const voterId    = typeof req.body?.voterId === 'string' ? req.body.voterId.trim() : '';
  if (!questionId || !voterId || (choiceRaw !== 'A' && choiceRaw !== 'B')) {
    return res.status(400).json({ error: 'questionId, voterId, choice(A|B) are required' });
  }
  try {
    await pool.query(
      `INSERT INTO "Q5_votes" (question_id, choice, voter_id) VALUES ($1, $2, $3)
       ON CONFLICT (question_id, voter_id)
       DO UPDATE SET choice = EXCLUDED.choice, updated_at = now()`,
      [questionId, choiceRaw, voterId]);
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN choice='A' THEN 1 ELSE 0 END), 0)::int AS votes_a,
              COALESCE(SUM(CASE WHEN choice='B' THEN 1 ELSE 0 END), 0)::int AS votes_b
       FROM "Q5_votes" WHERE question_id = $1`, [questionId]);
    res.json({ questionId, myChoice: choiceRaw, votes: { a: rows[0].votes_a, b: rows[0].votes_b } });
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Question not found' });
    console.error('POST /api/balance/votes error:', err);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

balanceRouter.delete('/votes', async (req, res) => {
  const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId.trim() : '';
  const voterId    = typeof req.body?.voterId === 'string' ? req.body.voterId.trim() : '';
  if (!questionId || !voterId) return res.status(400).json({ error: 'questionId, voterId are required' });
  try {
    await pool.query(`DELETE FROM "Q5_votes" WHERE question_id = $1 AND voter_id = $2`,
      [questionId, voterId]);
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN choice='A' THEN 1 ELSE 0 END), 0)::int AS votes_a,
              COALESCE(SUM(CASE WHEN choice='B' THEN 1 ELSE 0 END), 0)::int AS votes_b
       FROM "Q5_votes" WHERE question_id = $1`, [questionId]);
    res.json({ questionId, myChoice: null, votes: { a: rows[0].votes_a, b: rows[0].votes_b } });
  } catch (err) {
    console.error('DELETE /api/balance/votes error:', err);
    res.status(500).json({ error: 'Failed to remove vote' });
  }
});

app.use('/api/balance', balanceRouter);

// ============================================================
// 정적 페이지 라우트 (서브 경로별 index.html)
// ============================================================
const sendApp = (sub) => (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', sub, 'index.html'));

app.get(['/board', '/board/'],     sendApp('board'));
app.get(['/salary', '/salary/'],   sendApp('salary'));
app.get(['/fridge', '/fridge/'],   sendApp('fridge'));
app.get(['/balance', '/balance/'], sendApp('balance'));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 에러 핸들러
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'unknown error' });
});

// ----------------------------------------
// Startup (로컬) / export (Vercel Serverless)
// ----------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`4-apps server running on http://localhost:${PORT}`);
    console.log('  - /             (홈)');
    console.log('  - /board        (익명 게시판)');
    console.log('  - /salary       (연봉 비교)');
    console.log('  - /fridge       (냉장고 레시피)');
    console.log('  - /balance      (밸런스 게임)');
  });
}

module.exports = app;
