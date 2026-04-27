const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL   = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

// ---------- DB Pool (Supabase pooler requires SSL) ----------
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[pg pool] unexpected error:', err);
});

// ---------- Middleware ----------
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// ---------- Helpers ----------
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
    ? `## 제약 조건\n${constraints.map(c => `- ${c}`).join('\n')}\n`
    : '';

  return `당신은 한국 가정 요리 전문가입니다. 아래 냉장고 재료를 우선 활용해 한 가지 요리를 제안하세요.

## 보유 재료
${ingredientList}

${constraintBlock}
## 출력 형식 (JSON만, 다른 텍스트 금지)
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

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
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

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`OpenAI API 오류 (${res.status}): ${text.slice(0, 300)}`);
    err.status = res.status === 401 || res.status === 429 ? 503 : 502;
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  try {
    return JSON.parse(content);
  } catch {
    const err = new Error('AI 응답이 올바른 JSON이 아닙니다.');
    err.status = 502;
    throw err;
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
    id: row.id,
    title: row.title,
    ingredients: row.ingredients,
    steps: row.steps,
    difficulty: row.difficulty || null,
    minutes: row.minutes || null,
    calorieTarget: row.calorie_target || null,
    estimatedCalories: row.meta?.estimatedCalories ?? null,
    source: row.source || 'manual',
    meta: row.meta || {},
    created_at: row.created_at,
  };
}

// ---------- Health ----------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      dbConnected: true,
      aiConfigured: Boolean(OPENAI_API_KEY),
      model: OPENAI_MODEL,
    });
  } catch (err) {
    console.error('[health] db check failed:', err.message);
    res.status(200).json({ ok: true, dbConnected: false, error: err.message });
  }
});

// ===================================================
// Ingredients — (id, name, category, created_at)
// ===================================================

app.get('/api/ingredients', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, category, created_at
         FROM ingredients
         ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post('/api/ingredients', async (req, res, next) => {
  try {
    const { name, category } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name은 필수입니다.' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res
        .status(400)
        .json({ error: `category는 ${VALID_CATEGORIES.join('|')} 중 하나여야 합니다.` });
    }

    const { rows } = await pool.query(
      `INSERT INTO ingredients (name, category)
         VALUES ($1, $2)
         RETURNING id, name, category, created_at`,
      [name.trim(), category]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: '같은 이름의 재료가 이미 존재합니다.' });
    }
    next(err);
  }
});

app.patch('/api/ingredients/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id가 올바르지 않습니다.' });
    }

    const { name, category } = req.body || {};
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name은 비어있을 수 없습니다.' });
      }
      fields.push(`name = $${idx++}`);
      values.push(name.trim());
    }
    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res
          .status(400)
          .json({ error: `category는 ${VALID_CATEGORIES.join('|')} 중 하나여야 합니다.` });
      }
      fields.push(`category = $${idx++}`);
      values.push(category);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: '수정할 필드가 없습니다.' });
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE ingredients
          SET ${fields.join(', ')}
        WHERE id = $${idx}
        RETURNING id, name, category, created_at`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '재료를 찾을 수 없습니다.' });
    }
    res.json(rows[0]);
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: '같은 이름의 재료가 이미 존재합니다.' });
    }
    next(err);
  }
});

app.delete('/api/ingredients/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id가 올바르지 않습니다.' });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM ingredients WHERE id = $1`,
      [id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: '재료를 찾을 수 없습니다.' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ===================================================
// Recipes — (id, title, ingredients, steps, created_at)
// ===================================================

app.get('/api/recipes', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, ingredients, steps, difficulty, minutes, calorie_target, source, meta, created_at
         FROM recipes
         ORDER BY created_at DESC`
    );
    res.json(rows.map(rowToRecipe));
  } catch (err) {
    next(err);
  }
});

// 보유 재료로 만들 수 있는 레시피 추천 (상위 3개)
app.get('/api/recipes/recommended', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, ingredients, steps, difficulty, minutes, calorie_target, source, meta, created_at
         FROM recipes
         WHERE ingredients <@ ARRAY(SELECT name FROM ingredients)
           AND array_length(ingredients, 1) > 0
         ORDER BY array_length(ingredients, 1) DESC, created_at DESC
         LIMIT 3`
    );
    res.json(rows.map(rowToRecipe));
  } catch (err) {
    next(err);
  }
});

// AI 미리보기 — DB에 저장하지 않음
app.post('/api/recipes/preview', async (req, res, next) => {
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
      `SELECT name, category FROM ingredients ORDER BY created_at DESC`
    );
    if (ingRows.length === 0) {
      return res.status(400).json({ error: '냉장고가 비어있어요. 먼저 재료를 추가하세요.' });
    }

    const prompt = buildAiPrompt({ ingredients: ingRows, options: opts });
    const aiRaw  = await callOpenAi(prompt);
    const recipe = normalizeAiRecipe(aiRaw);

    res.json({
      preview: recipe,
      requestOptions: opts,
      basedOnIngredients: ingRows.map(r => r.name),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// AI 미리보기 결과를 DB에 저장
app.post('/api/recipes/save', async (req, res, next) => {
  try {
    const { recipe, options } = req.body || {};
    if (!recipe || typeof recipe !== 'object') {
      return res.status(400).json({ error: 'recipe 객체가 필요합니다.' });
    }
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
        title,
        recipe.ingredients.map(String),
        recipe.steps.map(String),
        recipe.difficulty || null,
        Number.isInteger(recipe.minutes) ? recipe.minutes : null,
        options && Number.isInteger(Number(options.calorieTarget)) ? Number(options.calorieTarget) : null,
        meta,
      ]
    );

    res.status(201).json(rowToRecipe(rows[0]));
  } catch (err) { next(err); }
});

app.post('/api/recipes', async (req, res, next) => {
  try {
    const { title, ingredients, steps } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title은 필수입니다.' });
    }
    if (!Array.isArray(ingredients) || ingredients.some((s) => typeof s !== 'string')) {
      return res.status(400).json({ error: 'ingredients는 문자열 배열이어야 합니다.' });
    }
    if (!Array.isArray(steps) || steps.some((s) => typeof s !== 'string')) {
      return res.status(400).json({ error: 'steps는 문자열 배열이어야 합니다.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO recipes (title, ingredients, steps)
         VALUES ($1, $2, $3)
         RETURNING id, title, ingredients, steps, created_at`,
      [title.trim(), ingredients, steps]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: '같은 이름의 레시피가 이미 존재합니다.' });
    }
    next(err);
  }
});

app.delete('/api/recipes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id가 올바르지 않습니다.' });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM recipes WHERE id = $1`,
      [id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: '레시피를 찾을 수 없습니다.' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------- Static ----------
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Error handler ----------
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err && err.message ? err.message : 'unknown error',
  });
});

// ---------- Start ----------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
