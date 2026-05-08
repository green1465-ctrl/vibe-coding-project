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
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import ImageKit from 'imagekit';

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

// 관리자 이메일 화이트리스트 (소문자 비교)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAdminEmail(email) {
  return typeof email === 'string' && ADMIN_EMAILS.includes(email.toLowerCase());
}

// ImageKit (선택) — 키가 있을 때만 인스턴스 생성
const IK_PUBLIC = (process.env.IMAGEKIT_PUBLIC_KEY || '').trim();
const IK_PRIVATE = (process.env.IMAGEKIT_PRIVATE_KEY || '').trim();
const IK_ENDPOINT = (process.env.IMAGEKIT_URL_ENDPOINT || '').trim();
const imagekit =
  IK_PUBLIC && IK_PRIVATE && IK_ENDPOINT
    ? new ImageKit({
        publicKey: IK_PUBLIC,
        privateKey: IK_PRIVATE,
        urlEndpoint: IK_ENDPOINT,
      })
    : null;

// TossPayments
// CLIENT_KEY: 프론트엔드에 내려보내도 안전 (SDK 초기화에 필요)
// SECRET_KEY: 절대 클라이언트로 내려가면 안 됨 — 서버에서 confirm API 호출 시에만 Basic auth 헤더로 사용
const TOSS_CLIENT_KEY = (process.env.TOSS_CLIENT_KEY || '').trim();
const TOSS_SECRET_KEY = (process.env.TOSS_SECRET_KEY || '').trim();
if (!TOSS_CLIENT_KEY || !TOSS_SECRET_KEY) {
  console.warn('[warn] TOSS_CLIENT_KEY 또는 TOSS_SECRET_KEY가 .env에 설정되지 않았습니다. 결제 기능이 동작하지 않습니다.');
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "W5_orders" (
      id            BIGSERIAL PRIMARY KEY,
      user_id       BIGINT NOT NULL REFERENCES "W5_users"(id) ON DELETE CASCADE,
      order_number  VARCHAR(64) UNIQUE NOT NULL,
      total         INTEGER NOT NULL CHECK (total >= 0),
      status        VARCHAR(20) NOT NULL DEFAULT 'paid',
      payment_key   VARCHAR(200),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // 마이그레이션 (idempotent): 기존 VARCHAR(40) 컬럼을 64로 확장 + payment_key 컬럼 추가
  // 토스 orderId 사양 6~64자에 맞춤. 'order_' + UUID(36) = 42자가 들어갈 수 있어야 함.
  await pool.query(`ALTER TABLE "W5_orders" ALTER COLUMN order_number TYPE VARCHAR(64);`);
  await pool.query(`ALTER TABLE "W5_orders" ADD COLUMN IF NOT EXISTS payment_key VARCHAR(200);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_w5_orders_user ON "W5_orders"(user_id, created_at DESC);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "W5_order_items" (
      id            BIGSERIAL PRIMARY KEY,
      order_id      BIGINT NOT NULL REFERENCES "W5_orders"(id) ON DELETE CASCADE,
      product_id    BIGINT REFERENCES "W5_products"(id) ON DELETE SET NULL,
      product_name  VARCHAR(200) NOT NULL,
      price         INTEGER NOT NULL,
      image_url     TEXT,
      quantity      INTEGER NOT NULL CHECK (quantity > 0),
      subtotal      INTEGER NOT NULL CHECK (subtotal >= 0),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_w5_order_items_order ON "W5_order_items"(order_id);`);

  console.log('W5_users / W5_cart_items / W5_orders / W5_order_items tables ready');
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
    // 토큰에 박힌 role을 그대로 신뢰하지 않고, 매 요청 시 ADMIN_EMAILS로 재계산
    // (관리자 권한 회수가 즉시 반영되도록)
    const role = isAdminEmail(payload.email) ? 'admin' : 'user';
    req.user = { id: payload.id, email: payload.email, role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다' });
  }
  next();
}

function signToken(user) {
  const role = isAdminEmail(user.email) ? 'admin' : 'user';
  return jwt.sign(
    { id: Number(user.id), email: user.email, role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(user) {
  return {
    id: Number(user.id),
    email: user.email,
    role: isAdminEmail(user.email) ? 'admin' : 'user',
  };
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
    const user = publicUser(newUser);

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

    const user = publicUser(row);
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
    return res.status(200).json({ user: publicUser(req.user) });
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
// 라우트: 주문 (모두 인증 필요, 본인 것만 조회 가능)
// =============================================================================

// 내 주문 목록
app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const result = await pool.query(
      `SELECT o.id,
              o.order_number,
              o.total,
              o.status,
              o.created_at,
              COALESCE(s.item_count, 0) AS item_count,
              s.first_item_name
         FROM "W5_orders" o
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS item_count,
                  MIN(product_name) FILTER (WHERE product_name IS NOT NULL) AS first_item_name
             FROM "W5_order_items"
            WHERE order_id = o.id
         ) s ON TRUE
        WHERE o.user_id = $1
        ORDER BY o.created_at DESC`,
      [userId]
    );

    const orders = result.rows.map((r) => ({
      id: Number(r.id),
      order_number: r.order_number,
      total: r.total,
      status: r.status,
      created_at: r.created_at,
      item_count: Number(r.item_count),
      first_item_name: r.first_item_name || null,
    }));

    return res.status(200).json({ orders });
  } catch (err) {
    console.error('GET /api/orders error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 주문 상세 (소유자 검증 — 본인 것이 아니면 404로 통일해서 존재 자체를 가림)
app.get('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(404).json({ error: '주문을 찾을 수 없습니다' });
    }

    const orderRes = await pool.query(
      `SELECT id, order_number, total, status, created_at
         FROM "W5_orders"
        WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: '주문을 찾을 수 없습니다' });
    }
    const o = orderRes.rows[0];

    const itemsRes = await pool.query(
      `SELECT id, product_id, product_name, price, image_url, quantity, subtotal
         FROM "W5_order_items"
        WHERE order_id = $1
        ORDER BY id`,
      [id]
    );
    const items = itemsRes.rows.map((r) => ({
      id: Number(r.id),
      product_id: r.product_id == null ? null : Number(r.product_id),
      product_name: r.product_name,
      price: r.price,
      image_url: r.image_url,
      quantity: r.quantity,
      subtotal: r.subtotal,
    }));

    return res.status(200).json({
      order: {
        id: Number(o.id),
        order_number: o.order_number,
        total: o.total,
        status: o.status,
        created_at: o.created_at,
        items,
      },
    });
  } catch (err) {
    console.error('GET /api/orders/:id error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// =============================================================================
// 라우트: 결제 (TossPayments)
// =============================================================================
//
// 흐름:
//   [클라] GET  /api/payments/config           → clientKey 조회 (SDK 초기화용)
//   [클라] POST /api/payments/intent           → 카트 기반으로 orderId/amount/orderName 생성
//   [클라] (TossPayments 위젯에서 결제 진행)
//   [클라] POST /api/payments/confirm          → 토스 confirm API 호출 + 주문 INSERT + 카트 비우기
//
// 보안 핵심:
//   - SECRET_KEY는 서버에만 존재. 클라이언트 응답에 절대 포함시키지 않음.
//   - confirm 시 클라가 보낸 amount를 그대로 믿지 않고, 서버에서 카트 합계를 재계산해 검증.
//   - 토큰의 user_id로만 카트 조회 → 본인 카트만 결제 가능.

// 클라이언트 키만 내려보내는 공개 엔드포인트 (인증 불필요)
app.get('/api/payments/config', (_req, res) => {
  if (!TOSS_CLIENT_KEY) {
    return res.status(503).json({ error: '결제 모듈이 설정되지 않았습니다' });
  }
  return res.status(200).json({ clientKey: TOSS_CLIENT_KEY });
});

// 결제 의도(intent) 생성 — 카트 조회 + orderId/customerKey/orderName 발급
// orderId는 이 시점에 발급 (토스는 6~64자 영숫자/_-/= 허용. crypto.randomUUID 충분)
app.post('/api/payments/intent', authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.user.id);

    // 카트 재조회 (트랜잭션 아님 — 단순 read)
    const cartRes = await pool.query(
      `SELECT c.id          AS cart_item_id,
              c.quantity    AS quantity,
              p.id          AS product_id,
              p.name        AS name,
              p.price       AS price,
              p.image_url   AS image_url
         FROM "W5_cart_items" c
         JOIN "W5_products"   p ON p.id = c.product_id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC`,
      [userId]
    );
    if (cartRes.rows.length === 0) {
      return res.status(400).json({ error: '장바구니가 비어 있습니다' });
    }

    const items = cartRes.rows.map((r) => ({
      cart_item_id: Number(r.cart_item_id),
      product_id: Number(r.product_id),
      name: r.name,
      price: Number(r.price),
      image_url: r.image_url,
      quantity: Number(r.quantity),
      subtotal: Number(r.price) * Number(r.quantity),
    }));
    const amount = items.reduce((s, it) => s + it.subtotal, 0);

    // orderName: "베이직 화이트 티셔츠 외 N건" 형식
    const firstName = items[0]?.name || '주문';
    const orderName =
      items.length === 1 ? firstName : `${firstName} 외 ${items.length - 1}건`;

    // orderId: 'order_' + uuid (uuid 36자 + prefix 6자 = 42자, 토스 6~64자 OK)
    const orderId = `order_${crypto.randomUUID()}`;
    // customerKey: 사용자별 고정값 (이메일/탈퇴 영향 없는 user.id 기반)
    const customerKey = `customer_${userId}`;

    return res.status(200).json({
      orderId,
      amount,
      orderName,
      customerKey,
      items: items.map((it) => ({
        product_id: it.product_id,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        subtotal: it.subtotal,
      })),
    });
  } catch (err) {
    console.error('POST /api/payments/intent error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 결제 승인 (confirm) — 토스 API 호출 + DB 트랜잭션으로 주문 생성 + 카트 비우기
app.post('/api/payments/confirm', authMiddleware, async (req, res) => {
  if (!TOSS_SECRET_KEY) {
    return res.status(503).json({ error: '결제 모듈이 설정되지 않았습니다' });
  }

  const userId = Number(req.user.id);
  const { paymentKey, orderId, amount } = req.body || {};

  // 1) 형식 검증
  if (
    typeof paymentKey !== 'string' || !paymentKey ||
    typeof orderId !== 'string' || !orderId ||
    !Number.isFinite(Number(amount)) || Number(amount) <= 0
  ) {
    return res.status(400).json({ error: '잘못된 결제 정보입니다' });
  }
  const claimedAmount = Math.floor(Number(amount));

  // 2) 서버 측 카트 합계 재계산 — 클라가 보낸 amount를 그대로 믿지 않는다
  let cartRows;
  try {
    const cartRes = await pool.query(
      `SELECT c.id          AS cart_item_id,
              c.quantity    AS quantity,
              p.id          AS product_id,
              p.name        AS name,
              p.price       AS price,
              p.image_url   AS image_url
         FROM "W5_cart_items" c
         JOIN "W5_products"   p ON p.id = c.product_id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC`,
      [userId]
    );
    cartRows = cartRes.rows;
  } catch (err) {
    console.error('confirm: cart read error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }

  if (cartRows.length === 0) {
    return res.status(400).json({ error: '장바구니가 비어 있습니다' });
  }
  const serverAmount = cartRows.reduce(
    (s, r) => s + Number(r.price) * Number(r.quantity),
    0
  );
  if (serverAmount !== claimedAmount) {
    // 변조 또는 카트 변경 — 절대로 confirm 호출 금지
    console.warn(
      `[security] amount mismatch user=${userId} client=${claimedAmount} server=${serverAmount} orderId=${orderId}`
    );
    return res.status(400).json({
      error: '결제 금액이 일치하지 않습니다. 장바구니를 다시 확인해주세요.',
    });
  }

  // 3) 토스 confirm API 호출
  const basic = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  let tossRes, tossData;
  try {
    tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount: serverAmount,
      }),
    });
    tossData = await tossRes.json().catch(() => null);
  } catch (err) {
    console.error('confirm: toss fetch error:', err);
    return res.status(502).json({ error: '결제 승인 서버에 연결할 수 없습니다' });
  }

  if (!tossRes.ok) {
    // 토스 에러: code, message 그대로 전달
    const code = tossData?.code || 'UNKNOWN';
    const message = tossData?.message || '결제 승인에 실패했습니다';
    console.warn(`[toss confirm fail] user=${userId} orderId=${orderId} code=${code} msg=${message}`);
    return res.status(400).json({ error: message, code });
  }

  // 4) DB 트랜잭션: orders / order_items INSERT + cart 비우기
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // 임시 order_number로 INSERT (UNIQUE 충족용 — toss orderId 사용)
    // → id 받은 뒤 'ORD-000123' 포맷으로 UPDATE
    // payment_key 도 함께 저장 (환불/대조용 audit trail)
    const insertOrder = await dbClient.query(
      `INSERT INTO "W5_orders" (user_id, order_number, total, status, payment_key)
       VALUES ($1, $2, $3, 'paid', $4)
       RETURNING id, created_at`,
      [userId, orderId, serverAmount, paymentKey]
    );
    const orderRow = insertOrder.rows[0];
    const orderDbId = Number(orderRow.id);
    const orderNumber = `ORD-${String(orderDbId).padStart(6, '0')}`;

    await dbClient.query(
      `UPDATE "W5_orders" SET order_number = $1 WHERE id = $2`,
      [orderNumber, orderDbId]
    );

    // 카트 항목 → 주문 항목 (스냅샷)
    for (const r of cartRows) {
      const price = Number(r.price);
      const qty = Number(r.quantity);
      await dbClient.query(
        `INSERT INTO "W5_order_items"
           (order_id, product_id, product_name, price, image_url, quantity, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderDbId, Number(r.product_id), r.name, price, r.image_url, qty, price * qty]
      );
    }

    // 카트 비우기
    await dbClient.query(
      `DELETE FROM "W5_cart_items" WHERE user_id = $1`,
      [userId]
    );

    await dbClient.query('COMMIT');

    // 응답: order 요약 + (선택) 토스가 응답에 준 일부 메타
    return res.status(200).json({
      ok: true,
      order: {
        id: orderDbId,
        order_number: orderNumber,
        total: serverAmount,
        status: 'paid',
        created_at: orderRow.created_at,
      },
    });
  } catch (err) {
    await dbClient.query('ROLLBACK').catch(() => {});
    // ⚠ 토스 측에서는 결제가 승인된 상태인데 DB 저장은 실패한 상황.
    //   paymentKey/orderId/amount/code 를 같이 찍어 운영자가 토스 콘솔에서 추적 가능하게.
    console.error(
      `[CRITICAL] confirm: db tx error after toss approval — user=${userId} orderId=${orderId} paymentKey=${paymentKey} amount=${serverAmount}\n  detail:`,
      err && (err.message || err)
    );
    return res.status(500).json({
      error: '결제는 승인됐지만 주문 저장에 실패했습니다. 고객센터로 문의해주세요.',
      // 디버그용 단서 (운영에선 빼야 함)
      detail: err && err.message ? err.message : undefined,
    });
  } finally {
    dbClient.release();
  }
});

// =============================================================================
// 라우트: ImageKit 클라이언트 업로드 인증
// =============================================================================
// 클라이언트가 ImageKit Upload API에 직접 업로드하기 전에 호출.
// 서버는 privateKey로 서명한 (token, expire, signature) 를 발급한다.
// publicKey는 비공개가 아니지만, 어떤 publicKey/urlEndpoint 를 써야 하는지도
// 함께 내려줘서 클라이언트 코드를 단순하게 만든다.
app.get('/api/imagekit/auth', authMiddleware, adminMiddleware, (_req, res) => {
  try {
    if (!imagekit) {
      return res.status(503).json({ error: 'ImageKit이 설정되지 않았습니다' });
    }
    const params = imagekit.getAuthenticationParameters();
    return res.status(200).json({
      ...params,
      publicKey: IK_PUBLIC,
      urlEndpoint: IK_ENDPOINT,
    });
  } catch (err) {
    console.error('GET /api/imagekit/auth error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// =============================================================================
// 라우트: 관리자 상품 CRUD
// =============================================================================

function validateProductPayload(body, { partial = false } = {}) {
  const out = {};
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      errors.push('상품명을 입력해주세요');
    } else if (body.name.length > 200) {
      errors.push('상품명은 200자 이하여야 합니다');
    } else {
      out.name = body.name.trim();
    }
  }

  if (!partial || body.price !== undefined) {
    const p = Number(body.price);
    if (!Number.isFinite(p) || p < 0 || !Number.isInteger(p)) {
      errors.push('가격은 0 이상의 정수여야 합니다');
    } else {
      out.price = p;
    }
  }

  if (body.image_url !== undefined) {
    if (body.image_url === null || body.image_url === '') {
      out.image_url = null;
    } else if (typeof body.image_url !== 'string') {
      errors.push('image_url 형식이 올바르지 않습니다');
    } else {
      out.image_url = body.image_url.trim();
    }
  }

  if (body.description !== undefined) {
    if (body.description === null) {
      out.description = null;
    } else if (typeof body.description !== 'string') {
      errors.push('description 형식이 올바르지 않습니다');
    } else {
      out.description = body.description;
    }
  }

  return { values: out, errors };
}

function rowToProduct(row) {
  return {
    id: Number(row.id),
    name: row.name,
    price: row.price,
    image_url: row.image_url,
    description: row.description,
  };
}

// 상품 추가
app.post('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { values, errors } = validateProductPayload(req.body || {}, { partial: false });
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const result = await pool.query(
      `INSERT INTO "W5_products" (name, price, image_url, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, price, image_url, description`,
      [values.name, values.price, values.image_url ?? null, values.description ?? null]
    );

    return res.status(201).json({ product: rowToProduct(result.rows[0]) });
  } catch (err) {
    console.error('POST /api/admin/products error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 상품 수정 (부분 업데이트)
app.patch('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
    }

    const { values, errors } = validateProductPayload(req.body || {}, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }
    const fields = Object.keys(values);
    if (fields.length === 0) {
      return res.status(400).json({ error: '변경할 내용이 없습니다' });
    }

    const setClauses = fields.map((f, i) => `${f} = $${i + 1}`);
    const params = fields.map((f) => values[f]);
    setClauses.push(`updated_at = NOW()`);

    const sql = `
      UPDATE "W5_products"
         SET ${setClauses.join(', ')}
       WHERE id = $${fields.length + 1}
       RETURNING id, name, price, image_url, description
    `;

    const result = await pool.query(sql, [...params, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
    }

    return res.status(200).json({ product: rowToProduct(result.rows[0]) });
  } catch (err) {
    console.error('PATCH /api/admin/products/:id error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 상품 삭제
app.delete('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
    }

    // 장바구니의 해당 상품도 함께 삭제 (FK CASCADE 라 자동이지만 명시적으로 카운트 확인)
    const result = await pool.query(
      `DELETE FROM "W5_products" WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/products/:id error:', err);
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
