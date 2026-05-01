// =============================================================================
// Shopping Mall Backend - server.js (ESM)
// =============================================================================

import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// ESM에서는 __dirname이 없으므로 직접 만든다
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// 환경 변수
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3300;
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();

if (!JWT_SECRET) {
  console.error('JWT_SECRET이 .env에 설정되어 있지 않습니다.');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('DATABASE_URL이 .env에 설정되어 있지 않습니다.');
  process.exit(1);
}

// -----------------------------------------------------------------------------
// DB 풀 (Supabase Pooler 사용 — pgbouncer 통과 후라 ssl 옵션 불필요)
// -----------------------------------------------------------------------------
const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
});

// 회원/장바구니 테이블만 자동 생성 (W5_products는 절대 건드리지 않음)
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "W5_users" (
      id            BIGSERIAL PRIMARY KEY,
      email         VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "W5_cart_items" (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES "W5_users"(id) ON DELETE CASCADE,
      product_id  BIGINT NOT NULL REFERENCES "W5_products"(id) ON DELETE CASCADE,
      quantity    INTEGER NOT NULL CHECK (quantity > 0) DEFAULT 1,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, product_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_w5_cart_user ON "W5_cart_items"(user_id);`);
  console.log('W5_users / W5_cart_items tables ready');
}

// -----------------------------------------------------------------------------
// Express 앱
// -----------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 서버리스 cold start 안정화: 첫 요청 전에 initDB() 한 번 보장
let initPromise = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = initDB()
      .then(() => console.log('Database connected'))
      .catch((err) => {
        console.error('initDB failed:', err);
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}
app.use(async (_req, _res, next) => {
  try {
    await ensureInit();
    next();
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 유틸: 이메일 형식 검증
// -----------------------------------------------------------------------------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

// -----------------------------------------------------------------------------
// JWT 인증 미들웨어
// -----------------------------------------------------------------------------
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const token = match[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: Number(user.id), email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// =============================================================================
// 라우트: 인증
// =============================================================================

// 회원가입
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: '비밀번호는 최소 6자 이상이어야 합니다' });
    }

    // 중복 검사
    const dup = await pool.query(
      'SELECT id FROM "W5_users" WHERE email = $1',
      [email]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: '이미 가입된 이메일입니다' });
    }

    // 해시 후 INSERT
    const passwordHash = await bcrypt.hash(password, 10);
    const insertResult = await pool.query(
      `INSERT INTO "W5_users" (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
      [email, passwordHash]
    );
    const newUser = insertResult.rows[0];
    const user = { id: Number(newUser.id), email: newUser.email };

    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (err) {
    console.error('POST /api/auth/signup error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash FROM "W5_users" WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    const row = result.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    const user = { id: Number(row.id), email: row.email };
    const token = signToken(user);
    return res.status(200).json({ token, user });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 내 정보 (토큰 검증)
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    // 토큰 안의 정보를 그대로 반환 (DB 재조회 불필요)
    return res.status(200).json({
      user: { id: Number(req.user.id), email: req.user.email },
    });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// =============================================================================
// 라우트: 상품 (인증 불필요)
// =============================================================================

// 상품 목록
app.get('/api/products', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, price, image_url, description
         FROM "W5_products"
         ORDER BY id ASC`
    );
    const products = result.rows.map((p) => ({
      id: Number(p.id),
      name: p.name,
      price: p.price,
      image_url: p.image_url,
      description: p.description,
    }));
    return res.status(200).json({ products });
  } catch (err) {
    console.error('GET /api/products error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 상품 단건
app.get('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
    }

    const result = await pool.query(
      `SELECT id, name, price, image_url, description
         FROM "W5_products"
        WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
    }

    const p = result.rows[0];
    const product = {
      id: Number(p.id),
      name: p.name,
      price: p.price,
      image_url: p.image_url,
      description: p.description,
    };
    return res.status(200).json({ product });
  } catch (err) {
    console.error('GET /api/products/:id error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// =============================================================================
// 라우트: 장바구니 (모두 인증 필요)
// =============================================================================

// 내 장바구니 조회 — 상품 정보 JOIN + 합계 포함
app.get('/api/cart', authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const result = await pool.query(
      `SELECT c.id          AS cart_item_id,
              c.quantity    AS quantity,
              c.created_at  AS added_at,
              p.id          AS product_id,
              p.name        AS name,
              p.price       AS price,
              p.image_url   AS image_url,
              p.description AS description
         FROM "W5_cart_items" c
         JOIN "W5_products"   p ON p.id = c.product_id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC`,
      [userId]
    );

    const items = result.rows.map((r) => ({
      id: Number(r.cart_item_id),
      quantity: r.quantity,
      added_at: r.added_at,
      product: {
        id: Number(r.product_id),
        name: r.name,
        price: r.price,
        image_url: r.image_url,
        description: r.description,
      },
      subtotal: Number(r.price) * Number(r.quantity),
    }));

    const total = items.reduce((sum, it) => sum + it.subtotal, 0);
    const itemCount = items.reduce((sum, it) => sum + it.quantity, 0);

    return res.status(200).json({ items, total, itemCount });
  } catch (err) {
    console.error('GET /api/cart error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 장바구니에 담기 (있으면 수량 증가, 없으면 신규)
app.post('/api/cart', authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const { product_id, quantity } = req.body || {};
    const productId = Number(product_id);
    const qty = Number(quantity ?? 1);

    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ error: '잘못된 상품 ID 입니다' });
    }
    if (!Number.isFinite(qty) || qty <= 0 || qty > 999) {
      return res.status(400).json({ error: '수량은 1~999 사이여야 합니다' });
    }

    // 상품 존재 확인
    const prod = await pool.query(
      'SELECT id FROM "W5_products" WHERE id = $1',
      [productId]
    );
    if (prod.rows.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
    }

    // UPSERT: 있으면 quantity += qty, 없으면 신규
    const upsert = await pool.query(
      `INSERT INTO "W5_cart_items" (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity   = "W5_cart_items".quantity + EXCLUDED.quantity,
                     updated_at = NOW()
       RETURNING id, quantity`,
      [userId, productId, qty]
    );

    const row = upsert.rows[0];
    return res.status(201).json({
      item: { id: Number(row.id), quantity: row.quantity, product_id: productId },
    });
  } catch (err) {
    console.error('POST /api/cart error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 수량 변경 (소유자 검증)
app.patch('/api/cart/:id', authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const itemId = Number(req.params.id);
    const { quantity } = req.body || {};
    const qty = Number(quantity);

    if (!Number.isFinite(itemId) || itemId <= 0) {
      return res.status(404).json({ error: '장바구니 항목을 찾을 수 없습니다' });
    }
    if (!Number.isFinite(qty) || qty <= 0 || qty > 999) {
      return res.status(400).json({ error: '수량은 1~999 사이여야 합니다' });
    }

    const result = await pool.query(
      `UPDATE "W5_cart_items"
          SET quantity = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING id, quantity`,
      [qty, itemId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '장바구니 항목을 찾을 수 없습니다' });
    }

    const row = result.rows[0];
    return res.status(200).json({
      item: { id: Number(row.id), quantity: row.quantity },
    });
  } catch (err) {
    console.error('PATCH /api/cart/:id error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 장바구니에서 삭제 (소유자 검증)
app.delete('/api/cart/:id', authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const itemId = Number(req.params.id);

    if (!Number.isFinite(itemId) || itemId <= 0) {
      return res.status(404).json({ error: '장바구니 항목을 찾을 수 없습니다' });
    }

    const result = await pool.query(
      `DELETE FROM "W5_cart_items"
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      [itemId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '장바구니 항목을 찾을 수 없습니다' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/cart/:id error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// =============================================================================
// 서버 시작 / 또는 Vercel 서버리스 export
// =============================================================================

// 로컬 실행 시에만 listen (Vercel 서버리스에서는 export default만 사용)
const isVercel = !!process.env.VERCEL;
if (!isVercel) {
  ensureInit()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}

export default app;
