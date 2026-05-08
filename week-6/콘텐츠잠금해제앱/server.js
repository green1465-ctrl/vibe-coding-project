// =====================================================================
// 유료 뉴스레터 콘텐츠 잠금 해제 앱 — Express 서버
//   - 정적 파일(index.html) 서빙
//   - 회원가입/로그인 (JWT)
//   - 콘텐츠 카탈로그 / 접근 권한 조회
//   - TossPayments 결제 승인 + 구매 이력
// =====================================================================

require('dotenv').config();

const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------
// 환경변수
// ---------------------------------------------------------------------
const PORT            = Number(process.env.PORT) || 3000;
const DATABASE_URL    = (process.env.DATABASE_URL || '').trim();
const JWT_SECRET      = (process.env.JWT_SECRET || '').trim();
const TOSS_SECRET_KEY = (process.env.TOSS_SECRET_KEY || '').trim();

if (!DATABASE_URL)    console.warn('[warn] DATABASE_URL 이 비어 있습니다. .env 를 확인하세요.');
if (!JWT_SECRET)      console.warn('[warn] JWT_SECRET 이 비어 있습니다. .env 를 확인하세요.');
if (!TOSS_SECRET_KEY) console.warn('[warn] TOSS_SECRET_KEY 가 비어 있습니다. 결제 호출 시 실패합니다.');

// ---------------------------------------------------------------------
// DB 풀 (Supabase pooler 6543 포트, pgBouncer 호환)
// ---------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[pg] idle client error:', err);
});

// ---------------------------------------------------------------------
// Express 기본 설정
// ---------------------------------------------------------------------
const app = express();
app.use(express.json());
// 같은 폴더의 index.html 을 정적 노출 (root '/')
app.use(express.static(__dirname));

// ---------------------------------------------------------------------
// 유틸 / 미들웨어
// ---------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) {
    return res.status(401).json({ error: '로그인이 필요합니다' });
  }
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다' });
  }
}

// 라우트 핸들러를 try/catch 없이 쓸 수 있게 감싸는 헬퍼
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------
// 인증 라우트
// ---------------------------------------------------------------------
app.post('/api/auth/signup', ah(async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!email || !EMAIL_RE.test(String(email))) {
    return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다' });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다' });
  }

  const dup = await pool.query(
    'SELECT id FROM "W6_unlock_users" WHERE email = $1',
    [email]
  );
  if (dup.rowCount > 0) {
    return res.status(409).json({ error: '이미 가입된 이메일입니다' });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const ins = await pool.query(
    `INSERT INTO "W6_unlock_users" (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, email, name`,
    [email, passwordHash, name || null]
  );
  const user = ins.rows[0];
  const token = signToken(user);
  res.status(201).json({ token, user });
}));

app.post('/api/auth/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요' });
  }

  const r = await pool.query(
    `SELECT id, email, name, password_hash
       FROM "W6_unlock_users"
      WHERE email = $1`,
    [email]
  );
  if (r.rowCount === 0) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
  }
  const row = r.rows[0];
  const ok = await bcrypt.compare(String(password), row.password_hash);
  if (!ok) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
  }

  const user = { id: row.id, email: row.email, name: row.name };
  const token = signToken(user);
  res.json({ token, user });
}));

app.get('/api/me', requireAuth, ah(async (req, res) => {
  const r = await pool.query(
    'SELECT id, email, name FROM "W6_unlock_users" WHERE id = $1',
    [req.user.id]
  );
  if (r.rowCount === 0) {
    return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
  }
  res.json({ user: r.rows[0] });
}));

// ---------------------------------------------------------------------
// 공개 설정 (Toss 클라이언트 키 등)
// ---------------------------------------------------------------------
app.get('/api/config', (_req, res) => {
  res.json({ tossClientKey: process.env.TOSS_CLIENT_KEY || '' });
});

// ---------------------------------------------------------------------
// 콘텐츠 라우트
// ---------------------------------------------------------------------
app.get('/api/contents', ah(async (_req, res) => {
  const r = await pool.query(
    `SELECT id, title, category, author, price, is_premium, published_at
       FROM "W6_unlock_contents"
       ORDER BY published_at DESC NULLS LAST, id ASC`
  );
  res.json({
    contents: r.rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      author: row.author,
      price: row.price,
      isPremium: row.is_premium,
      publishedAt: row.published_at,
    })),
  });
}));

app.get('/api/contents/:id/access', requireAuth, ah(async (req, res) => {
  const { id } = req.params;

  const c = await pool.query(
    `SELECT id, price, is_premium FROM "W6_unlock_contents" WHERE id = $1`,
    [id]
  );
  if (c.rowCount === 0) {
    return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다' });
  }
  const content = c.rows[0];

  if (!content.is_premium) {
    return res.json({ unlocked: true, reason: 'free' });
  }

  const p = await pool.query(
    `SELECT paid_at
       FROM "W6_unlock_purchases"
      WHERE user_id = $1 AND content_id = $2 AND status = 'paid'
      LIMIT 1`,
    [req.user.id, id]
  );
  if (p.rowCount > 0) {
    return res.json({
      unlocked: true,
      reason: 'purchased',
      purchasedAt: p.rows[0].paid_at,
    });
  }

  res.json({ unlocked: false, price: content.price });
}));

