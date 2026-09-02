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

  if (!env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_URL_ENDPOINT) {
    return json({ error: '이미지킷이 아직 설정되지 않았습니다' }, { status: 503 });
  }

  const uploadForm = new FormData();
  uploadForm.append('file', file, fileName);
  uploadForm.append('fileName', fileName);
  uploadForm.append('folder', '/hanastory');

  const authHeader = 'Basic ' + btoa(env.IMAGEKIT_PRIVATE_KEY + ':');
  const r = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    headers: { Authorization: authHeader },
    body: uploadForm,
  });
  const data = await r.json();
  if (!r.ok) return json({ error: data.message || '업로드 실패' }, { status: 500 });
  return json({ ok: true, path: data.url, filename: data.name });
}
