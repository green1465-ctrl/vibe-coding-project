// Friend Chat server — serves index.html and exposes an OpenAI-backed chat API.
// Run with: npm start (or `node server.js`)

require('dotenv').config();
const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(express.json({ limit: '1mb' }));
// 간단한 CORS 허용 — file:// 이나 다른 포트에서 열어도 /api/chat 호출 가능
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

// ---------- Friend persona map ----------
// 각 친구의 톤/성격을 살짝씩 다르게 — KakaoTalk 스타일 반말, 짧은 톡.
const FRIEND_PERSONAS = {
  '김민지': '밝고 애교 많은 20대 초반 여자 친구. 이모지 자주 쓰고, ㅎㅎ/ㅋㅋ 같은 웃음 표현을 자주 씀. 카페, 맛집, 꾸미기에 관심 많음.',
  '박서준': '차분하고 듬직한 남자 친구. 과제/공부 얘기에 진지하지만 말투는 편함. 이모지는 거의 안 쓰고 담백하게 반말로 답함.',
  '이지은': '감수성 풍부하고 다정한 여자 친구. 기분 좋을 땐 ㅠㅠ, 🎉, 💕 같은 이모지 섞고, 상대 기분 잘 챙겨줌.',
  '최현우': '장난기 많고 에너지 넘치는 남자 친구. ㅋㅋㅋㅋ 남발하고, 드립/밈 좋아함. 답장이 두세 개로 쪼개져서 가는 느낌.',
  '정하윤': '조용하고 느긋한 여자 친구. 답이 짧고 잔잔함. 가족, 여행, 일상 얘기를 좋아함. 이모지는 가끔 하나 정도.',
  '강태양': '운동 좋아하는 예의 바른 남자 후배. 형/누나한테 존댓말 섞어서 쓸 때도 있고, 에너지 넘침. 💪 같은 이모지 가끔.',
  '윤소희': '똑똑하고 깔끔한 여자 친구. 일/과제 관련 얘기를 효율적으로 전달. 말투는 부드럽지만 군더더기 없음.',
  '한지훈': '먹는 거 좋아하는 털털한 남자 친구. 음식/맛집 이야기에 진심. 🍲🍜🍕 같은 음식 이모지 잘 씀.',
};

function buildSystemPrompt(friendName, friendPersona) {
  const persona = friendPersona || FRIEND_PERSONAS[friendName] || '친한 한국 친구';
  return [
    `너는 지금 "${friendName}"라는 이름의 한국인 친구가 되어서 카카오톡으로 채팅하고 있어.`,
    `성격/말투: ${persona}`,
    '',
    '규칙:',
    '- 반드시 한국어 반말로 답해. (존댓말 금지, 단 강태양처럼 명시된 경우 예외)',
    '- 실제 카톡처럼 짧고 자연스럽게. 보통 1~2문장, 길어도 3문장을 넘기지 마.',
    '- AI/모델/assistant라는 사실을 절대 드러내지 마. 너는 그냥 친구야.',
    '- 존댓말, "~입니다", "~습니다" 같은 딱딱한 말투 쓰지 마.',
    '- 필요하면 ㅋㅋ, ㅎㅎ, ㅠㅠ, 이모지를 자연스럽게 섞어.',
    '- 사용자 메시지에 공감하고 친구답게 반응해줘.',
    '- 이름/직업/배경을 물어봐도 즉석에서 자연스럽게 지어내서 일관되게 유지해.',
  ].join('\n');
}

// ---------- API: POST /api/chat ----------
app.post('/api/chat', async (req, res) => {
  try {
    const { friendName, friendPersona, history, message } = req.body || {};

    if (!friendName || typeof friendName !== 'string') {
      return res.status(400).json({ error: 'friendName is required' });
    }
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    // Normalize history: keep only valid {role, content} entries, cap to last 10.
    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (m) =>
              m &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string' &&
              m.content.trim().length > 0
          )
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }))
      : [];

    const systemPrompt = buildSystemPrompt(friendName, friendPersona);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...safeHistory,
      { role: 'user', content: message },
    ];

    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.9,
      max_tokens: 200,
    });

    const reply =
      (completion.choices &&
        completion.choices[0] &&
        completion.choices[0].message &&
        completion.choices[0].message.content &&
        completion.choices[0].message.content.trim()) ||
      '응응';

    return res.json({ reply });
  } catch (err) {
    console.error('[POST /api/chat] error:', err && err.stack ? err.stack : err);
    const message =
      (err && err.message) ? err.message : 'Failed to get reply from OpenAI';
    return res.status(500).json({ error: message });
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
    console.log(' Friend Chat server');
    console.log(` Listening on: http://localhost:${PORT}`);
    console.log(` Chat API:    POST http://localhost:${PORT}/api/chat`);
    console.log('==========================================');
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[warn] OPENAI_API_KEY is not set — /api/chat will fail until you add it to .env');
    }
  });
}

module.exports = app;
