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

  // 회사/사이트 배경 설명을 프롬프트에 넣으면 모델이 그 설명에 이끌려 "Welcome to..." 식 광고문구를
  // 새로 지어내는 문제가 반복 확인됨(문맥 오염) — 그래서 배경 설명 없이 순수 번역 지시만 준다.
  const systemPrompt = '당신은 기계적으로 정확한 번역기입니다. 입력으로 주어지는 JSON 문자열 배열의 각 원소를 '
    + '그 글자 그대로의 의미만 담아 영어로 번역하세요. 배열의 각 원소는 서로 무관한 독립된 문구일 수 있습니다. '
    + '절대로 의역하거나, 내용을 추가·요약·설명하거나, 인사말·광고문구를 새로 지어내지 마세요. '
    + '응답은 입력과 정확히 같은 개수·순서의 JSON 문자열 배열이어야 하고, 그 외의 텍스트는 절대 포함하지 마세요.';

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(texts) },
      ],
      temperature: 0,
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