// ---------------------------------------------------------------------
// 결제 라우트
// ---------------------------------------------------------------------
app.post('/api/payments/confirm', requireAuth, ah(async (req, res) => {
  const { paymentKey, orderId, amount, contentId } = req.body || {};

  if (!paymentKey || !orderId || !contentId || typeof amount !== 'number') {
    return res.status(400).json({
      error: 'paymentKey, orderId, amount(number), contentId 가 필요합니다',
    });
  }

  // 1) 가격 검증 (토스 호출 전에 반드시)
  const cr = await pool.query(
    `SELECT id, price, is_premium FROM "W6_unlock_contents" WHERE id = $1`,
    [contentId]
  );
  if (cr.rowCount === 0) {
    return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다' });
  }
  const content = cr.rows[0];
  if (!content.is_premium) {
    return res.status(400).json({ error: '무료 콘텐츠는 결제할 수 없습니다' });
  }
  if (Number(amount) !== Number(content.price)) {
    return res.status(400).json({
      error: '결제 금액이 콘텐츠 가격과 일치하지 않습니다',
      expected: content.price,
      received: amount,
    });
  }

  // 2) 토스 승인 호출 (Node 18+ 글로벌 fetch)
  const basic = Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');
  let tossRes, tossJson;
  try {
    tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    tossJson = await tossRes.json().catch(() => ({}));
  } catch (err) {
    console.error('[toss] network error:', err);
    return res.status(502).json({ error: '결제 승인 서버에 연결할 수 없습니다' });
  }

  if (!tossRes.ok) {
    // 토스가 4xx/5xx → 그대로 전달, purchases INSERT 하지 않음
    return res.status(tossRes.status).json({
      error: tossJson.message || '결제 승인 실패',
      code: tossJson.code,
      toss: tossJson,
    });
  }

  // 3) purchases INSERT
  const method    = tossJson.method || null;
  const cardBrand = tossJson.card?.issuerCode || tossJson.card?.cardType || null;
  const cardNum   = tossJson.card?.number ? String(tossJson.card.number) : null;
  const cardLast4 = cardNum ? cardNum.replace(/\D/g, '').slice(-4) : null;
  const paidAt    = tossJson.approvedAt || new Date().toISOString();

  try {
    const ins = await pool.query(
      `INSERT INTO "W6_unlock_purchases"
         (user_id, content_id, order_id, payment_key, amount,
          method, card_brand, card_last4, status, raw_response, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'paid', $9, $10)
       RETURNING id, content_id, amount, method, card_brand, card_last4, paid_at`,
      [
        req.user.id, contentId, orderId, paymentKey, amount,
        method, cardBrand, cardLast4, tossJson, paidAt,
      ]
    );
    const row = ins.rows[0];
    return res.json({
      ok: true,
      purchase: {
        id: row.id,
        contentId: row.content_id,
        amount: row.amount,
        method: row.method,
        cardBrand: row.card_brand,
        cardLast4: row.card_last4,
        paidAt: row.paid_at,
      },
    });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: '이미 구매한 콘텐츠입니다' });
    }
    throw err;
  }
}));

// ---------------------------------------------------------------------
// 구매 이력 라우트
// ---------------------------------------------------------------------
app.get('/api/purchases', requireAuth, ah(async (req, res) => {
  const r = await pool.query(
    `SELECT p.id,
            p.content_id,
            c.title,
            c.category,
            c.author,
            p.amount,
            p.card_brand,
            p.card_last4,
            p.paid_at
       FROM "W6_unlock_purchases" p
       JOIN "W6_unlock_contents"  c ON c.id = p.content_id
      WHERE p.user_id = $1
        AND p.status = 'paid'
      ORDER BY p.paid_at DESC`,
    [req.user.id]
  );
  res.json({
    purchases: r.rows.map((row) => ({
      id: row.id,
      contentId: row.content_id,
      title: row.title,
      category: row.category,
      author: row.author,
      amount: row.amount,
      cardBrand: row.card_brand,
      cardLast4: row.card_last4,
      paidAt: row.paid_at,
    })),
  });
}));

// ---------------------------------------------------------------------
// 에러 처리
// ---------------------------------------------------------------------
// API not found
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API를 찾을 수 없습니다' });
});

// 공용 에러 핸들러
app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: '서버 오류가 발생했습니다' });
});

// ---------------------------------------------------------------------
// 시작 / 종료 (로컬 실행 시에만, Vercel serverless에서는 export만)
// ---------------------------------------------------------------------
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log('Server running on http://localhost:' + PORT);
  });

  const shutdown = (sig) => {
    console.log(`\n[${sig}] shutting down...`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;
