import { verifyAuth, json } from '../../_shared/auth.js';

export async function onRequestGet({ request, env }) {
  const ok = await verifyAuth(request, env);
  if (!ok) return json({ error: '로그인이 필요합니다' }, { status: 401 });

  if (!env.IMAGEKIT_PRIVATE_KEY) return json([]);

  const authHeader = 'Basic ' + btoa(env.IMAGEKIT_PRIVATE_KEY + ':');
  const r = await fetch('https://api.imagekit.io/v1/files?path=/hanastory&sort=DESC_CREATED&limit=200', {
    headers: { Authorization: authHeader },
  });
  const files = await r.json();
  if (!r.ok) return json({ error: '이미지 목록 조회 실패' }, { status: 500 });
  return json(files.map(f => ({
    filename: f.name,
    path: f.url,
    size: f.size,
    mtime: new Date(f.createdAt).getTime(),
  })));
}
