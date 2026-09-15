import { verifyAuth, json } from '../../_shared/auth.js';

export async function onRequestDelete({ request, env, params }) {
  const ok = await verifyAuth(request, env);
  if (!ok) return json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!env.IMAGES) return json({ error: '이미지 저장소가 아직 설정되지 않았습니다' }, { status: 503 });

  const filename = params.filename;
  const existing = await env.IMAGES.head(filename);
  if (!existing) return json({ error: '파일 없음' }, { status: 404 });

  await env.IMAGES.delete(filename);
  return json({ ok: true });
}
