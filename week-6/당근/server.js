// ============================================================
// 당근마켓 클론 백엔드 (week-6)
// - Express + Postgres(Supabase) + JWT + bcrypt + ImageKit
// - 같은 폴더의 index.html 정적 서빙
// ============================================================

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const ImageKit = require('imagekit');

// ------------------------------------------------------------
// 1. App / 환경변수
// ------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();

if (!JWT_SECRET) {
  console.warn('[warn] JWT_SECRET이 비어있습니다. .env에 채워주세요.');
}
if (!DATABASE_URL) {
  console.warn('[warn] DATABASE_URL이 비어있습니다. .env에 채워주세요.');
}

// ------------------------------------------------------------
// 2. Postgres pool (전역 1개 재사용)
// ------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[pg pool error]', err);
});

// ------------------------------------------------------------
// 3. ImageKit SDK
// ------------------------------------------------------------
const imagekit = new ImageKit({
  publicKey: (process.env.IMAGEKIT_PUBLIC_KEY || '').trim(),
  privateKey: (process.env.IMAGEKIT_PRIVATE_KEY || '').trim(),
  urlEndpoint: (process.env.IMAGEKIT_URL_ENDPOINT || '').trim(),
});

// ------------------------------------------------------------
// 4. 미들웨어
// ------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// JWT 인증 미들웨어
function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.id,
      email: payload.email,
      nickname: payload.nickname,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, nickname: user.nickname },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ============================================================
// API: 인증
// ============================================================

