import { json, isAdmin, unauthorized } from '../_shared/auth.js';

/* 사이트가 읽어가는 내용. D1이 아직 없거나 저장된 적이 없으면 빈 객체를 주고,
   그 경우 화면은 HTML에 들어있는 기존 내용을 그대로 쓴다(내용이 사라지지 않게). */
export async function onRequestGet({ env }) {
  if (!env.DB) return json({});
  try {
    const row = await env.DB.prepare('SELECT data FROM neo_content WHERE id = 1').first();
    return json(row ? JSON.parse(row.data) : {});
  } catch (e) {
    return json({});                      /* 조회가 실패해도 홈페이지는 기존 내용으로 계속 보이게 */
  }
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return unauthorized();
  if (!env.DB) return json({ error: '데이터베이스가 아직 연결되지 않았습니다' }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return json({ error: '잘못된 요청입니다' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: '잘못된 형식입니다' }, { status: 400 });
  }
  try {
    await env.DB.prepare(
      `INSERT INTO neo_content (id, data, updated_at) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).bind(JSON.stringify(body)).run();
    return json({ ok: true, savedAt: new Date().toISOString() });
  } catch (e) {
    return json({ error: '저장 실패: ' + e.message }, { status: 500 });
  }
}
