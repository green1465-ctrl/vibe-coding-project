import { verifyAuth, json } from '../_shared/auth.js';

const CONTENT_CACHE_TTL_MS = 60 * 1000;
let contentCache = { data: null, ts: 0 };

export async function onRequestGet({ env }) {
  if (contentCache.data && Date.now() - contentCache.ts < CONTENT_CACHE_TTL_MS) {
    return json(contentCache.data);
  }
  try {
    const row = await env.DB.prepare('SELECT data FROM hanastory_content WHERE id = 1').first();
    const data = row ? JSON.parse(row.data) : {};
    contentCache = { data, ts: Date.now() };
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
    contentCache = { data: body, ts: Date.now() };
    return json({ ok: true });
  } catch (e) {
    return json({ error: '저장 실패: ' + e.message }, { status: 500 });
  }
}
