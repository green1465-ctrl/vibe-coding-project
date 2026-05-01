// =====================================================
// W5 Community — Express server (with Auth + title)
//   - Static: index.html (same dir)
//   - Public API:
//       GET  /api/posts            (list — title, no full content)
//       GET  /api/posts/:id        (detail — full row incl. content)
//       POST /api/posts/:id/like
//   - Auth API:
//       POST /api/auth/signup
//       POST /api/auth/login
//       GET  /api/auth/me
//   - Authenticated API:
//       POST   /api/posts          (create — own user_id)
//       PATCH  /api/posts/:id      (owner only, no legacy)
//       DELETE /api/posts/:id      (owner only, no legacy)
//   - DB: Supabase Postgres via pg.Pool (DATABASE_URL from .env)
//   - JWT: HS256, 7d expiry, secret from .env
// =====================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ---- Config ----------------------------------------------------------------
const PORT = process.env.PORT || 3008;
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();

if (!DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL is not set. Create a .env file with DATABASE_URL=...');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET is not set. Add JWT_SECRET=... to your .env file.');
  process.exit(1);
}

const ALLOWED_CATEGORIES = ['free', 'study', 'food', 'vent'];
const POSTS_TABLE = '"W5_community_posts"';
const USERS_TABLE = '"W5_community_users"';

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = '7d';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ---- DB Pool ---------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[pg pool] unexpected error on idle client:', err);
});

// ---- App -------------------------------------------------------------------
const app = express();

app.use(express.json());

// Serve index.html and any other static assets in the project root
app.use(express.static(path.join(__dirname)));

// Explicit fallback so '/' works even on Vercel where path resolution differs
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---- Helpers ---------------------------------------------------------------
function isValidCategory(c) {
  return ALLOWED_CATEGORIES.includes(c);
}

function signToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

// Extract & verify Bearer token from Authorization header.
// Returns the decoded payload, or null on any failure.
function readBearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  if (typeof h !== 'string' || !h.startsWith('Bearer ')) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// requireAuth: 401 if no/invalid token; otherwise sets req.user.
function requireAuth(req, res, next) {
  const payload = readBearer(req);
  if (!payload) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  req.user = {
    id: payload.uid,
    email: payload.email,
    displayName: payload.displayName,
  };
  next();
}

// optionalAuth: sets req.user if a valid token is present, else continues.
function optionalAuth(req, _res, next) {
  const payload = readBearer(req);
  if (payload) {
    req.user = {
      id: payload.uid,
      email: payload.email,
      displayName: payload.displayName,
    };
  }
  next();
}

// ---- Auth API: POST /api/auth/signup ---------------------------------------
app.post('/api/auth/signup', async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  let displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (!displayName) {
    displayName = email.split('@')[0];
  }
  if (displayName.length > 40) {
    return res.status(400).json({ error: 'displayName too long (max 40).' });
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO ${USERS_TABLE} (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, created_at`,
      [email, hash, displayName]
    );
    const user = result.rows[0];
    const token = signToken(user);
    return res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error('[POST /api/auth/signup] error:', err);
    return res.status(500).json({ error: 'Failed to sign up.' });
  }
});

// ---- Auth API: POST /api/auth/login ----------------------------------------
app.post('/api/auth/login', async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!EMAIL_RE.test(email) || typeof password !== 'string' || password.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, display_name
         FROM ${USERS_TABLE}
        WHERE email = $1`,
      [email]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const row = result.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken(row);
    return res.json({ token, user: publicUser(row) });
  } catch (err) {
    console.error('[POST /api/auth/login] error:', err);
    return res.status(500).json({ error: 'Failed to log in.' });
  }
});

