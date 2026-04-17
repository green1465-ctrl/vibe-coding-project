// My ChatGPT server — serves index.html and proxies chat requests to OpenAI.
// Run with: npm start (or `node server.js`)

require('dotenv').config();
const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(express.json({ limit: '1mb' }));
// Simple CORS — allow /api/chat calls from file:// or other ports
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(__dirname));

// ---------- OpenAI client (lazy init) ----------
let openaiClient = null;
function getOpenAI() {
  if (openaiClient) return openaiClient;
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Check your .env file.');
  }
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

// ---------- Shared prompt / message building ----------
const SYSTEM_PROMPT = [
  '너는 20년 경력의 시니어 제품 디자이너다. IDEO, 애플, 다이슨 수준에서 일한 안목을 가졌고,',
  'UX, 산업 디자인, 제품 전략, 사용성, 디테일에 대해 매우 깐깐하고 냉정하게 평가한다.',
  '',
  '기본 행동: 사용자가 제품/디자인/UX/UI/아이디어/화면/포트폴리오/브랜딩 관련해 뭐든 물어보면, 반드시 답한다.',
  '정보가 부족하면 답을 거절하지 말고, 날카롭게 되물어서 필요한 정보를 끌어내라.',
  '(예: "사용자가 누군데?", "이 화면 목표가 뭐야?", "경쟁 제품은 본 거야?")',
  '',
  '말투 규칙 (한국어):',
  '- 깐깐하고 직설적인 반말. 칭찬은 인색하게, 비판은 구체적으로.',
  '- "글쎄", "그게 과연?", "그건 아니지", "디테일이 부족해", "그 정도 가지고?" 같은 표현을 자연스럽게 섞어.',
  '- 형식적 감탄/칭찬 금지 ("좋은 질문이에요" 같은 말 쓰지 마).',
  '- 근거 없는 의견 싫어함. 반드시 "왜" 그런지 이유를 설명해.',
  '- 답변 구조: [1] 핵심 문제/관찰 → [2] 구체적 지적 3-5개 → [3] 개선 방향 → [4] 참고할 제품/사례(있으면).',
  '- 코드나 스펙은 마크다운 코드 블록으로.',
  '',
  '금지: "그건 내 전문 밖이야" 같은 회피성 답변을 디자인/제품 관련 질문에 쓰지 마라.',
  '오직 수학 문제 풀이, 요리 레시피, 연애 상담처럼 디자인과 완전히 무관한 주제에만 회피를 허용한다.',
].join('\n');

function buildMessages(history, message) {
  // Normalize history: keep only valid {role, content} entries, cap to last 20.
  const safeHistory = Array.isArray(history)
    ? history
        .filter(
          (m) =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.trim().length > 0
        )
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }))
    : [];

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...safeHistory,
    { role: 'user', content: message },
  ];
}

function validateBody(body) {
  const { message } = body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return 'message is required';
  }
  return null;
}

// ---------- API: POST /api/chat (non-streaming) ----------
app.post('/api/chat', async (req, res) => {
  try {
    const err = validateBody(req.body);
    if (err) return res.status(400).json({ error: err });

    const { history, message } = req.body;
    const messages = buildMessages(history, message);

    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.8,
      max_tokens: 800,
    });

    const reply =
      (completion.choices &&
        completion.choices[0] &&
        completion.choices[0].message &&
        completion.choices[0].message.content &&
        completion.choices[0].message.content.trim()) ||
      '';

    return res.json({ reply });
  } catch (err) {
    console.error('[POST /api/chat] error:', err && err.stack ? err.stack : err);
    const msg = (err && err.message) ? err.message : 'Failed to get reply from OpenAI';
    return res.status(500).json({ error: msg });
  }
});

// ---------- API: POST /api/chat/stream (SSE) ----------
app.post('/api/chat/stream', async (req, res) => {
  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err });

  const { history, message } = req.body;
  const messages = buildMessages(history, message);

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders && res.flushHeaders();

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  let closed = false;
  // Detect client disconnect via the RESPONSE socket.
  // (req.on('close') can fire prematurely when the request body is fully received.)
  res.on('close', () => { closed = true; });

  try {
    const client = getOpenAI();
    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.8,
      max_tokens: 800,
      stream: true,
    });

    for await (const chunk of stream) {
      if (closed) break;
      const delta =
        chunk && chunk.choices && chunk.choices[0] &&
        chunk.choices[0].delta && chunk.choices[0].delta.content;
      if (delta) {
        send({ delta });
      }
    }

    if (!closed) {
      send({ done: true });
      res.end();
    }
  } catch (err) {
    console.error('[POST /api/chat/stream] error:', err && err.stack ? err.stack : err);
    const msg = (err && err.message) ? err.message : 'Failed to stream reply from OpenAI';
    if (!closed) {
      try {
        // If headers already sent (SSE started), send error as SSE event.
        if (res.headersSent) {
          send({ error: msg });
          send({ done: true });
          res.end();
        } else {
          res.status(500).json({ error: msg });
        }
      } catch (_) {
        try { res.end(); } catch (_) {}
      }
    }
  }
});

// ---------- SPA fallback: serve index.html for non-API GETs ----------
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Error handler ----------
app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------- Startup ----------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('==========================================');
    console.log(' My ChatGPT server');
    console.log(` Listening on:  http://localhost:${PORT}`);
    console.log(` Chat API:      POST http://localhost:${PORT}/api/chat`);
    console.log(` Stream API:    POST http://localhost:${PORT}/api/chat/stream`);
    console.log('==========================================');
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[warn] OPENAI_API_KEY is not set — /api/chat* will fail until you add it to .env');
    }
  });
}

module.exports = app;
