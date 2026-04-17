// AI Nickname Generator server — serves index.html and proxies nickname
// generation requests to OpenAI.
// Run with: npm start (or `node server.js`)

require('dotenv').config();
const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3007;

// ---------- Middleware ----------
app.use(express.json({ limit: '1mb' }));
// Simple CORS — allow /api calls from file:// or other ports
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

// ---------- Prompt building ----------
const SYSTEM_PROMPT = [
  '너는 한국어 별명 생성 전문가다. 사용자의 이름, 성격, 취미, 원하는 분위기를 종합해서',
  '창의적이고 재미있고 캐릭터가 살아있는 한국어 별명을 만들어낸다.',
  '',
  '별명 스타일 가이드:',
  '- 너무 식상하거나 진부한 표현(예: "귀여운 ○○", "멋진 ○○")은 피한다.',
  '- 살짝 위트 있고, 이미지가 그려지고, 개성이 느껴지는 별명을 추구한다.',
  '- 구체적인 명사/동사/상황을 섞어 장면이 떠오르게 한다.',
  '  예시: "춤추는 코딩 요정", "은하수 사냥꾼", "심야의 라면 철학자",',
  '       "새벽 3시의 시인", "빵굽는 해적", "고양이 좀비 마스터".',
  '- 2~6어절 정도의 한국어로, 발음이 입에 붙게.',
  '- 사용자의 취미와 성격을 은유적으로 녹여낸다.',
  '',
  '분위기(style) 반영 규칙:',
  '- "귀엽게": 말랑하고 사랑스럽고 작은 이미지. 동물/디저트/의성어를 섞어도 좋다.',
  '- "멋있게": 쿨하고 스타일리시, 약간 시크하거나 카리스마 있는 톤.',
  '- "웃기게": 허를 찌르는 유머, 과장, 엉뚱한 조합. 피식 웃게 만들 것.',
  '- "시적으로": 감각적이고 은유적인 이미지, 계절/자연/밤/빛 같은 모티프.',
  '- "신비롭게": 환상적이고 몽환적인 분위기, 우주/심해/마법/고대 이미지.',
  '- "장난스럽게": 친근하고 짓궂은 톤, 말장난, 가벼운 리듬감.',
  '지정된 분위기가 있다면 모든 별명에 그 톤을 강하게 반영한다.',
  '',
  '출력 형식:',
  '반드시 아래 JSON 스키마에 정확히 맞춰 응답한다. 다른 텍스트, 설명, 마크다운, 코드블록 금지.',
  '{ "nicknames": ["별명1", "별명2", "별명3", ...] }',
  '배열에는 서로 겹치지 않는 N개의 별명 문자열만 담는다.',
].join('\n');

function buildUserPrompt({ name, personalities, hobbies, style, count }) {
  const safeName = (name || '').toString().trim() || '(이름 미입력)';
  const safePersonalities = Array.isArray(personalities)
    ? personalities.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
    : [];
  const safeHobbies = Array.isArray(hobbies)
    ? hobbies.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
    : [];
  const safeStyle = (style || '').toString().trim() || '자유롭게';
  const safeCount = Number.isFinite(count) && count > 0 && count <= 20 ? Math.floor(count) : 8;

  return [
    `다음 사용자에게 어울리는 한국어 별명을 정확히 ${safeCount}개 만들어줘.`,
    '',
    `- 이름: ${safeName}`,
    `- 성격 키워드: ${safePersonalities.length ? safePersonalities.join(', ') : '(미입력)'}`,
    `- 취미: ${safeHobbies.length ? safeHobbies.join(', ') : '(미입력)'}`,
    `- 원하는 분위기: ${safeStyle}`,
    '',
    '서로 다른 각도/이미지/단어를 쓰되, 모두 같은 분위기를 유지할 것.',
    `반드시 JSON으로만 응답: {"nicknames": [...${safeCount}개...]}`,
  ].join('\n');
}

function validateBody(body) {
  const { name, personalities, hobbies, style } = body || {};
  const hasName = typeof name === 'string' && name.trim().length > 0;
  const hasPersonalities = Array.isArray(personalities) && personalities.length > 0;
  const hasHobbies = Array.isArray(hobbies) && hobbies.length > 0;
  const hasStyle = typeof style === 'string' && style.trim().length > 0;

  // At least one signal should be provided. Otherwise the model has nothing to work with.
  if (!hasName && !hasPersonalities && !hasHobbies && !hasStyle) {
    return 'At least one of name, personalities, hobbies, or style is required';
  }
  return null;
}

function normalizeNicknames(raw, count) {
  // Accept a variety of shapes the model might produce and normalize to string[].
  let list = [];
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.nicknames)) list = raw.nicknames;
    else if (Array.isArray(raw.nickname)) list = raw.nickname;
    else if (Array.isArray(raw.results)) list = raw.results;
    else if (Array.isArray(raw.data)) list = raw.data;
  }
  if (Array.isArray(raw)) list = raw;

  const cleaned = list
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return (item.nickname || item.name || item.value || '').toString().trim();
      }
      return '';
    })
    .filter((s) => s.length > 0);

  // De-duplicate while preserving order.
  const seen = new Set();
  const unique = [];
  for (const n of cleaned) {
    if (!seen.has(n)) {
      seen.add(n);
      unique.push(n);
    }
  }

  if (Number.isFinite(count) && count > 0) {
    return unique.slice(0, count);
  }
  return unique;
}

// ---------- API: POST /api/generate-nicknames ----------
app.post('/api/generate-nicknames', async (req, res) => {
  try {
    const err = validateBody(req.body);
    if (err) return res.status(400).json({ error: err });

    const { name, personalities, hobbies, style, count } = req.body;
    const desiredCount =
      Number.isFinite(count) && count > 0 && count <= 20 ? Math.floor(count) : 8;
    const userPrompt = buildUserPrompt({
      name,
      personalities,
      hobbies,
      style,
      count: desiredCount,
    });

    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    });

    const content =
      (completion.choices &&
        completion.choices[0] &&
        completion.choices[0].message &&
        completion.choices[0].message.content) ||
      '';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.error('[generate-nicknames] JSON parse failed. raw =', content);
      return res.status(502).json({ error: 'Invalid JSON from model' });
    }

    const nicknames = normalizeNicknames(parsed, desiredCount);
    if (!nicknames.length) {
      return res.status(502).json({ error: 'Model returned no nicknames' });
    }

    return res.json({ nicknames });
  } catch (err) {
    console.error(
      '[POST /api/generate-nicknames] error:',
      err && err.stack ? err.stack : err
    );
    const msg =
      err && err.message ? err.message : 'Failed to generate nicknames from OpenAI';
    return res.status(500).json({ error: msg });
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
    console.log(' AI Nickname Generator server');
    console.log(` Listening on:  http://localhost:${PORT}`);
    console.log(` API:           POST http://localhost:${PORT}/api/generate-nicknames`);
    console.log('==========================================');
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        '[warn] OPENAI_API_KEY is not set — /api/generate-nicknames will fail until you add it to .env'
      );
    }
  });
}

module.exports = app;