// ---- Auth API: GET /api/auth/me --------------------------------------------
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    // Re-fetch from DB so renamed displayName / deleted users are reflected.
    const result = await pool.query(
      `SELECT id, email, display_name FROM ${USERS_TABLE} WHERE id = $1`,
      [req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Account no longer exists.' });
    }
    return res.json(publicUser(result.rows[0]));
  } catch (err) {
    console.error('[GET /api/auth/me] error:', err);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// ---- Posts API: GET /api/posts ---------------------------------------------
// List view — returns title + metadata only (NOT the full content body).
// Optional ?category=free|study|food|vent|all
app.get('/api/posts', async (req, res) => {
  const { category } = req.query;

  // 60-char preview computed in SQL so client can show a teaser if it wants
  const SELECT_LIST = `
    SELECT id,
           title,
           nickname,
           category,
           likes,
           created_at,
           user_id,
           CASE
             WHEN char_length(content) > 60 THEN substr(content, 1, 60) || '...'
             ELSE content
           END AS content_preview
      FROM ${POSTS_TABLE}
  `;

  try {
    let result;
    if (!category || category === 'all') {
      result = await pool.query(`${SELECT_LIST} ORDER BY created_at DESC`);
    } else {
      if (!isValidCategory(category)) {
        return res.status(400).json({
          error: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(', ')} or 'all'.`,
        });
      }
      result = await pool.query(
        `${SELECT_LIST} WHERE category = $1 ORDER BY created_at DESC`,
        [category]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /api/posts] DB error:', err);
    res.status(500).json({ error: 'Failed to fetch posts.' });
  }
});

// ---- Posts API: GET /api/posts/:id (public, full row) ----------------------
app.get('/api/posts/:id', async (req, res) => {
  const idParam = req.params.id;
  if (!/^\d+$/.test(idParam)) {
    return res.status(400).json({ error: 'id must be a positive integer.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, title, nickname, category, content, likes, created_at, user_id
         FROM ${POSTS_TABLE}
        WHERE id = $1`,
      [idParam]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[GET /api/posts/:id] DB error:', err);
    res.status(500).json({ error: 'Failed to fetch post.' });
  }
});

// ---- Posts API: POST /api/posts (auth required) ----------------------------
app.post('/api/posts', requireAuth, async (req, res) => {
  const body = req.body || {};
  const rawNickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  const rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
  const rawContent = typeof body.content === 'string' ? body.content.trim() : '';
  const category = body.category;

  if (rawTitle.length < 1 || rawTitle.length > 80) {
    return res.status(400).json({ error: 'title must be 1 to 80 characters.' });
  }
  if (rawContent.length < 1 || rawContent.length > 280) {
    return res.status(400).json({
      error: 'content must be 1 to 280 characters after trimming.',
    });
  }
  if (!isValidCategory(category)) {
    return res.status(400).json({
      error: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`,
    });
  }

  const nickname = rawNickname.length === 0 ? req.user.displayName : rawNickname;

  try {
    const result = await pool.query(
      `INSERT INTO ${POSTS_TABLE} (nickname, category, title, content, user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, nickname, category, content, likes, created_at, user_id`,
      [nickname, category, rawTitle, rawContent, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/posts] DB error:', err);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// ---- Posts API: PATCH /api/posts/:id (owner only) --------------------------
app.patch('/api/posts/:id', requireAuth, async (req, res) => {
  const idParam = req.params.id;
  if (!/^\d+$/.test(idParam)) {
    return res.status(400).json({ error: 'id must be a positive integer.' });
  }

  const body = req.body || {};
  const hasTitle = typeof body.title === 'string';
  const hasContent = typeof body.content === 'string';
  const hasCategory = typeof body.category === 'string';
  const hasNickname = typeof body.nickname === 'string';

  if (!hasTitle && !hasContent && !hasCategory && !hasNickname) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  let nextTitle = null;
  let nextContent = null;
  let nextCategory = null;
  let nextNickname = null;

  if (hasTitle) {
    nextTitle = body.title.trim();
    if (nextTitle.length < 1 || nextTitle.length > 80) {
      return res.status(400).json({ error: 'title must be 1 to 80 characters.' });
    }
  }
  if (hasContent) {
    nextContent = body.content.trim();
    if (nextContent.length < 1 || nextContent.length > 280) {
      return res.status(400).json({
        error: 'content must be 1 to 280 characters after trimming.',
      });
    }
  }
  if (hasCategory) {
    if (!isValidCategory(body.category)) {
      return res.status(400).json({
        error: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`,
      });
    }
    nextCategory = body.category;
  }
  if (hasNickname) {
    const t = body.nickname.trim();
    nextNickname = t.length === 0 ? req.user.displayName : t;
    if (nextNickname.length > 40) {
      return res.status(400).json({ error: 'nickname too long (max 40).' });
    }
  }

  try {
    // Ownership check first.
    const owned = await pool.query(
      `SELECT id, user_id FROM ${POSTS_TABLE} WHERE id = $1`,
      [idParam]
    );
    if (owned.rowCount === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    const row = owned.rows[0];
    if (row.user_id == null) {
      // legacy anonymous post — nobody can edit
      return res.status(403).json({ error: 'Not your post' });
    }
    if (String(row.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not your post' });
    }

    // Build dynamic SET clause.
    const sets = [];
    const args = [];
    let i = 1;
    if (nextTitle != null)    { sets.push(`title = $${i++}`);    args.push(nextTitle); }
    if (nextContent != null)  { sets.push(`content = $${i++}`);  args.push(nextContent); }
    if (nextCategory != null) { sets.push(`category = $${i++}`); args.push(nextCategory); }
    if (nextNickname != null) { sets.push(`nickname = $${i++}`); args.push(nextNickname); }
    args.push(idParam);

    const updated = await pool.query(
      `UPDATE ${POSTS_TABLE}
          SET ${sets.join(', ')}
        WHERE id = $${i}
       RETURNING id, title, nickname, category, content, likes, created_at, user_id`,
      args
    );
    return res.json(updated.rows[0]);
  } catch (err) {
    console.error('[PATCH /api/posts/:id] DB error:', err);
    return res.status(500).json({ error: 'Failed to update post.' });
  }
});

// ---- Posts API: DELETE /api/posts/:id (owner only) -------------------------
app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  const idParam = req.params.id;
  if (!/^\d+$/.test(idParam)) {
    return res.status(400).json({ error: 'id must be a positive integer.' });
  }

  try {
    const owned = await pool.query(
      `SELECT id, user_id FROM ${POSTS_TABLE} WHERE id = $1`,
      [idParam]
    );
    if (owned.rowCount === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    const row = owned.rows[0];
    if (row.user_id == null) {
      return res.status(403).json({ error: 'Not your post' });
    }
    if (String(row.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not your post' });
    }

    const del = await pool.query(
      `DELETE FROM ${POSTS_TABLE} WHERE id = $1 RETURNING id`,
      [idParam]
    );
    return res.json({ id: del.rows[0].id, deleted: true });
  } catch (err) {
    console.error('[DELETE /api/posts/:id] DB error:', err);
    return res.status(500).json({ error: 'Failed to delete post.' });
  }
});

// ---- Posts API: POST /api/posts/:id/like (public) --------------------------
app.post('/api/posts/:id/like', async (req, res) => {
  const idParam = req.params.id;
  if (!/^\d+$/.test(idParam)) {
    return res.status(400).json({ error: 'id must be a positive integer.' });
  }

  try {
    const result = await pool.query(
      `UPDATE ${POSTS_TABLE}
          SET likes = likes + 1
        WHERE id = $1
       RETURNING id, title, nickname, category, content, likes, created_at, user_id`,
      [idParam]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/posts/:id/like] DB error:', err);
    res.status(500).json({ error: 'Failed to like post.' });
  }
});

// ---- Fallback error handler -------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ---- Start ------------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[server] running on http://localhost:${PORT}`);
  });
}

module.exports = app;
