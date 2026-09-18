import { json, isAdmin, unauthorized } from '../_shared/auth.js';

const IMAGE_MAX = 12 * 1024 * 1024;       /* 사진 12MB */
const FILE_MAX = 30 * 1024 * 1024;        /* 자료실 파일 30MB */
const ALLOW = /\.(jpe?g|png|webp|gif|pdf|zip|dwg|hwp|docx?|xlsx?|pptx?)$/i;

/* 사진·자료 파일을 R2에 올린다. 폴더는 kind 로 나눈다 (gallery / files / notices) */
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return unauthorized();
  if (!env.FILES || !env.R2_PUBLIC_URL) {
    return json({ error: '파일 저장소(R2)가 아직 연결되지 않았습니다' }, { status: 503 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: '파일이 없습니다' }, { status: 400 });

  const KINDS = ['gallery', 'files', 'notices', 'certs'];
  const kind = KINDS.indexOf(form.get('kind')) >= 0 ? form.get('kind') : 'gallery';
  if (!ALLOW.test(file.name)) {
    return json({ error: '올릴 수 없는 형식입니다 (사진·PDF·문서·도면만 가능)' }, { status: 415 });
  }
  const isImage = /^image\//.test(file.type || '');
  const max = isImage ? IMAGE_MAX : FILE_MAX;
  if (file.size > max) {
    return json({ error: `파일이 너무 큽니다 (최대 ${Math.round(max / 1024 / 1024)}MB)` }, { status: 413 });
  }

  const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9가-힣._-]/g, '_').slice(0, 60) || 'file';
  const key = `${kind}/${base}_${Date.now()}${ext}`;

  const httpMetadata = { contentType: file.type || 'application/octet-stream' };
  if (!isImage) {
    /* 자료실 파일은 브라우저에서 열리지 않고 실제로 내려받아지도록 */
    httpMetadata.contentDisposition = `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`;
  }
  await env.FILES.put(key, file.stream(), { httpMetadata });

  return json({
    ok: true,
    key,
    url: `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`,
    name: file.name,
    size: file.size,
  });
}
