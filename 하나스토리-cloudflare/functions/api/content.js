import { verifyAuth, json } from '../_shared/auth.js';

// 메모리 캐시를 쓰지 않는다: Cloudflare Workers는 요청마다 다른 isolate(격리된 실행 환경)로 라우팅될 수 있어서,
// 모듈 전역 변수에 캐싱하면 "관리자에서 저장 → 홈페이지 새로고침"이 다른 isolate로 가는 순간
// 그 isolate가 들고 있던 예전 캐시를 최대 캐시시간만큼(또는 그 이상, isolate가 재사용되는 동안 계속) 보여주는 문제가 생긴다.
// D1 조회 자체가 충분히 빠르고 트래픽도 적은 사이트라, 매번 최신값을 직접 읽는 쪽이 안전하다.
export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare('SELECT data FROM hanastory_content WHERE id = 1').first();
    const data = row ? JSON.parse(row.data) : {};
    return json(data);
  } catch (e) {
    return json({ error: '콘텐츠 조회 실패: ' + e.message }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  const ok = await verifyAuth(request, env);
  if (!ok) return json({ error: '로그인이 필요합니다' }, { status: 401 });

  const body = await request.json();
  try {
    await env.DB.prepare(
      `INSERT INTO hanastory_content (id, data, updated_at) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).bind(JSON.stringify(body)).run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: '저장 실패: ' + e.message }, { status: 500 });
  }
}
