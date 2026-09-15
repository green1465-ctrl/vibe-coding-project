import { verifyAuth, json } from '../_shared/auth.js';

export async function onRequestPost({ request, env }) {
  const ok = await verifyAuth(request, env);
  if (!ok) return json({ error: '로그인이 필요합니다' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('image');
  if (!file) return json({ error: '파일이 없습니다' }, { status: 400 });

  const isPdf = file.type === 'application/pdf';
  const extMatch = file.name.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
  const fileName = `${base}_${Date.now()}${ext}`;

  if (isPdf) {
    return json({ error: 'PDF 업로드는 아직 지원되지 않습니다. 자료실 파일은 배포 전 미리 올려두세요.' }, { status: 501 });
  }

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) {
    return json({ error: '파일이 너무 큽니다 (최대 10MB)' }, { status: 413 });
  }

  if (!env.IMAGES || !env.R2_PUBLIC_URL) {
    return json({ error: '이미지 저장소가 아직 설정되지 않았습니다' }, { status: 503 });
  }

  await env.IMAGES.put(fileName, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });

  return json({ ok: true, path: `${env.R2_PUBLIC_URL}/${fileName}`, filename: fileName });
}
