import { verifyAuth, json } from '../_shared/auth.js';

export async function onRequestPost({ request, env }) {
  const ok = await verifyAuth(request, env);
  if (!ok) return json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!env.OPENAI_API_KEY) {
    return json({ ok: false, error: 'OpenAI API 키가 아직 설정되지 않았습니다.' }, { status: 503 });
  }

  const { texts } = await request.json();
  if (!Array.isArray(texts) || !texts.length) {
    return json({ ok: false, error: '번역할 텍스트가 없습니다.' }, { status: 400 });
  }

  const prompt = '다음은 한국의 알루미늄 창호·차양·금속문 제조업체 웹사이트에 들어가는 한국어 문구 목록입니다. '
    + '각 항목을 자연스러운 영어로 번역해서, 입력과 정확히 같은 순서·같은 개수의 JSON 문자열 배열로만 응답하세요. '
    + '설명이나 다른 텍스트는 절대 포함하지 마세요.\n\n' + JSON.stringify(texts);

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    return json({ ok: false, error: (data.error && data.error.message) || 'OpenAI 요청 실패' }, { status: 502 });
  }

  let content = data.choices[0].message.content.trim();
  content = content.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
  let translations;
  try {
    translations = JSON.parse(content);
  } catch {
    return json({ ok: false, error: '번역 결과 파싱 실패' }, { status: 502 });
  }
  if (!Array.isArray(translations) || translations.length !== texts.length) {
    return json({ ok: false, error: '번역 결과 형식이 올바르지 않습니다.' }, { status: 502 });
  }
  return json({ ok: true, translations });
}
