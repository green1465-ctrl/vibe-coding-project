require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const ImageKit = require('imagekit');
const path = require('path');
const fs = require('fs');

const app  = express();
const PORT = 3001;
const ROOT = __dirname;

/* ── 환경변수 ── */
const ADMIN_PW = process.env.ADMIN_PW || 'hana2024';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

/* ── Supabase Postgres 연결 (모듈 최상단 1회 생성 — 서버리스 warm start에서 재사용) ── */
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});
pool.on('error', (err) => console.error('DB pool idle client error:', err.message));

/* ── ImageKit (자격증명 없으면 null — 업로드 라우트에서 안내만) ── */
const imagekit = (process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT)
  ? new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    })
  : null;

/* ── 미들웨어 ── */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(ROOT));           // 로컬 실행 시 HTML/CSS/JS 파일 서빙 (Vercel에서는 정적 서빙이 대신 처리)

/* ── 이미지 업로드 설정 (메모리에 잠깐 올렸다가 바로 ImageKit으로 전송) ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },           // 20MB
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|jpg|png|gif|webp|svg)/.test(file.mimetype) || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('이미지 또는 PDF 파일만 업로드 가능합니다'));
  }
});

/* ── 인증 미들웨어 (JWT — 서버 메모리에 아무것도 저장하지 않음) ── */
function auth(req, res, next) {
  try {
    jwt.verify(req.cookies.hs_admin, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: '로그인이 필요합니다' });
  }
}

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 86400000,
};

