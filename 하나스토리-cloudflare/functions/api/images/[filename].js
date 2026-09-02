import { verifyAuth, json } from '../../_shared/auth.js';

export async function onRequestDelete({ request, env, params }) {
  const ok = await verifyAuth(request, env);
  if (!ok) return json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!env.IMAGEKIT_PRIVATE_KEY) return json({ error: '이미지킷이 아직 설정되지 않았습니다' }, { status: 503 });

  const filename = params.filename;
  const authHeader = 'Basic ' + btoa(env.IMAGEKIT_PRIVATE_KEY + ':');

  const listR = await fetch(
    `https://api.imagekit.io/v1/files?path=/hanastory&name=${encodeURIComponent(filename)}`,
    { headers: { Authorization: authHeader } }
  );
  const matches = await listR.json();
  const target = Array.isArray(matches) ? matches.find(f => f.name === filename) : null;
  if (!target) return json({ error: '파일 없음' }, { status: 404 });

  const delR = await fetch(`https://api.imagekit.io/v1/files/${target.fileId}`, {
    method: 'DELETE',
    headers: { Authorization: authHeader },
  });
  if (!delR.ok) return json({ error: '삭제 실패' }, { status: 500 });
  return json({ ok: true });
}