// 회원가입
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, nickname, region } = req.body || {};
  if (!email || !password || !nickname || !region) {
    return res.status(400).json({ error: 'email, password, nickname, region는 필수입니다.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
  }
  try {
    const dup = await pool.query(
      'SELECT id FROM "W6_karrot_users" WHERE email = $1',
      [email]
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const insert = await pool.query(
      `INSERT INTO "W6_karrot_users" (email, password_hash, nickname, region)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, nickname, region, manner_temp, profile_image_url, created_at`,
      [email, password_hash, nickname, region]
    );
    const user = insert.rows[0];
    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (err) {
    console.error('[signup]', err);
    return res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email과 password는 필수입니다.' });
  }
  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, nickname, region, manner_temp, profile_image_url, created_at
       FROM "W6_karrot_users" WHERE email = $1`,
      [email]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const row = result.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const user = {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      region: row.region,
      manner_temp: row.manner_temp,
      profile_image_url: row.profile_image_url,
      created_at: row.created_at,
    };
    const token = signToken(user);
    return res.json({ token, user });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

// 내 정보
app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, nickname, region, manner_temp, profile_image_url, created_at
       FROM "W6_karrot_users" WHERE id = $1`,
      [req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// 내 정보 수정 (nickname, region)
app.patch('/api/auth/me', authRequired, async (req, res) => {
  const { nickname, region } = req.body || {};
  const sets = [];
  const params = [];
  if (nickname !== undefined) {
    if (typeof nickname !== 'string' || nickname.trim().length < 2) {
      return res.status(400).json({ error: '닉네임은 2자 이상이어야 합니다.' });
    }
    params.push(nickname.trim());
    sets.push(`nickname = $${params.length}`);
  }
  if (region !== undefined) {
    if (typeof region !== 'string' || !region.trim()) {
      return res.status(400).json({ error: 'region 값이 올바르지 않습니다.' });
    }
    params.push(region.trim());
    sets.push(`region = $${params.length}`);
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: '변경할 값이 없습니다.' });
  }
  params.push(req.user.id);
  try {
    const sql = `UPDATE "W6_karrot_users" SET ${sets.join(', ')}
                 WHERE id = $${params.length}
                 RETURNING id, email, nickname, region, manner_temp, profile_image_url, created_at`;
    const result = await pool.query(sql, params);
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('[me update]', err);
    return res.status(500).json({ error: '내 정보 수정에 실패했습니다.' });
  }
});

// ============================================================
// API: 상품
// ============================================================

// 상품 목록 (region, q, category, sellerId 필터)
app.get('/api/products', async (req, res) => {
  const { region, q, category, sellerId } = req.query;
  const where = [];
  const params = [];
  if (region) {
    params.push(region);
    where.push(`p.region = $${params.length}`);
  }
  if (category) {
    params.push(category);
    where.push(`p.category = $${params.length}`);
  }
  if (sellerId) {
    params.push(sellerId);
    where.push(`p.seller_id = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(p.title ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const sql = `
      SELECT
        p.id, p.seller_id, p.title, p.price, p.category, p.description,
        p.region, p.status, p.view_count, p.created_at, p.updated_at,
        u.nickname AS seller_nickname,
        u.profile_image_url AS seller_profile_image_url,
        u.manner_temp AS seller_manner_temp,
        COALESCE(
          (SELECT json_agg(
                    json_build_object(
                      'id', img.id,
                      'url', img.image_url,
                      'fileId', img.imagekit_file_id,
                      'sort_order', img.sort_order
                    ) ORDER BY img.sort_order
                  )
           FROM "W6_karrot_product_images" img
           WHERE img.product_id = p.id),
          '[]'::json
        ) AS images,
        (SELECT COUNT(*)::int FROM "W6_karrot_likes" l WHERE l.product_id = p.id) AS like_count
      FROM "W6_karrot_products" p
      JOIN "W6_karrot_users" u ON u.id = p.seller_id
      ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT 200
    `;
    const result = await pool.query(sql, params);
    return res.json({ products: result.rows });
  } catch (err) {
    console.error('[products list]', err);
    return res.status(500).json({ error: '상품 목록을 불러오지 못했습니다.' });
  }
});

// 상품 상세 (view_count++)
app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // view_count 증가 (실패해도 상세는 반환)
    await pool.query(
      'UPDATE "W6_karrot_products" SET view_count = view_count + 1 WHERE id = $1',
      [id]
    );

    const sql = `
      SELECT
        p.id, p.seller_id, p.title, p.price, p.category, p.description,
        p.region, p.status, p.view_count, p.created_at, p.updated_at,
        u.nickname AS seller_nickname,
        u.profile_image_url AS seller_profile_image_url,
        u.manner_temp AS seller_manner_temp,
        u.region AS seller_region,
        COALESCE(
          (SELECT json_agg(
                    json_build_object(
                      'id', img.id,
                      'url', img.image_url,
                      'fileId', img.imagekit_file_id,
                      'sort_order', img.sort_order
                    ) ORDER BY img.sort_order
                  )
           FROM "W6_karrot_product_images" img
           WHERE img.product_id = p.id),
          '[]'::json
        ) AS images,
        (SELECT COUNT(*)::int FROM "W6_karrot_likes" l WHERE l.product_id = p.id) AS like_count
      FROM "W6_karrot_products" p
      JOIN "W6_karrot_users" u ON u.id = p.seller_id
      WHERE p.id = $1
    `;
    const result = await pool.query(sql, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }
    return res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('[product detail]', err);
    return res.status(500).json({ error: '상품을 불러오지 못했습니다.' });
  }
});

// 상품 등록 (트랜잭션: products + product_images)
app.post('/api/products', authRequired, async (req, res) => {
  const { title, price, category, description, region, images } = req.body || {};
  if (!title || price === undefined || !category || !description || !region) {
    return res.status(400).json({ error: 'title, price, category, description, region는 필수입니다.' });
  }
  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: '이미지를 1장 이상 등록해주세요.' });
  }
  if (images.length > 3) {
    return res.status(400).json({ error: '이미지는 최대 3장까지 등록할 수 있습니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productInsert = await client.query(
      `INSERT INTO "W6_karrot_products" (seller_id, title, price, category, description, region)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, seller_id, title, price, category, description, region, status, view_count, created_at, updated_at`,
      [req.user.id, title, Number(price) || 0, category, description, region]
    );
    const product = productInsert.rows[0];

    for (let i = 0; i < images.length; i++) {
      const img = images[i] || {};
      if (!img.url) continue;
      await client.query(
        `INSERT INTO "W6_karrot_product_images" (product_id, image_url, imagekit_file_id, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [product.id, img.url, img.fileId || null, i]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ product });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[product create]', err);
    return res.status(500).json({ error: '상품 등록에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// 상품 수정 (본인만)
app.patch('/api/products/:id', authRequired, async (req, res) => {
  const { id } = req.params;
  const { title, price, category, description, region, status, images } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 소유권 체크
    const owner = await client.query(
      'SELECT seller_id FROM "W6_karrot_products" WHERE id = $1',
      [id]
    );
    if (owner.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }
    if (owner.rows[0].seller_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: '본인의 상품만 수정할 수 있습니다.' });
    }

    // 동적 UPDATE 빌드
    const sets = [];
    const params = [];
    const push = (col, val) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (title !== undefined) push('title', title);
    if (price !== undefined) push('price', Number(price) || 0);
    if (category !== undefined) push('category', category);
    if (description !== undefined) push('description', description);
    if (region !== undefined) push('region', region);
    if (status !== undefined) {
      if (!['selling', 'reserved', 'sold'].includes(status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'status 값이 올바르지 않습니다.' });
      }
      push('status', status);
    }

    if (sets.length > 0) {
      params.push(id);
      await client.query(
        `UPDATE "W6_karrot_products" SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    // 이미지 갱신 (배열이 들어왔을 때만)
    if (Array.isArray(images)) {
      if (images.length > 3) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '이미지는 최대 3장까지 등록할 수 있습니다.' });
      }
      await client.query(
        'DELETE FROM "W6_karrot_product_images" WHERE product_id = $1',
        [id]
      );
      for (let i = 0; i < images.length; i++) {
        const img = images[i] || {};
        if (!img.url) continue;
        await client.query(
          `INSERT INTO "W6_karrot_product_images" (product_id, image_url, imagekit_file_id, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [id, img.url, img.fileId || null, i]
        );
      }
    }

    await client.query('COMMIT');

    // 갱신된 상품 반환
    const after = await pool.query(
      `SELECT * FROM "W6_karrot_products" WHERE id = $1`,
      [id]
    );
    return res.json({ product: after.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[product update]', err);
    return res.status(500).json({ error: '상품 수정에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// 상품 삭제 (본인만)
app.delete('/api/products/:id', authRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const owner = await pool.query(
      'SELECT seller_id FROM "W6_karrot_products" WHERE id = $1',
      [id]
    );
    if (owner.rowCount === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }
    if (owner.rows[0].seller_id !== req.user.id) {
      return res.status(403).json({ error: '본인의 상품만 삭제할 수 있습니다.' });
    }
    await pool.query('DELETE FROM "W6_karrot_products" WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[product delete]', err);
    return res.status(500).json({ error: '상품 삭제에 실패했습니다.' });
  }
});

// ============================================================
// API: 관심 (좋아요 토글)
// ============================================================

app.post('/api/products/:id/like', authRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const exists = await pool.query(
      'SELECT id FROM "W6_karrot_likes" WHERE user_id = $1 AND product_id = $2',
      [req.user.id, id]
    );
    let liked;
    if (exists.rowCount > 0) {
      await pool.query(
        'DELETE FROM "W6_karrot_likes" WHERE user_id = $1 AND product_id = $2',
        [req.user.id, id]
      );
      liked = false;
    } else {
      // 상품 존재 확인
      const prod = await pool.query(
        'SELECT id FROM "W6_karrot_products" WHERE id = $1',
        [id]
      );
      if (prod.rowCount === 0) {
        return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
      }
      await pool.query(
        'INSERT INTO "W6_karrot_likes" (user_id, product_id) VALUES ($1, $2)',
        [req.user.id, id]
      );
      liked = true;
    }
    const count = await pool.query(
      'SELECT COUNT(*)::int AS c FROM "W6_karrot_likes" WHERE product_id = $1',
      [id]
    );
    return res.json({ liked, likeCount: count.rows[0].c });
  } catch (err) {
    console.error('[like toggle]', err);
    return res.status(500).json({ error: '관심 처리에 실패했습니다.' });
  }
});

// 내가 찜한 상품 목록
app.get('/api/me/likes', authRequired, async (req, res) => {
  try {
    const sql = `
      SELECT
        p.id, p.seller_id, p.title, p.price, p.category, p.description,
        p.region, p.status, p.view_count, p.created_at, p.updated_at,
        u.nickname AS seller_nickname,
        l.created_at AS liked_at,
        COALESCE(
          (SELECT json_agg(
                    json_build_object(
                      'id', img.id,
                      'url', img.image_url,
                      'fileId', img.imagekit_file_id,
                      'sort_order', img.sort_order
                    ) ORDER BY img.sort_order
                  )
           FROM "W6_karrot_product_images" img
           WHERE img.product_id = p.id),
          '[]'::json
        ) AS images
      FROM "W6_karrot_likes" l
      JOIN "W6_karrot_products" p ON p.id = l.product_id
      JOIN "W6_karrot_users" u ON u.id = p.seller_id
      WHERE l.user_id = $1
      ORDER BY l.created_at DESC
    `;
    const result = await pool.query(sql, [req.user.id]);
    return res.json({ products: result.rows });
  } catch (err) {
    console.error('[my likes]', err);
    return res.status(500).json({ error: '관심 목록을 불러오지 못했습니다.' });
  }
});

// ============================================================
// API: 채팅
// ============================================================

// 채팅방 생성/조회 (productId 기준)
app.post('/api/chats', authRequired, async (req, res) => {
  const { productId } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'productId는 필수입니다.' });

  try {
    const prod = await pool.query(
      'SELECT id, seller_id FROM "W6_karrot_products" WHERE id = $1',
      [productId]
    );
    if (prod.rowCount === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }
    const sellerId = prod.rows[0].seller_id;
    if (sellerId === req.user.id) {
      return res.status(400).json({ error: '본인 상품에는 채팅을 시작할 수 없습니다.' });
    }

    // 기존 방
    const existing = await pool.query(
      `SELECT * FROM "W6_karrot_chat_rooms"
       WHERE product_id = $1 AND buyer_id = $2`,
      [productId, req.user.id]
    );
    if (existing.rowCount > 0) {
      return res.json({ room: existing.rows[0] });
    }

    const created = await pool.query(
      `INSERT INTO "W6_karrot_chat_rooms" (product_id, buyer_id, seller_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [productId, req.user.id, sellerId]
    );
    return res.status(201).json({ room: created.rows[0] });
  } catch (err) {
    console.error('[chat create]', err);
    return res.status(500).json({ error: '채팅방 생성에 실패했습니다.' });
  }
});

// 내 채팅방 목록
app.get('/api/chats', authRequired, async (req, res) => {
  try {
    const sql = `
      SELECT
        r.id, r.product_id, r.buyer_id, r.seller_id,
        r.last_message, r.last_message_at, r.created_at,
        p.title         AS product_title,
        p.price         AS product_price,
        p.status        AS product_status,
        (SELECT image_url FROM "W6_karrot_product_images"
           WHERE product_id = p.id ORDER BY sort_order LIMIT 1) AS product_thumbnail,
        CASE WHEN r.buyer_id = $1 THEN r.seller_id ELSE r.buyer_id END AS other_id,
        CASE WHEN r.buyer_id = $1 THEN su.nickname ELSE bu.nickname END AS other_nickname,
        CASE WHEN r.buyer_id = $1 THEN su.profile_image_url ELSE bu.profile_image_url END AS other_profile_image_url
      FROM "W6_karrot_chat_rooms" r
      JOIN "W6_karrot_products" p ON p.id = r.product_id
      JOIN "W6_karrot_users" bu   ON bu.id = r.buyer_id
      JOIN "W6_karrot_users" su   ON su.id = r.seller_id
      WHERE r.buyer_id = $1 OR r.seller_id = $1
      ORDER BY COALESCE(r.last_message_at, r.created_at) DESC
    `;
    const result = await pool.query(sql, [req.user.id]);
    return res.json({ rooms: result.rows });
  } catch (err) {
    console.error('[chat list]', err);
    return res.status(500).json({ error: '채팅방 목록을 불러오지 못했습니다.' });
  }
});

// 메시지 목록 (참여자만)
app.get('/api/chats/:roomId/messages', authRequired, async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await pool.query(
      'SELECT buyer_id, seller_id FROM "W6_karrot_chat_rooms" WHERE id = $1',
      [roomId]
    );
    if (room.rowCount === 0) {
      return res.status(404).json({ error: '채팅방을 찾을 수 없습니다.' });
    }
    const { buyer_id, seller_id } = room.rows[0];
    if (req.user.id !== buyer_id && req.user.id !== seller_id) {
      return res.status(403).json({ error: '참여자만 접근할 수 있습니다.' });
    }
    const result = await pool.query(
      `SELECT id, room_id, sender_id, content, is_read, created_at
       FROM "W6_karrot_messages"
       WHERE room_id = $1
       ORDER BY created_at ASC`,
      [roomId]
    );
    return res.json({ messages: result.rows });
  } catch (err) {
    console.error('[messages list]', err);
    return res.status(500).json({ error: '메시지를 불러오지 못했습니다.' });
  }
});

// 메시지 전송
app.post('/api/chats/:roomId/messages', authRequired, async (req, res) => {
  const { roomId } = req.params;
  const { content } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '메시지 내용이 비어있습니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const room = await client.query(
      'SELECT buyer_id, seller_id FROM "W6_karrot_chat_rooms" WHERE id = $1',
      [roomId]
    );
    if (room.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '채팅방을 찾을 수 없습니다.' });
    }
    const { buyer_id, seller_id } = room.rows[0];
    if (req.user.id !== buyer_id && req.user.id !== seller_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: '참여자만 메시지를 보낼 수 있습니다.' });
    }

    const inserted = await client.query(
      `INSERT INTO "W6_karrot_messages" (room_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, room_id, sender_id, content, is_read, created_at`,
      [roomId, req.user.id, content]
    );

    await client.query(
      `UPDATE "W6_karrot_chat_rooms"
       SET last_message = $1, last_message_at = NOW()
       WHERE id = $2`,
      [content, roomId]
    );

    await client.query('COMMIT');
    return res.status(201).json({ message: inserted.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[message send]', err);
    return res.status(500).json({ error: '메시지 전송에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// ============================================================
// API: ImageKit 인증 토큰
// ============================================================

app.get('/api/imagekit/auth', authRequired, (req, res) => {
  try {
    const params = imagekit.getAuthenticationParameters();
    // 클라이언트 직업로드에 필요한 publicKey/urlEndpoint를 함께 내려줍니다.
    return res.json({
      ...params, // { token, expire, signature }
      publicKey: (process.env.IMAGEKIT_PUBLIC_KEY || '').trim(),
      urlEndpoint: (process.env.IMAGEKIT_URL_ENDPOINT || '').trim(),
    });
  } catch (err) {
    console.error('[imagekit auth]', err);
    return res.status(500).json({ error: 'ImageKit 인증 토큰 발급 실패' });
  }
});

// ============================================================
// 정적 파일 서빙 (API 라우트 뒤에 위치)
// ============================================================
app.use(express.static(__dirname));

// SPA fallback — /api/* 는 위에서 처리됐으니 나머지는 index.html
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 마지막 안전망: 알 수 없는 라우트
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 전역 에러 핸들러
app.use((err, _req, res, _next) => {
  console.error('[uncaught]', err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

// ============================================================
// 서버 시작 (로컬 직접 실행 시에만 listen, Vercel에서는 export만)
// ============================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[server] 당근 클론 서버 실행 중: http://localhost:${PORT}`);
  });
}

module.exports = app;