// Supabase 연결 전 로컬 리뷰용 폴백 — DATABASE_URL이 생기면 이 경로는 더 이상 안 쓰임
const CONTENT_PATH = path.join(ROOT, 'content.json');
function readLocalContentFallback() {
  if (!fs.existsSync(CONTENT_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8')); }
  catch (e) { return {}; }
}

// 이미지킷 연결 전 로컬 리뷰용 폴백 — IMAGEKIT_* 키가 생기면 이 경로는 더 이상 안 쓰임
const IMAGES_DIR = path.join(ROOT, 'images');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
function listLocalImages() {
  if (!fs.existsSync(IMAGES_DIR)) return [];
  return fs.readdirSync(IMAGES_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
    .map(f => {
      const stat = fs.statSync(path.join(IMAGES_DIR, f));
      return { filename: f, path: `/images/${f}`, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

/* ────────────────────────────────────
   AUTH
──────────────────────────────────── */
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PW)
    return res.status(401).json({ error: '비밀번호가 틀렸습니다' });
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.cookie('hs_admin', token, cookieOpts);
  res.json({ ok: true });
});

app.post('/admin/logout', (req, res) => {
  res.clearCookie('hs_admin');
  res.json({ ok: true });
});

app.get('/admin/check', (req, res) => {
  try {
    jwt.verify(req.cookies.hs_admin, JWT_SECRET);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

/* ────────────────────────────────────
   CONTENT API (Supabase: hanastory_content 단일 행 JSONB)
   방문할 때마다 DB를 직접 조회하면 Supabase 무료 대역폭을 금방 소모하므로,
   같은 인스턴스에서는 60초간 메모리에 캐시해두고 재사용한다.
   관리자가 저장하면 캐시를 즉시 최신 데이터로 교체한다.
──────────────────────────────────── */
const CONTENT_CACHE_TTL_MS = 60 * 1000;
let contentCache = { data: null, ts: 0 };

app.get('/api/content', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json(readLocalContentFallback());
  if (contentCache.data && Date.now() - contentCache.ts < CONTENT_CACHE_TTL_MS) {
    return res.json(contentCache.data);
  }
  try {
    const { rows } = await pool.query('SELECT data FROM hanastory_content WHERE id = 1');
    const data = rows[0] ? rows[0].data : {};
    contentCache = { data, ts: Date.now() };
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: '콘텐츠 조회 실패: ' + e.message });
  }
});

app.post('/api/content', auth, async (req, res) => {
  if (!process.env.DATABASE_URL) {
    try {
      fs.writeFileSync(CONTENT_PATH, JSON.stringify(req.body, null, 2), 'utf8');
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: '저장 실패: ' + e.message });
    }
  }
  try {
    await pool.query(
      `INSERT INTO hanastory_content (id, data, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
      [req.body]
    );
    contentCache = { data: req.body, ts: Date.now() };
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '저장 실패: ' + e.message });
  }
});

/* ────────────────────────────────────
   IMAGE API — 이미지킷 설정되면 이미지킷, 아니면 로컬 images/ 폴더(리뷰용)
──────────────────────────────────── */
app.get('/api/images', auth, async (req, res) => {
  if (!imagekit) return res.json(listLocalImages());
  try {
    const files = await imagekit.listFiles({ path: '/hanastory', sort: 'DESC_CREATED', limit: 200 });
    res.json(files.map(f => ({
      filename: f.name,
      path: f.url,
      size: f.size,
      mtime: new Date(f.createdAt).getTime(),
    })));
  } catch (e) {
    res.status(500).json({ error: '이미지 목록 조회 실패: ' + e.message });
  }
});

app.post('/api/upload', auth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다' });
  const isPdf = req.file.mimetype === 'application/pdf';
  const ext = path.extname(req.file.originalname).toLowerCase();
  const base = path.basename(req.file.originalname, ext).replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
  const fileName = `${base}_${Date.now()}${ext}`;

  if (isPdf) {
    // PDF 등 자료실 첨부파일은 이미지킷(이미지 CDN) 대상이 아니라 항상 로컬 downloads/ 폴더에 저장.
    // (Vercel에 배포하면 새로 올린 파일은 유지되지 않음 — 자료실 파일은 배포 전 미리 올려두는 방식 권장)
    try {
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
      fs.writeFileSync(path.join(DOWNLOADS_DIR, fileName), req.file.buffer);
      return res.json({ ok: true, path: `/downloads/${fileName}`, filename: fileName });
    } catch (e) {
      return res.status(500).json({ error: '업로드 실패: ' + e.message });
    }
  }

  if (!imagekit) {
    // 로컬 리뷰용 폴백: images/ 폴더에 저장 (Vercel 배포본에서는 유지되지 않음 — 이미지킷 연결 전까지만 사용)
    try {
      fs.writeFileSync(path.join(IMAGES_DIR, fileName), req.file.buffer);
      return res.json({ ok: true, path: `/images/${fileName}`, filename: fileName });
    } catch (e) {
      return res.status(500).json({ error: '업로드 실패: ' + e.message });
    }
  }

  try {
    const result = await imagekit.upload({
      file: req.file.buffer.toString('base64'),
      fileName,
      folder: '/hanastory',
    });
    res.json({ ok: true, path: result.url, filename: result.name });
  } catch (e) {
    res.status(500).json({ error: '업로드 실패: ' + e.message });
  }
});

/* ────────────────────────────────────
   AI 번역 — OpenAI API 키가 없으면 안내만 (이미지킷과 동일한 패턴)
──────────────────────────────────── */
app.post('/admin/translate-batch', auth, async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI API 키가 아직 설정되지 않았습니다.' });
  }
  const texts = req.body.texts;
  if (!Array.isArray(texts) || !texts.length) {
    return res.status(400).json({ ok: false, error: '번역할 텍스트가 없습니다.' });
  }
  try {
    const prompt = '다음은 한국의 알루미늄 창호·차양·금속문 제조업체 웹사이트에 들어가는 한국어 문구 목록입니다. '
      + '각 항목을 자연스러운 영어로 번역해서, 입력과 정확히 같은 순서·같은 개수의 JSON 문자열 배열로만 응답하세요. '
      + '설명이나 다른 텍스트는 절대 포함하지 마세요.\n\n' + JSON.stringify(texts);

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: (data.error && data.error.message) || 'OpenAI 요청 실패' });
    }

    let content = data.choices[0].message.content.trim();
    content = content.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
    const translations = JSON.parse(content);

    if (!Array.isArray(translations) || translations.length !== texts.length) {
      return res.status(502).json({ ok: false, error: '번역 결과 형식이 올바르지 않습니다.' });
    }
    res.json({ ok: true, translations });
  } catch (e) {
    res.status(500).json({ ok: false, error: '번역 처리 중 오류: ' + e.message });
  }
});

app.delete('/api/images/:filename', auth, async (req, res) => {
  const filename = path.basename(req.params.filename);

  if (!imagekit) {
    const fp = path.join(IMAGES_DIR, filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: '파일 없음' });
    fs.unlinkSync(fp);
    return res.json({ ok: true });
  }

  try {
    const matches = await imagekit.listFiles({ path: '/hanastory', name: filename });
    const target = matches.find(f => f.name === filename);
    if (!target) return res.status(404).json({ error: '파일 없음' });
    await imagekit.deleteFile(target.fileId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '삭제 실패: ' + e.message });
  }
});

/* ────────────────────────────────────
   START (로컬 실행 시에만 listen — Vercel에서는 api/index.js가 app을 그대로 감싸서 씀)
──────────────────────────────────── */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('');
    console.log('══════════════════════════════════════');
    console.log('  🏠  하나스토리 홈페이지 서버 시작');
    console.log('══════════════════════════════════════');
    console.log(`  홈페이지:     http://localhost:${PORT}`);
    console.log(`  관리자 패널:  http://localhost:${PORT}/admin.html`);
    console.log(`  비밀번호:     ${ADMIN_PW}`);
    console.log(`  DB 연결:      ${process.env.DATABASE_URL ? '설정됨' : '⚠️  DATABASE_URL 없음'}`);
    console.log(`  이미지킷:     ${imagekit ? '설정됨' : '⚠️  아직 미설정 (업로드 기능 비활성)'}`);
    console.log(`  AI 번역:      ${process.env.OPENAI_API_KEY ? '설정됨' : '⚠️  아직 미설정 (AI 번역 버튼 비활성)'}`);
    console.log('══════════════════════════════════════');
    console.log('');
  });
}

module.exports = app;
